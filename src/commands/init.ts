import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { CONFIG_FILENAME, defaultConfig } from "../core/config.js";
import { run as runBinary } from "../core/exec.js";
import { assertValidProjectName, toKebabCase, toPascalCase } from "../core/naming.js";
import { defineCommand } from "../plugins/api.js";
import { renderTree, templatesRoot } from "../templates/engine.js";

/** Types and build tooling. Versions are resolved by npm, never hardcoded. */
const DEV_DEPENDENCIES = [
	"typescript",
	"roblox-ts",
	"@rbxts/types",
	"@rbxts/compiler-types",
	"rbxts-transformer-flamework",
];

const DEPENDENCIES = ["@flamework/core", "@flamework/components"];

export const initCommand = defineCommand({
	name: "init",
	description: "Create a ready-to-run Roblox project (roblox-ts + Flamework + Rojo).",
	arguments: [{ name: "name", description: "project name, also used as the directory name" }],
	options: [
		{ flags: "--path <dir>", description: "parent directory to create the project in" },
		{ flags: "--no-install", description: "skip installing npm dependencies" },
		{ flags: "--no-git", description: "skip git repository initialisation" },
		{ flags: "-f, --force", description: "allow a target directory that is not empty" },
	],
	async run(context) {
		const rawName = context.args["name"];
		if (typeof rawName !== "string") {
			throw new RoworkError("Missing project name.", { hint: "Usage: rowork init <name>" });
		}

		assertValidProjectName(rawName);

		const displayName = toPascalCase(rawName);
		const packageName = toKebabCase(rawName);
		const parent =
			typeof context.options["path"] === "string"
				? resolve(context.cwd, context.options["path"])
				: context.cwd;
		const target = join(parent, rawName);

		if (existsSync(target) && readdirSync(target).length > 0 && context.options["force"] !== true) {
			throw new RoworkError(`Directory ${target} already exists and is not empty.`, {
				hint: "Re-run with --force to write into it anyway.",
			});
		}

		context.logger.info(`Creating ${pc.bold(displayName)} in ${target}`);

		mkdirSync(target, { recursive: true });

		context.logger.step("scaffolding project structure");
		renderTree(join(templatesRoot(), "init"), target, {
			name: displayName,
			packageName,
			roworkVersion: context.roworkVersion,
		});

		context.logger.step(`writing ${CONFIG_FILENAME}`);
		writeFileSync(
			join(target, CONFIG_FILENAME),
			`${JSON.stringify(defaultConfig(displayName), undefined, 2)}\n`,
			"utf8",
		);

		if (context.options["git"] !== false) {
			context.logger.step("initialising git repository");
			try {
				await runBinary("git", ["init", "--quiet"], { cwd: target, stdio: "ignore" });
			} catch {
				// git missing or failing is not fatal: the project is still usable.
				context.logger.warn("git init failed, skipping.");
			}
		}

		if (context.options["install"] !== false) {
			context.logger.step("installing dependencies (npm)");
			context.logger.blank();
			await runBinary("npm", ["install", "--save-dev", ...DEV_DEPENDENCIES], { cwd: target });
			await runBinary("npm", ["install", ...DEPENDENCIES], { cwd: target });
		}

		context.logger.blank();
		context.logger.success(`${displayName} is ready.`);
		context.logger.blank();
		context.logger.info("Next steps:");
		context.logger.info(`  cd ${rawName}`);
		if (context.options["install"] === false) context.logger.info("  npm install");
		context.logger.info("  rokit install        # install Rojo at the pinned version");
		context.logger.info("  npm run watch        # compile TypeScript continuously");
		context.logger.info("  rojo serve           # then connect the Rojo plugin in Studio");
		context.logger.blank();
	},
});
