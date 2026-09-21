import { spawn as spawnDetached, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Set in the background process, so it knows to clean up after itself. */
export const DAEMON_ENV = "ROWORK_DEV_DAEMON";

export interface DevRecord {
	pid: number;
	startedAt: string;
	port: number;
	/** In a terminal of its own, or detached with `dev -d`. Older records have none. */
	mode?: "foreground" | "background";
}

export interface DashboardRecord {
	pid: number;
	port: number;
	/** The address WITH its secret token: this file is as private as the token itself. */
	url: string;
}

export function runDirectory(projectRoot: string): string {
	return join(projectRoot, ".rowork", "run");
}

const pidFile = (root: string): string => join(runDirectory(root), "dev.pid");
export const logFile = (root: string): string => join(runDirectory(root), "dev.log");

export function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM means the process exists but belongs to someone else.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

/**
 * Guards against a recycled PID: after a reboot, an old pid file could name an
 * unrelated process, and `dev:stop` must never signal that. Where `ps` exists
 * the command line must mention rowork; Windows has no cheap equivalent, so
 * there the liveness check alone applies.
 */
function looksLikeRowork(pid: number): boolean {
	if (process.platform === "win32") return true;
	const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
	if (result.status !== 0) return true;
	return /rowork/i.test(result.stdout);
}

export function readRecord(projectRoot: string): DevRecord | undefined {
	try {
		return JSON.parse(readFileSync(pidFile(projectRoot), "utf8")) as DevRecord;
	} catch {
		return undefined;
	}
}

export function writeRecord(projectRoot: string, record: DevRecord): void {
	mkdirSync(runDirectory(projectRoot), { recursive: true });
	writeFileSync(pidFile(projectRoot), `${JSON.stringify(record)}\n`, "utf8");
}

export function clearRecord(projectRoot: string): void {
	rmSync(pidFile(projectRoot), { force: true });
}

/** The background `rowork dev` of this project, if one is really running. */
export function runningRecord(projectRoot: string): DevRecord | undefined {
	const record = readRecord(projectRoot);
	if (record === undefined) return undefined;
	if (!isAlive(record.pid) || !looksLikeRowork(record.pid)) {
		clearRecord(projectRoot); // stale: the process is gone
		return undefined;
	}
	return record;
}

/** Last `lines` lines of the background log. */
export function tailLog(projectRoot: string, lines: number): string[] {
	if (!existsSync(logFile(projectRoot))) return [];
	return readFileSync(logFile(projectRoot), "utf8").split("\n").filter(Boolean).slice(-lines);
}

/**
 * Starts `rowork dev` detached from this terminal and returns its pid.
 *
 * A session and process group of its own on POSIX, so closing the terminal
 * neither reaches it nor stops it; no console window on Windows.
 */
export function spawnBackground(projectRoot: string, script: string, args: string[]): number {
	mkdirSync(runDirectory(projectRoot), { recursive: true });
	const log = openSync(logFile(projectRoot), "w");

	const child = spawnDetached(process.execPath, [script, "--cwd", projectRoot, "dev", ...args], {
		cwd: projectRoot,
		detached: true,
		stdio: ["ignore", log, log],
		env: { ...process.env, [DAEMON_ENV]: "1" },
		windowsHide: true,
	});
	child.unref();
	closeSync(log);

	if (child.pid === undefined) throw new Error("could not start the background process");
	return child.pid;
}

/** Stops the process and everything it started. Returns false if it had to be forced. */
export async function stopProcess(pid: number): Promise<boolean> {
	if (process.platform === "win32") {
		// The tasks are children of the supervisor: taskkill /T takes the whole tree.
		await new Promise<void>((resolve) => {
			const killer = spawnDetached("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
			killer.on("error", () => resolve());
			killer.on("close", () => resolve());
		});
		return true;
	}

	// SIGTERM lets the supervisor stop each task's process tree itself.
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return true;
	}
	for (let waited = 0; waited < 10000; waited += 100) {
		if (!isAlive(pid)) return true;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// Gone in the meantime.
	}
	return false;
}

const dashboardFile = (root: string): string => join(runDirectory(root), "dashboard.json");

/**
 * Remembers the dashboard that is running, so `rowork dev -d` can print its address
 * and `rowork dashboard` can open it instead of starting a second one.
 *
 * The address holds the secret token, so the file is readable by its owner only
 * (mode 0600; on Windows the user profile already is private) and lives in
 * `.rowork/run/`, which the generated .gitignore excludes.
 */
export function writeDashboardRecord(root: string, record: DashboardRecord): void {
	mkdirSync(runDirectory(root), { recursive: true });
	writeFileSync(dashboardFile(root), `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function clearDashboardRecord(root: string): void {
	rmSync(dashboardFile(root), { force: true });
}

/** The dashboard of this project, if its process is really alive. A stale record is removed. */
export function runningDashboard(root: string): DashboardRecord | undefined {
	try {
		const record = JSON.parse(readFileSync(dashboardFile(root), "utf8")) as DashboardRecord;
		if (isAlive(record.pid) && looksLikeRowork(record.pid)) return record;
	} catch {
		// No record, or unreadable: nothing is running as far as Rowork knows.
	}
	clearDashboardRecord(root);
	return undefined;
}
