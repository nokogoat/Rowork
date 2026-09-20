import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { runningRecord, stopProcess, clearRecord } from "../core/background.js";
import { CONFIG_FILENAME } from "../core/config.js";
import { run as runBinary } from "../core/exec.js";
import { isOnPlainPath } from "../core/toolchain.js";
import { defineCommand } from "../plugins/api.js";
import { answered, isInteractive, prompts } from "../ui/prompt.js";
import { requireProject } from "./make.js";

/** What `rowork dev` runs, written as plain npm scripts. */
function replacementScripts(rojoProject: string): Record<string, string> {
	return {
		// npm runs `predev` first: the same "compile once so Rojo has something to
		// serve" that `rowork dev` does before starting the watchers.
		predev: "rbxtsc",
		dev: [
			"concurrently -k -n compile,rojo,sourcemap",
			'"rbxtsc -w"',
			`"rojo serve ${rojoProject}"`,
			`"rojo sourcemap ${rojoProject} --output sourcemap.json --watch"`,
		].join(" "),
	};
}

function indentOf(source: string): string | number {
	return /^\t/m.test(source) ? "\t" : 2;
}

export const ejectCommand = defineCommand({
	name: "eject",
	description: "Leave Rowork: keep a project that runs with plain tools, and remove Rowork's files.",
	options: [
		{ flags: "--yes", description: "do not ask for confirmation" },
		{ flags: "--dry-run", description: "show what would change, and change nothing" },
		{ flags: "--no-install", description: "do not install `concurrently` (the dev script needs it)" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "eject");
		const manifestPath = join(root, "package.json");

		if (!existsSync(manifestPath)) {
			throw new RoworkError("No package.json to update.", {
				hint: "Eject rewrites the `dev` script of package.json.",
			});
		}

		const manifestSource = readFileSync(manifestPath, "utf8");
		const manifest = JSON.parse(manifestSource) as { scripts?: Record<string, string> };
		const scripts = manifest.scripts ?? {};
		const wanted = replacementScripts(config.paths.rojoProject);

		// Only replace a `dev` script that is Rowork's own. A script the user wrote
		// or edited is theirs, and eject must not overwrite it.
		const devIsRowork = scripts["dev"] === undefined || /^rowork(\s|$)/.test(scripts["dev"]);
		const changes: string[] = [];
		if (devIsRowork) {
			changes.push('package.json: `dev` becomes "concurrently" running rbxtsc -w, rojo serve and rojo sourcemap');
			changes.push("package.json: adds `predev` (one build first, so Rojo can start)");
			changes.push("package.json: adds `concurrently` to devDependencies");
		} else {
			changes.push(`package.json: keeps your own \`dev\` script ("${scripts["dev"]}")`);
		}

		const readmePath = join(root, "README.md");
		const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
		const readmeChanges = /rowork dev/.test(readme);
		if (readmeChanges) changes.push("README.md: `rowork dev` becomes `npm run dev`");
		changes.push(`${CONFIG_FILENAME}: removed`);
		if (existsSync(join(root, ".rowork"))) changes.push(".rowork/: removed (background dev pid and log)");

		const record = runningRecord(root);
		if (record !== undefined) changes.push(`stops the background rowork dev (pid ${record.pid})`);

		context.logger.info(pc.bold("Ejecting will:"));
		for (const change of changes) context.logger.step(change);
		context.logger.blank();
		context.logger.info(pc.dim("Your source code, default.project.json, tsconfig.json and rokit.toml are not touched."));
		context.logger.info(pc.dim("Generated code never imports Rowork, so it keeps working as is."));
		context.logger.blank();

		if (context.options["dryRun"] === true) {
			context.logger.info("Dry run: nothing was changed.");
			return;
		}

		if (context.options["yes"] !== true) {
			if (!isInteractive()) {
				throw new RoworkError("`rowork eject` asks for confirmation.", {
					hint: "Outside a terminal, add --yes (and --dry-run first to preview).",
				});
			}
			const confirmed = answered(
				await prompts.confirm({
					message: "Leave Rowork? `rowork` commands stop working in this project.",
					initialValue: false,
				}),
			);
			if (!confirmed) {
				prompts.cancel("Nothing changed.");
				return;
			}
		}

		if (record !== undefined) {
			await stopProcess(record.pid);
			clearRecord(root);
		}

		if (devIsRowork) {
			manifest.scripts = { ...scripts, ...wanted };
			writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, indentOf(manifestSource))}\n`, "utf8");

			if (context.options["install"] !== false) {
				context.logger.step("installing concurrently (npm)");
				context.logger.blank();
				await runBinary("npm", ["install", "--save-dev", "concurrently"], { cwd: root });
			} else {
				context.logger.warn("Skipped installing `concurrently`: run `npm install --save-dev concurrently` before `npm run dev`.");
			}
		}

		if (readmeChanges) writeFileSync(readmePath, readme.replace(/rowork dev/g, "npm run dev"), "utf8");

		rmSync(join(root, ".rowork"), { recursive: true, force: true });
		rmSync(join(root, CONFIG_FILENAME), { force: true });

		context.logger.blank();
		context.logger.success("Ejected. This project no longer needs Rowork.");
		// Rowork also looked in ~/.rokit/bin on its own. Plain npm scripts will not.
		if (!isOnPlainPath("rojo")) {
			context.logger.blank();
			context.logger.warn("`rojo` is not on your PATH, so `npm run dev` will not find it.");
			context.logger.info("Add Rokit's directory to your PATH (~/.rokit/bin, or %USERPROFILE%\\.rokit\\bin on Windows) and reopen the terminal.");
		}

		context.logger.blank();
		context.logger.info("Run it with:  npm run dev");
		context.logger.info("Build once:   npm run build");
	},
});
