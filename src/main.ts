import { createRequire } from "node:module";
import { resolve } from "node:path";

import pc from "picocolors";

import { isRoworkError } from "./cli/errors.js";
import { createProgram } from "./cli/program.js";
import { CommandRegistry, setActiveRegistry } from "./cli/registry.js";
import { findProjectRoot, loadConfig } from "./core/config.js";
import { coreCommands } from "./commands/index.js";
import { loadPlugins } from "./plugins/loader.js";
import type { RoworkConfig } from "./plugins/api.js";
import { logger, setLogLevel } from "./ui/logger.js";

const require = createRequire(import.meta.url);

function roworkVersion(): string {
	try {
		return (require("../package.json") as { version: string }).version;
	} catch {
		return "0.0.0";
	}
}

/**
 * Pre-reads the global flags.
 *
 * Commander only exposes them once parsing has started, but we need `--cwd`
 * and `--no-plugins` BEFORE building the command list, since plugins add to it.
 */
function readGlobalFlags(argv: string[]): { cwd: string; plugins: boolean } {
	let cwd = process.cwd();
	let plugins = true;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--cwd") {
			const value = argv[index + 1];
			if (value !== undefined) cwd = resolve(value);
		} else if (token !== undefined && token.startsWith("--cwd=")) {
			cwd = resolve(token.slice("--cwd=".length));
		} else if (token === "--no-plugins") {
			plugins = false;
		} else if (token === "--verbose") {
			setLogLevel("debug");
		} else if (token === "--quiet") {
			setLogLevel("error");
		}
	}

	return { cwd, plugins };
}

/**
 * Lets `rowork -d dev` mean `rowork dev -d`.
 *
 * Commander would treat a `-d` before the command as a global option, which
 * does not exist. It is moved to just after the command name instead.
 */
export function hoistDetach(argv: string[]): string[] {
	const head = argv.slice(0, 2);
	const rest = argv.slice(2);
	let detach = false;
	const kept: string[] = [];
	let commandIndex = -1;

	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index] as string;
		if (commandIndex === -1 && (token === "-d" || token === "--detach")) {
			detach = true;
			continue;
		}
		kept.push(token);
		if (commandIndex === -1 && token === "--cwd") {
			// The value of --cwd is not the command.
			const value = rest[index + 1];
			if (value !== undefined) {
				kept.push(value);
				index += 1;
			}
		} else if (commandIndex === -1 && !token.startsWith("-")) {
			commandIndex = kept.length - 1;
		}
	}

	if (detach && commandIndex !== -1) kept.splice(commandIndex + 1, 0, "--detach");
	else if (detach) kept.push("--detach");
	return [...head, ...kept];
}

export async function run(rawArgv: string[]): Promise<void> {
	const argv = hoistDetach(rawArgv);
	const version = roworkVersion();
	const { cwd, plugins: pluginsEnabled } = readGlobalFlags(argv.slice(2));

	const registry = new CommandRegistry();
	for (const definition of coreCommands) {
		registry.register(definition, { kind: "core" });
	}

	const projectRoot = findProjectRoot(cwd);

	let config: RoworkConfig | undefined;
	if (projectRoot !== undefined) {
		try {
			config = loadConfig(projectRoot);
		} catch (error) {
			// A broken config must not make the CLI unusable: `rowork --help` and
			// project-independent commands have to keep working.
			logger.warn(error instanceof Error ? error.message : String(error));
		}
	}

	if (pluginsEnabled) {
		await loadPlugins({ registry, projectRoot, config, cwd, roworkVersion: version });
	} else {
		logger.debug("Plugin loading disabled (--no-plugins).");
	}

	setActiveRegistry(registry);
	const program = createProgram({ registry, cwd, projectRoot, config, roworkVersion: version });

	try {
		await program.parseAsync(argv);
	} catch (error) {
		reportFailure(error);
	}
}

function reportFailure(error: unknown): never {
	if (isRoworkError(error)) {
		logger.error(error.message);
		if (error.hint !== undefined) {
			process.stderr.write(`${pc.dim("      " + error.hint)}\n`);
		}
		process.exit(error.exitCode);
	}

	logger.error("Internal Rowork error. Please open an issue with the trace below.");
	console.error(error);
	process.exit(1);
}
