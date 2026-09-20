import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { RoworkConfig } from "../plugins/api.js";
import { resolveProjectPath } from "./config.js";
import { findBlock, type StatType } from "./schema-edit.js";

export interface StatInfo {
	name: string;
	type: StatType;
}

export interface EventInfo {
	name: string;
	/** `server`: the client sends it to the server. `client`: the server sends it to clients. */
	direction: "server" | "client";
	parameters: string;
}

function read(root: string, file: string): string | undefined {
	try {
		return readFileSync(resolveProjectPath(root, file), "utf8");
	} catch {
		return undefined;
	}
}

/**
 * What already exists in the project, read from the files themselves.
 *
 * The lists offered by "link it to..." questions come from here rather than from
 * a registry Rowork would have to keep in sync: whatever is in PlayerData.ts and
 * networking.ts is what can be linked, even after the user edited them. A file
 * that cannot be read gives an empty list, never an error.
 */
export function listStats(root: string, config: RoworkConfig): StatInfo[] {
	const source = read(root, `${config.paths.shared}/data/PlayerData.ts`);
	if (source === undefined) return [];
	const block = findBlock(source, /export\s+interface\s+PlayerData\s*\{/);
	if (block === undefined) return [];

	return [...source.slice(block.start, block.end).matchAll(/^\s*(\w+)\s*:\s*(number|string|boolean)\s*;/gm)].map((match) => ({
		name: match[1] as string,
		type: match[2] as StatType,
	}));
}

export function listEvents(root: string, config: RoworkConfig): EventInfo[] {
	const source = read(root, `${config.paths.shared}/networking.ts`);
	if (source === undefined) return [];

	const events: EventInfo[] = [];
	for (const [direction, opening] of [
		["server", /interface\s+ClientToServerEvents\s*\{/],
		["client", /interface\s+ServerToClientEvents\s*\{/],
	] as const) {
		const block = findBlock(source, opening);
		if (block === undefined) continue;
		for (const match of source.slice(block.start, block.end).matchAll(/^\s*(\w+)\s*\(([^)]*)\)\s*:\s*void\s*;/gm)) {
			events.push({ direction, name: match[1] as string, parameters: (match[2] as string).trim() });
		}
	}
	return events;
}

export function pascal(name: string): string {
	return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** The helper service `make:stat` creates for a value, if it is there. */
export function statServiceClass(root: string, config: RoworkConfig, stat: string): string | undefined {
	const className = `${pascal(stat)}Service`;
	return existsSync(join(resolveProjectPath(root, config.paths.services), `${className}.ts`)) ? className : undefined;
}
