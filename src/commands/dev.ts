import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { run as runBinary } from "../core/exec.js";
import {
	clearDashboardRecord,
	clearRecord,
	DAEMON_ENV,
	logFile,
	isAlive,
	runDirectory,
	runningDashboard,
	runningRecord,
	spawnBackground,
	tailLog,
	writeDashboardRecord,
	writeRecord,
} from "../core/background.js";
import { openBrowser } from "../dashboard/open.js";
import { startDashboard, type RunningDashboard } from "../dashboard/server.js";
import { findStoreRojoPlugin, needsStudioSetup, warnAboutStorePlugin } from "../core/studio.js";
import { readRojoPin, rojoIsAtLeast } from "../core/versions.js";
import { findMissing, isPortFree, pathWithLocalBinaries, installAdvice, type ToolRequirement } from "../core/toolchain.js";
import { defineCommand, type CommandContext } from "../plugins/api.js";
import { Supervisor, type TaskDefinition } from "../process/supervisor.js";

export const devCommand = defineCommand({
	name: "dev",
	description: "Run the compiler, the Rojo server and the sourcemap watcher together.",
	options: [
		{ flags: "--no-compile", description: "skip the roblox-ts compiler" },
		{ flags: "--no-rojo", description: "skip the Rojo server" },
		{ flags: "--no-sourcemap", description: "skip the sourcemap watcher" },
		{ flags: "--port <port>", description: "port for the Rojo server" },
		{ flags: "-d, --detach", description: "run in the background; stop with `rowork dev:stop`" },
		{ flags: "--no-dashboard", description: "do not start the local web dashboard" },
		{ flags: "--open", description: "open the dashboard in your browser" },
	],
	async run(context) {
		const { projectRoot, config } = context;

		if (projectRoot === undefined || config === undefined) {
			throw new RoworkError("`rowork dev` must run inside a Rowork project.", {
				hint: "No rowork.json found here or in any parent directory. Create one with `rowork init <name>`.",
			});
		}

		const isDaemon = process.env[DAEMON_ENV] !== undefined;
		const already = isDaemon ? undefined : runningRecord(projectRoot);
		if (already !== undefined) {
			throw new RoworkError(`\`rowork dev\` is already running for this project (pid ${already.pid}).`, {
				hint: "Stop it with `rowork dev:stop`, or read what it prints with `rowork dev:logs`.",
			});
		}

		const rojoProject = resolveProjectPath(projectRoot, config.paths.rojoProject);
		if (!existsSync(rojoProject)) {
			throw new RoworkError(`Rojo project file not found: ${config.paths.rojoProject}`, {
				hint: "Check `paths.rojoProject` in rowork.json.",
			});
		}

		if (!existsSync(join(projectRoot, "node_modules"))) {
			throw new RoworkError("Dependencies are not installed.", {
				hint: "Run `npm install` first.",
			});
		}

		const tasks: TaskDefinition[] = [];

		if (context.options["compile"] !== false) {
			tasks.push({ name: "compile", command: "rbxtsc", args: ["-w"], paint: pc.cyan });
		}

		if (context.options["rojo"] !== false) {
			const args = ["serve", config.paths.rojoProject];
			const port = context.options["port"];
			if (typeof port === "string") args.push("--port", port);
			tasks.push({ name: "rojo", command: "rojo", args, paint: pc.magenta });
		}

		if (context.options["sourcemap"] !== false) {
			// The Flamework transformer resolves instance paths through the Rojo
			// project, and roblox-ts tooling reads sourcemap.json. Keeping it
			// regenerated automatically removes a whole class of "works on my
			// machine" path errors.
			tasks.push({
				name: "sourcemap",
				command: "rojo",
				args: ["sourcemap", config.paths.rojoProject, "--output", "sourcemap.json", "--watch"],
				paint: pc.blue,
			});
		}

		// Fail before anything starts, with the fix, instead of letting each task
		// die separately with a bare `spawn ENOENT` buried in the unified log.
		const required: ToolRequirement[] = [];
		if (context.options["compile"] !== false) required.push({ command: "rbxtsc", source: "npm" });
		if (context.options["rojo"] !== false || context.options["sourcemap"] !== false) {
			required.push({ command: "rojo", source: "rokit" });
		}
		const missing = findMissing(required, projectRoot);
		if (missing.length > 0) {
			throw new RoworkError(
				`Missing tool${missing.length > 1 ? "s" : ""}: ${missing.map((tool) => tool.command).join(", ")}.`,
				{ hint: installAdvice(missing) },
			);
		}

		// Rojo's own report of a busy port is a 15-line "Rojo crashed" that also
		// takes the compiler down. The usual cause is a previous `rowork dev` that
		// is still running, so say so, before anything starts.
		if (context.options["rojo"] !== false) {
			const rawPort = context.options["port"];
			const port = typeof rawPort === "string" ? Number(rawPort) : 34872;
			if (!Number.isInteger(port) || port < 1 || port > 65535) {
				throw new RoworkError(`\`${String(rawPort)}\` is not a valid port.`, {
					hint: "Use a number between 1 and 65535, e.g. --port 34873",
				});
			}
			if (!(await isPortFree(port))) {
				throw new RoworkError(`Port ${port} is already in use.`, {
					hint: [
						"Another `rowork dev` (or Rojo) is probably still running, for example in a terminal you closed.",
						`Find it: ${process.platform === "win32" ? `netstat -ano | findstr :${port}` : `ss -ltnp | grep ${port}   (or: lsof -i :${port})`}`,
						`Or use another port: rowork dev --port ${port + 1}`,
					].join("\n      "),
				});
			}
		}

		// The Creator Store plugin lags behind Rojo's releases: with Rojo 7.7 or newer it fails
		// with a misleading "Can't parse JSON". Say so before the user loses time on it.
		if (needsStudioSetup() && rojoIsAtLeast(readRojoPin(projectRoot), 7, 7) && findStoreRojoPlugin() !== undefined) {
			warnAboutStorePlugin(context.logger);
		}

		await ensureInitialBuild(context, projectRoot, config.paths.out);

		if (tasks.length === 0) {
			throw new RoworkError("Every task was disabled, nothing left to run.");
		}

		if (context.options["detach"] === true && !isDaemon) {
			await startInBackground(context, projectRoot);
			return;
		}

		context.logger.info(`${pc.bold(config.name)} ${pc.dim(projectRoot)}`);
		for (const task of tasks) {
			context.logger.step(`${task.paint(task.name)} ${pc.dim(`${task.command} ${task.args.join(" ")}`)}`);
		}
		context.logger.info(pc.dim("Press Ctrl+C to stop everything."));
		context.logger.blank();

		// The output goes to a file too, so the dashboard and `dev:logs` see what a terminal sees.
		// (Detached, the process's own output already IS that file.)
		let logStream: ReturnType<typeof createWriteStream> | undefined;
		if (!isDaemon) {
			mkdirSync(runDirectory(projectRoot), { recursive: true });
			logStream = createWriteStream(logFile(projectRoot), { flags: "w" });
			writeRecord(projectRoot, {
				pid: process.pid,
				startedAt: new Date().toISOString(),
				port: typeof context.options["port"] === "string" ? Number(context.options["port"]) : 34872,
				mode: "foreground",
			});
		}

		let dashboard: RunningDashboard | undefined;
		if (context.options["dashboard"] !== false) {
			try {
				dashboard = await startDashboard({ projectRoot, roworkVersion: context.roworkVersion, port: 0 });
				writeDashboardRecord(projectRoot, { pid: process.pid, port: dashboard.port, url: dashboard.url });
				context.logger.info(`Dashboard: ${pc.bold(dashboard.url)}`);
				context.logger.info(pc.dim("  Only this computer can reach it. Do not share the address: it carries a secret token."));
				if (context.options["open"] === true && !isDaemon) openBrowser(dashboard.url);
			} catch (error) {
				// The dashboard is a convenience: never let it stop the game from being built.
				context.logger.warn(`The dashboard did not start: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		// However this ends, leave no record of a process that is gone.
		process.once("exit", () => {
			clearRecord(projectRoot);
			clearDashboardRecord(projectRoot);
		});

		const supervisor = new Supervisor({
			tasks,
			cwd: projectRoot,
			logger: context.logger,
			...(logStream === undefined ? {} : { onOutput: (text: string) => logStream?.write(text) }),
		});
		const code = await supervisor.run();

		await dashboard?.close();
		logStream?.end();
		clearRecord(projectRoot);
		clearDashboardRecord(projectRoot);

		if (code !== 0) process.exitCode = code;
	},
});

/**
 * Rojo refuses to start when a `$path` in the project file does not exist yet,
 * and on a fresh clone `out/` and `include/` only appear once roblox-ts has
 * compiled. Starting all tasks at once therefore kills Rojo instantly and takes
 * everything else down with it. One blocking build first removes that race.
 */
async function ensureInitialBuild(
	context: CommandContext,
	projectRoot: string,
	outDirectory: string,
): Promise<void> {
	if (context.options["compile"] === false) return;
	if (existsSync(join(projectRoot, outDirectory)) && existsSync(join(projectRoot, "include"))) return;

	context.logger.info("First run: compiling once so Rojo has something to serve...");
	try {
		await runBinary("rbxtsc", [], {
			cwd: projectRoot,
			env: { PATH: pathWithLocalBinaries(projectRoot) },
		});
	} catch (cause) {
		throw new RoworkError("The initial build failed.", {
			hint: "Fix the compiler errors above, then run `rowork dev` again.",
			cause,
		});
	}
	context.logger.blank();
}

/**
 * Relaunches `rowork dev` detached from this terminal.
 *
 * Every check and the first build already ran in the foreground, so their
 * errors are visible here instead of ending up in a log nobody is reading.
 */
async function startInBackground(context: CommandContext, projectRoot: string): Promise<void> {
	const script = process.argv[1];
	if (script === undefined) throw new RoworkError("Cannot find the Rowork entry point to relaunch.");

	const args: string[] = [];
	for (const flag of ["compile", "rojo", "sourcemap", "dashboard"]) {
		if (context.options[flag] === false) args.push(`--no-${flag}`);
	}
	const port = context.options["port"];
	if (typeof port === "string") args.push("--port", port);

	const pid = spawnBackground(projectRoot, script, args);
	writeRecord(projectRoot, {
		pid,
		startedAt: new Date().toISOString(),
		port: typeof port === "string" ? Number(port) : 34872,
		mode: "background",
	});

	// A task that cannot start dies within a second or two: wait for that, so a
	// failure is reported now with its cause rather than discovered later.
	for (let waited = 0; waited < 4000; waited += 200) {
		await new Promise((resolve) => setTimeout(resolve, 200));
		if (!isAlive(pid)) {
			clearRecord(projectRoot);
			for (const line of tailLog(projectRoot, 15)) context.logger.info(pc.dim(`  ${line}`));
			throw new RoworkError("`rowork dev` stopped right after starting in the background.", {
				hint: `Full output: ${logFile(projectRoot)}`,
			});
		}
	}

	context.logger.success(`rowork dev is running in the background (pid ${pid}).`);
	context.logger.info(`  Output:  rowork dev:logs   (add -f to follow)`);
	context.logger.info(`  Stop it: rowork dev:stop`);

	// The background process starts its dashboard a moment after itself.
	if (context.options["dashboard"] !== false) {
		for (let waited = 0; waited < 3000; waited += 200) {
			const running = runningDashboard(projectRoot);
			if (running !== undefined) {
				context.logger.info(`  Dashboard: ${pc.bold(running.url)}`);
				if (context.options["open"] === true) openBrowser(running.url);
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
}
