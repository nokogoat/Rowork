import { createRequire } from "node:module";
import { resolve } from "node:path";

import pc from "picocolors";

import { isRoworkError } from "./cli/errors.js";
import { createProgram } from "./cli/program.js";
import { CommandRegistry } from "./cli/registry.js";
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
 * Pre-lecture des options globales.
 *
 * Commander ne les expose qu'une fois le parsing lance, or il faut connaitre
 * `--cwd` et `--no-plugins` AVANT de construire les commandes, puisque les
 * plugins en ajoutent.
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

export async function run(argv: string[]): Promise<void> {
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
			// Une config cassee ne doit pas rendre la CLI inutilisable : `rowork --help`
			// et les commandes hors projet doivent continuer de repondre.
			logger.warn(error instanceof Error ? error.message : String(error));
		}
	}

	if (pluginsEnabled) {
		await loadPlugins({ registry, projectRoot, config, cwd, roworkVersion: version });
	} else {
		logger.debug("Chargement des plugins desactive (--no-plugins).");
	}

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

	logger.error("Erreur interne de Rowork. Merci d'ouvrir une issue avec la trace ci-dessous.");
	console.error(error);
	process.exit(1);
}
