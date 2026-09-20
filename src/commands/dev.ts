import { existsSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { run as runBinary } from "../core/exec.js";
import { findMissing, pathWithLocalBinaries, installAdvice, type ToolRequirement } from "../core/toolchain.js";
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
	],
	async run(context) {
		const { projectRoot, config } = context;

		if (projectRoot === undefined || config === undefined) {
			throw new RoworkError("`rowork dev` must run inside a Rowork project.", {
				hint: "No rowork.json found here or in any parent directory. Create one with `rowork init <name>`.",
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

		await ensureInitialBuild(context, projectRoot, config.paths.out);

		if (tasks.length === 0) {
			throw new RoworkError("Every task was disabled, nothing left to run.");
		}

		context.logger.info(`${pc.bold(config.name)} ${pc.dim(projectRoot)}`);
		for (const task of tasks) {
			context.logger.step(`${task.paint(task.name)} ${pc.dim(`${task.command} ${task.args.join(" ")}`)}`);
		}
		context.logger.info(pc.dim("Press Ctrl+C to stop everything."));
		context.logger.blank();

		const supervisor = new Supervisor({ tasks, cwd: projectRoot, logger: context.logger });
		const code = await supervisor.run();

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
