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

/**
 * The Rojo version to use: the one forced by `ROWORK_ROJO_VERSION` if set (a team
 * that wants every project on the same version, and no lookup), otherwise the
 * newest release, or undefined when GitHub cannot be reached. GitHub allows 60
 * anonymous requests per hour per address, so a shared network can hit its limit:
 * the caller then falls back with a warning.
 */
export async function latestRojoVersion(): Promise<string | undefined> {
	const forced = process.env["ROWORK_ROJO_VERSION"]?.trim().replace(/^v/, "");
	if (forced !== undefined && /^\d+\.\d+\.\d+/.test(forced)) return forced;

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

/** True when `version` (like "7.7.0") is at least `major.minor`. An unknown version is not. */
export function rojoIsAtLeast(version: string | undefined, major: number, minor: number): boolean {
	if (version === undefined) return false;
	const [m = 0, n = 0] = version.split(".").map(Number);
	return m > major || (m === major && n >= minor);
}
