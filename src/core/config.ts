import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { ROWORK_PLUGIN_API_VERSION, type RoworkConfig } from "../plugins/api.js";

export const CONFIG_FILENAME = "rowork.json";

/** Remonte l'arborescence jusqu'a trouver un rowork.json. */
export function findProjectRoot(from: string): string | undefined {
	let current = resolve(from);
	const { root } = parse(current);

	for (;;) {
		if (existsSync(join(current, CONFIG_FILENAME))) return current;
		if (current === root) return undefined;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

export function loadConfig(projectRoot: string): RoworkConfig {
	const file = join(projectRoot, CONFIG_FILENAME);

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch (cause) {
		throw new RoworkError(`${CONFIG_FILENAME} est illisible ou mal forme.`, {
			hint: `Verifie la syntaxe JSON de ${file}.`,
			cause,
		});
	}

	if (typeof parsed !== "object" || parsed === null) {
		throw new RoworkError(`${CONFIG_FILENAME} doit contenir un objet JSON.`);
	}

	const config = parsed as RoworkConfig;

	// Avertissement, pas erreur : une version de contrat differente ne doit jamais
	// empecher l'utilisateur de lancer ses commandes.
	if (config.roworkApiVersion !== ROWORK_PLUGIN_API_VERSION) {
		throw new RoworkError(
			`Ce projet cible l'API Rowork v${String(config.roworkApiVersion)}, cette CLI fournit la v${ROWORK_PLUGIN_API_VERSION}.`,
			{ hint: "Mets a jour Rowork, ou ajuste `roworkApiVersion` dans rowork.json." },
		);
	}

	return config;
}

export function defaultConfig(name: string): RoworkConfig {
	return {
		name,
		roworkApiVersion: ROWORK_PLUGIN_API_VERSION,
		language: "roblox-ts",
		paths: {
			source: "src",
			out: "out",
			rojoProject: "default.project.json",
			services: "src/server/services",
			controllers: "src/client/controllers",
			shared: "src/shared",
		},
		plugins: [],
	};
}

/** Resout un chemin de la config par rapport a la racine du projet. */
export function resolveProjectPath(projectRoot: string, path: string): string {
	return isAbsolute(path) ? path : resolve(projectRoot, path);
}
