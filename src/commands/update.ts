import { readFileSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { run as runBinary } from "../core/exec.js";
import { pinnedTypescriptVersion } from "../core/scaffold.js";
import {
	findStudioDataDirectories,
	installRojoPlugin,
	isVinegarInstalled,
	needsStudioSetup,
} from "../core/studio.js";
import { findExecutable } from "../core/toolchain.js";
import {
	baseVersion,
	latestNpmVersion,
	latestRojoVersion,
	readRojoPin,
	writeRojoPin,
} from "../core/versions.js";
import { defineCommand } from "../plugins/api.js";
import { answered, isInteractive, prompts } from "../ui/prompt.js";
import { requireProject } from "./make.js";

interface NpmChange {
	name: string;
	from: string;
	to: string;
	dev: boolean;
}

export const updateCommand = defineCommand({
	name: "update",
	description: "Move the project to the latest Rojo, npm packages and Studio plugin.",
	guided: true,
	options: [
		{ flags: "--dry-run", description: "show what would change and change nothing" },
		{ flags: "--yes", description: "do not ask for confirmation" },
		{ flags: "--no-npm", description: "leave the npm packages alone" },
		{ flags: "--no-build", description: "do not compile afterwards to check the result" },
	],
	async run(context) {
		const { root } = requireProject(context, "update");
		const { logger } = context;

		// ---- what is behind
		const rojoNow = readRojoPin(root);
		const rojoLatest = await latestRojoVersion();
		const rojoBehind = rojoNow !== undefined && rojoLatest !== undefined && rojoNow !== rojoLatest;

		const npmChanges: NpmChange[] = [];
		if (context.options["npm"] !== false) {
			const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			const groups: [Record<string, string> | undefined, boolean][] = [
				[manifest.dependencies, false],
				[manifest.devDependencies, true],
			];
			for (const [packages, dev] of groups) {
				for (const [name, range] of Object.entries(packages ?? {})) {
					// roblox-ts pins one exact TypeScript and patches it: it is set from roblox-ts below.
					if (name === "typescript") continue;
					const latest = latestNpmVersion(name);
					if (latest !== undefined && baseVersion(range) !== latest) {
						npmChanges.push({ name, from: baseVersion(range), to: latest, dev });
					}
				}
			}
		}

		if (rojoLatest === undefined) logger.warn("Could not look up the latest Rojo (is GitHub reachable?): skipping it.");

		if (!rojoBehind && npmChanges.length === 0) {
			logger.success("Everything is already up to date.");
			return;
		}

		logger.info(pc.bold("Updates available:"));
		if (rojoBehind) logger.step(`Rojo  ${pc.dim(rojoNow ?? "")} -> ${pc.green(rojoLatest ?? "")}  (rokit.toml, and the Studio plugin)`);
		for (const change of npmChanges) logger.step(`${change.name}  ${pc.dim(change.from)} -> ${pc.green(change.to)}`);
		logger.blank();

		if (context.options["dryRun"] === true) {
			logger.info("Dry run: nothing was changed.");
			return;
		}

		if (context.options["yes"] !== true) {
			if (!isInteractive()) {
				throw new RoworkError("`rowork update` asks for confirmation.", {
					hint: "Outside a terminal, add --yes (and --dry-run first to preview).",
				});
			}
			const confirmed = answered(
				await prompts.confirm({
					message: "Apply these updates? (commit or back up your project first: `git diff` shows what changed)",
					initialValue: true,
				}),
			);
			if (!confirmed) {
				prompts.cancel("Nothing changed.");
				return;
			}
		}

		// ---- Rojo
		// All or nothing. A pin that names a Rojo that is not installed breaks
		// `rowork dev` (the Rokit shim has nothing to run), so the pin only stays
		// changed if the install worked, and the Studio plugin, which must match
		// the server, is only touched then too.
		let rojoMoved = false;
		if (rojoBehind && rojoLatest !== undefined && rojoNow !== undefined) {
			writeRojoPin(root, rojoLatest);
			const rokit = findExecutable("rokit", root);

			if (rokit === undefined) {
				// No Rokit means no shim to break: keep the pin, the user installs later.
				rojoMoved = true;
				logger.step(`rokit.toml now pins Rojo ${rojoLatest}`);
				logger.warn("Rokit was not found: install it, then run `rokit install` to get the new Rojo.");
			} else {
				try {
					await runBinary(rokit, ["trust", "rojo-rbx/rojo"], { cwd: root, stdio: "ignore" });
					await runBinary(rokit, ["install"], { cwd: root });
					rojoMoved = true;
					logger.step(`Rojo ${rojoLatest} installed and pinned in rokit.toml`);
				} catch {
					writeRojoPin(root, rojoNow);
					logger.warn(`Could not install Rojo ${rojoLatest} (usually a network problem): kept ${rojoNow}, so your project still works.`);
					logger.info("Run `rowork update` again later. The Studio plugin was left as it is, to keep matching your Rojo.");
					process.exitCode = 1;
				}
			}
		}

		// ---- npm packages
		if (npmChanges.length > 0) {
			for (const dev of [false, true]) {
				const names = npmChanges.filter((change) => change.dev === dev).map((change) => `${change.name}@latest`);
				if (names.length === 0) continue;
				logger.step(`installing ${names.length} ${dev ? "dev " : ""}package${names.length > 1 ? "s" : ""} (npm)`);
				await runBinary("npm", ["install", ...(dev ? ["--save-dev"] : []), ...names], { cwd: root });
			}

			// roblox-ts may now want a different TypeScript.
			const typescript = pinnedTypescriptVersion(root);
			if (typescript !== undefined) {
				await runBinary("npm", ["install", "--save-dev", `typescript@${typescript}`], { cwd: root });
			}
		}

		// ---- Studio plugin: it must match the Rojo server
		if (rojoMoved) {
			if (needsStudioSetup()) {
				const directories = findStudioDataDirectories();
				if (isVinegarInstalled() && directories.length > 0) {
					try {
						await installRojoPlugin(directories, root, logger);
						logger.info("Restart Studio to load the new plugin. If the toolbar shows two Rojo buttons, remove the older one in Plugins > Manage Plugins.");
					} catch (error) {
						logger.warn(`Could not update the Rojo plugin: ${error instanceof Error ? error.message : String(error)}. Run \`rowork studio:setup\`.`);
					}
				} else {
					logger.warn("Studio's Rojo plugin was not updated (Studio has not been launched yet). Run `rowork studio:setup` after launching it.");
				}
			} else if (findExecutable("rojo", root) !== undefined) {
				try {
					await runBinary("rojo", ["plugin", "install"], { cwd: root });
					logger.info("Restart Studio to load the new plugin.");
				} catch {
					logger.warn("`rojo plugin install` did not finish. Run it yourself, then restart Studio.");
				}
			}
		}

		// ---- did it break anything?
		if (context.options["build"] !== false && npmChanges.length > 0) {
			logger.step("compiling to check the updated packages");
			try {
				await runBinary("npm", ["run", "build"], { cwd: root });
				logger.success("Updated, and the project still compiles.");
			} catch {
				logger.blank();
				logger.warn("The project does not compile with the updated packages.");
				logger.info("A newer package changed something. `git diff package.json` shows what moved; `git checkout package.json package-lock.json && npm install` goes back.");
				process.exitCode = 1;
			}
		} else {
			logger.success("Updated.");
		}
	},
});
