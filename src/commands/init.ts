import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { CONFIG_FILENAME, defaultConfig } from "../core/config.js";
import { run as runBinary } from "../core/exec.js";
import { assertValidProjectName, toKebabCase, toPascalCase } from "../core/naming.js";
import { defineCommand } from "../plugins/api.js";
import { renderTree, templatesRoot } from "../templates/engine.js";

/** Compiler and type packages. Versions are resolved by npm, never hardcoded. */
const COMPILER_DEPENDENCIES = [
	"roblox-ts",
	"@rbxts/types",
	"@rbxts/compiler-types",
	"rbxts-transformer-flamework",
];

const RUNTIME_DEPENDENCIES = ["@flamework/core", "@flamework/components"];

/**
 * Reads the exact TypeScript version roblox-ts pins.
 *
 * roblox-ts depends on one exact TypeScript version and patches it. Installing
 * `typescript` on its own pulls whatever is newest, which is almost never that
 * version: Flamework then warns on every single compile that the versions
 * differ. Deriving it from roblox-ts keeps the guarantee that Rowork hardcodes
 * no versions while still producing a coherent install.
 */
function pinnedTypescriptVersion(projectRoot: string): string | undefined {
	try {
		const manifest = JSON.parse(
			readFileSync(join(projectRoot, "node_modules", "roblox-ts", "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };

		const range = manifest.dependencies?.["typescript"];
		// roblox-ts writes an exact pin such as "=5.5.3".
		return range === undefined ? undefined : range.replace(/^=/, "");
	} catch {
		return undefined;
	}
}

export const initCommand = defineCommand({
	name: "init",
	description: "Create a ready-to-run Roblox project (roblox-ts + Flamework + Rojo).",
	arguments: [{ name: "name", description: "project name, also used as the directory name" }],
	options: [
		{ flags: "--path <dir>", description: "parent directory to create the project in" },
		{ flags: "--no-install", description: "skip installing npm dependencies" },
		{ flags: "--no-rokit", description: "skip installing the pinned Roblox toolchain" },
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

		const installed = context.options["install"] !== false;
		if (installed) {
			context.logger.step("installing dependencies (npm)");
			context.logger.blank();

			await runBinary("npm", ["install", "--save-dev", ...COMPILER_DEPENDENCIES], { cwd: target });

			const typescript = pinnedTypescriptVersion(target);
			if (typescript === undefined) {
				context.logger.warn(
					"Could not read the TypeScript version roblox-ts pins, installing the latest instead. Expect a version warning on compile.",
				);
				await runBinary("npm", ["install", "--save-dev", "typescript"], { cwd: target });
			} else {
				context.logger.step(`pinning typescript@${typescript} to match roblox-ts`);
				await runBinary("npm", ["install", "--save-dev", `typescript@${typescript}`], {
					cwd: target,
				});
			}

			await runBinary("npm", ["install", ...RUNTIME_DEPENDENCIES], { cwd: target });
		}

		const toolchain = context.options["rokit"] !== false;
		let toolchainReady = false;
		if (toolchain) {
			context.logger.step("installing the pinned Roblox toolchain (rokit)");
			try {
				await runBinary("rokit", ["install"], { cwd: target });
				toolchainReady = true;
			} catch {
				context.logger.warn(
					"rokit install did not succeed. Install Rokit from https://github.com/rojo-rbx/rokit, then run `rokit install` in the project.",
				);
			}
		}

		context.logger.blank();
		context.logger.success(`${displayName} is ready.`);
		context.logger.blank();
		context.logger.info("Next steps:");
		context.logger.info(`  cd ${rawName}`);
		if (!installed) context.logger.info("  npm install");
		if (!toolchainReady) context.logger.info("  rokit install");
		context.logger.info(`  ${pc.bold("rowork dev")}`);
		context.logger.blank();
	},
});
