import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { ROWORK_PLUGIN_API_VERSION, type RoworkConfig } from "../plugins/api.js";

export const CONFIG_FILENAME = "rowork.json";

/** Walks up the directory tree until a rowork.json is found. */
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
		throw new RoworkError(`${CONFIG_FILENAME} is unreadable or malformed.`, {
			hint: `Check the JSON syntax of ${file}.`,
			cause,
		});
	}

	if (typeof parsed !== "object" || parsed === null) {
		throw new RoworkError(`${CONFIG_FILENAME} must contain a JSON object.`);
	}

	const config = parsed as RoworkConfig;

	if (config.roworkApiVersion !== ROWORK_PLUGIN_API_VERSION) {
		throw new RoworkError(
			`This project targets Rowork API v${String(config.roworkApiVersion)}, this CLI provides v${ROWORK_PLUGIN_API_VERSION}.`,
			{ hint: "Update Rowork, or adjust `roworkApiVersion` in rowork.json." },
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

/** Resolves a config path relative to the project root. */
export function resolveProjectPath(projectRoot: string, path: string): string {
	return isAbsolute(path) ? path : resolve(projectRoot, path);
}
