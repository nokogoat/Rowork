import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getRelease } from "./github-release.js";

/**
 * Used only when GitHub cannot be reached while creating a project (offline,
 * rate limited). It is the one version Rowork writes down itself, so the weekly
 * upstream check reports it when it falls behind.
 */
export const FALLBACK_ROJO_VERSION = "7.7.0";

/** The newest Rojo release, or undefined when GitHub cannot be reached. */
export async function latestRojoVersion(): Promise<string | undefined> {
	try {
		return (await getRelease("rojo-rbx/rojo")).tag_name.replace(/^v/, "");
	} catch {
		return undefined;
	}
}

/** The newest version of an npm package, or undefined if the registry cannot be reached. */
export function latestNpmVersion(name: string): string | undefined {
	const result = spawnSync("npm", ["view", name, "version"], {
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	const version = result.stdout.trim();
	return result.status === 0 && version !== "" ? version : undefined;
}

const ROJO_LINE = /^(\s*rojo\s*=\s*"rojo-rbx\/rojo@)([^"]+)(")/m;

export function readRojoPin(projectRoot: string): string | undefined {
	try {
		return ROJO_LINE.exec(readFileSync(join(projectRoot, "rokit.toml"), "utf8"))?.[2];
	} catch {
		return undefined;
	}
}

/** Rewrites the Rojo version in rokit.toml, leaving the rest of the file alone. */
export function writeRojoPin(projectRoot: string, version: string): boolean {
	const file = join(projectRoot, "rokit.toml");
	const source = readFileSync(file, "utf8");
	if (!ROJO_LINE.test(source)) return false;
	writeFileSync(file, source.replace(ROJO_LINE, `$1${version}$3`), "utf8");
	return true;
}

/** `^3.0.0` and `~1.2.3` both mean `3.0.0` / `1.2.3` for comparison. */
export function baseVersion(range: string): string {
	return range.replace(/^[\^~>=<\s]+/, "");
}
