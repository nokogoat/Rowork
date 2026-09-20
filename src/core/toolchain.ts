import { accessSync, constants, statSync } from "node:fs";
import { createServer } from "node:net";
import { delimiter, join } from "node:path";

import { rokitBinDirectory } from "./rokit-installer.js";

/** Where a tool comes from, which decides the advice given when it is missing. */
export type ToolSource = "npm" | "rokit";

export interface ToolRequirement {
	/** Executable name, without any Windows extension. */
	command: string;
	source: ToolSource;
}

/** PATH as the orchestrated tools will see it: project binaries first. */
export function searchPath(projectRoot: string): string[] {
	const current = process.env["PATH"] ?? "";
	// Rokit's own directory comes last: right after a self-install the current
	// shell has not picked up the PATH change yet, and it should not need to.
	return [
		join(projectRoot, "node_modules", ".bin"),
		...current.split(delimiter),
		rokitBinDirectory(),
	].filter(
		(entry) => entry.length > 0,
	);
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function isExecutable(path: string): boolean {
	if (!isFile(path)) return false;
	if (process.platform === "win32") return true;
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Looks a tool up on PATH without running it.
 *
 * Running `--version` would be more thorough, but it starts a real process per
 * check, and a lookup is enough to turn `spawn rojo ENOENT` into an actionable
 * message. On Windows the shims are `.cmd` files, hence PATHEXT.
 */
export function findExecutable(command: string, projectRoot: string): string | undefined {
	const extensions =
		process.platform === "win32"
			? ["", ...(process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)]
			: [""];

	for (const directory of searchPath(projectRoot)) {
		for (const extension of extensions) {
			const candidate = join(directory, `${command}${extension}`);
			if (isExecutable(candidate)) return candidate;
		}
	}
	return undefined;
}

export function findMissing(
	requirements: readonly ToolRequirement[],
	projectRoot: string,
): ToolRequirement[] {
	return requirements.filter(
		(requirement) => findExecutable(requirement.command, projectRoot) === undefined,
	);
}

/** One line of advice per missing tool, grouped by where the fix lives. */
export function installAdvice(missing: readonly ToolRequirement[]): string {
	const lines: string[] = [];

	if (missing.some((tool) => tool.source === "npm")) {
		lines.push("Run `npm install` in the project (provides roblox-ts).");
	}
	if (missing.some((tool) => tool.source === "rokit")) {
		lines.push(
			"Run `rokit install` in the project (provides Rojo). Rokit itself: https://github.com/rojo-rbx/rokit",
			"If Rokit is installed but the tool is still not found, add ~/.rokit/bin to your PATH and reopen the terminal.",
		);
	}
	return lines.join("\n      ");
}

/** PATH string with the project's own binaries first, the way npm scripts see it. */
export function pathWithLocalBinaries(projectRoot: string): string {
	return searchPath(projectRoot).join(delimiter);
}

/** True when nothing is listening on the local port, checked by trying to take it. */
export function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => server.close(() => resolve(true)));
		server.listen(port, "127.0.0.1");
	});
}

/**
 * True when `command` is on the plain PATH, the way a shell or an npm script
 * sees it: no project binaries first, and none of Rowork's own fallback
 * directories. Once a project has left Rowork, that is the only lookup left.
 */
export function isOnPlainPath(command: string): boolean {
	const extensions =
		process.platform === "win32"
			? ["", ...(process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)]
			: [""];
	return (process.env["PATH"] ?? "")
		.split(delimiter)
		.filter((entry) => entry.length > 0)
		.some((directory) => extensions.some((extension) => isExecutable(join(directory, `${command}${extension}`))));
}
