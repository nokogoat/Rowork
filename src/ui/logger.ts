import pc from "picocolors";

import type { Logger } from "../plugins/api.js";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const SEVERITY: Record<LogLevel, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
	currentLevel = level;
}

function allowed(level: Exclude<LogLevel, "silent">): boolean {
	return SEVERITY[level] <= SEVERITY[currentLevel];
}

/**
 * Diagnostics go to stderr, never to stdout: stdout stays reserved for output
 * meant to be piped (lists, paths, JSON).
 */
function write(line: string): void {
	process.stderr.write(`${line}\n`);
}

export const logger: Logger = {
	debug(message) {
		if (allowed("debug")) write(`${pc.dim("debug")} ${pc.dim(message)}`);
	},
	info(message) {
		if (allowed("info")) write(message);
	},
	success(message) {
		if (allowed("info")) write(`${pc.green("done")}  ${message}`);
	},
	step(message) {
		if (allowed("info")) write(`${pc.dim("  -")} ${message}`);
	},
	warn(message) {
		if (allowed("warn")) write(`${pc.yellow("warn")}  ${message}`);
	},
	error(message) {
		if (allowed("error")) write(`${pc.red("error")} ${message}`);
	},
	blank() {
		if (allowed("info")) write("");
	},
};
