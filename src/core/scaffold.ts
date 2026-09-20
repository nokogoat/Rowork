import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import type { Logger } from "../plugins/api.js";
import { renderTree, templatesRoot } from "../templates/engine.js";
import { syncAgentDocs } from "./agent-docs.js";
import { CONFIG_FILENAME, defaultConfig } from "./config.js";
import { run as runBinary } from "./exec.js";
import { installRokit } from "./rokit-installer.js";
import { findExecutable } from "./toolchain.js";
import { FALLBACK_ROJO_VERSION, latestRojoVersion } from "./versions.js";
import { assertValidProjectName, toKebabCase, toPascalCase } from "./naming.js";

/** Compiler and type packages. Versions are resolved by npm, never hardcoded. */
const COMPILER_DEPENDENCIES = [
	"roblox-ts",
	"@rbxts/types",
	"@rbxts/compiler-types",
	"rbxts-transformer-flamework",
];

/** Tools listed in the generated rokit.toml. */
const TRUSTED_TOOLS = ["rojo-rbx/rojo"];

const RUNTIME_DEPENDENCIES = ["@flamework/core", "@flamework/components"];

/** Files that only exist to demonstrate the architecture. */
const EXAMPLE_FILES = [
	join("src", "server", "services", "ExampleService.ts"),
	join("src", "client", "controllers", "ExampleController.ts"),
];

export interface ScaffoldOptions {
	/** Project name as typed by the user; also the directory name. */
	name: string;
	/** Directory that will contain the project directory. */
	parent: string;
	install: boolean;
	rokit: boolean;
	/** Download and install Rokit itself when it is not on the machine. */
	installRokit: boolean;
	git: boolean;
	/** Keep the example service and controller. */
	examples: boolean;
	/** Write into a directory that is not empty. */
	force: boolean;
	roworkVersion: string;
}

export interface ScaffoldResult {
	target: string;
	displayName: string;
	installed: boolean;
	toolchainReady: boolean;
}

/**
 * Reads the exact TypeScript version roblox-ts pins.
 *
 * roblox-ts depends on one exact TypeScript version and patches it. Installing
 * `typescript` on its own pulls whatever is newest, which is almost never that
 * version: Flamework then warns on every single compile that the versions
 * differ. Deriving it from roblox-ts keeps the guarantee that Rowork hardcodes
 * no versions while still producing a coherent install.
 */
export function pinnedTypescriptVersion(projectRoot: string): string | undefined {
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

/** Validates the target before anything is written, so a refusal leaves no trace. */
export function resolveTarget(options: Pick<ScaffoldOptions, "name" | "parent" | "force">): string {
	assertValidProjectName(options.name);
	const target = join(options.parent, options.name);

	if (existsSync(target) && readdirSync(target).length > 0 && !options.force) {
		throw new RoworkError(`Directory ${target} already exists and is not empty.`, {
			hint: "Re-run with --force to write into it anyway.",
		});
	}
	return target;
}

/** Shared by `rowork init` (flags) and `rowork start` (questions). */
export async function scaffoldProject(
	options: ScaffoldOptions,
	logger: Logger,
): Promise<ScaffoldResult> {
	const target = resolveTarget(options);
	const displayName = toPascalCase(options.name);

	logger.info(`Creating ${displayName} in ${target}`);
	mkdirSync(target, { recursive: true });

	// Like the npm packages, Rojo is created at its newest version: nothing here
	// is a version Rowork wrote down, unless GitHub cannot be reached.
	let rojoVersion = await latestRojoVersion();
	if (rojoVersion === undefined) {
		rojoVersion = FALLBACK_ROJO_VERSION;
		logger.warn(`Could not look up the latest Rojo, using ${rojoVersion}. \`rowork update\` moves to the newest later.`);
	}

	logger.step("scaffolding project structure");
	renderTree(join(templatesRoot(), "init"), target, {
		rojoVersion,
		name: displayName,
		packageName: toKebabCase(options.name),
		roworkVersion: options.roworkVersion,
	});

	if (!options.examples) {
		for (const file of EXAMPLE_FILES) rmSync(join(target, file), { force: true });
		// Flamework only discovers what exists, but Rojo and git both need the
		// directories to survive being empty.
		for (const file of EXAMPLE_FILES) {
			const directory = dirname(join(target, file));
			mkdirSync(directory, { recursive: true });
			writeFileSync(join(directory, ".gitkeep"), "", "utf8");
		}
	}

	logger.step(`writing ${CONFIG_FILENAME}`);
	const config = defaultConfig(displayName);
	writeFileSync(join(target, CONFIG_FILENAME), `${JSON.stringify(config, undefined, 2)}\n`, "utf8");

	logger.step("writing AGENTS.md (instructions for AIs and newcomers)");
	syncAgentDocs(target, config, options.roworkVersion);

	if (options.git) {
		logger.step("initialising git repository");
		try {
			await runBinary("git", ["init", "--quiet"], { cwd: target, stdio: "ignore" });
		} catch {
			// git missing or failing is not fatal: the project is still usable.
			logger.warn("git init failed, skipping.");
		}
	}

	if (options.install) {
		logger.step("installing dependencies (npm)");
		logger.blank();

		await runBinary("npm", ["install", "--save-dev", ...COMPILER_DEPENDENCIES], { cwd: target });

		const typescript = pinnedTypescriptVersion(target);
		if (typescript === undefined) {
			logger.warn(
				"Could not read the TypeScript version roblox-ts pins, installing the latest instead. Expect a version warning on compile.",
			);
			await runBinary("npm", ["install", "--save-dev", "typescript"], { cwd: target });
		} else {
			logger.step(`pinning typescript@${typescript} to match roblox-ts`);
			await runBinary("npm", ["install", "--save-dev", `typescript@${typescript}`], {
				cwd: target,
			});
		}

		await runBinary("npm", ["install", ...RUNTIME_DEPENDENCIES], { cwd: target });
	}

	let toolchainReady = false;
	if (options.rokit) {
		try {
			let rokit = findExecutable("rokit", target);
			if (rokit === undefined && options.installRokit) rokit = await installRokit(logger);
			if (rokit === undefined) throw new RoworkError("Rokit is not installed.");

			logger.step("installing the pinned Roblox toolchain (rokit install)");
			// Rokit refuses tools it has not been told to trust, and would ask
			// interactively. Only the tools Rowork itself writes to rokit.toml are
			// trusted here, never whatever a later edit adds.
			for (const tool of TRUSTED_TOOLS) {
				await runBinary(rokit, ["trust", tool], { cwd: target, stdio: "ignore" });
			}
			await runBinary(rokit, ["install"], { cwd: target });
			toolchainReady = true;
		} catch (error) {
			if (error instanceof Error) logger.debug(error.message);
			logger.warn(
				"rokit install did not succeed. Install Rokit from https://github.com/rojo-rbx/rokit, then run `rokit install` in the project.",
			);
		}
	}

	return { target, displayName, installed: options.install, toolchainReady };
}
