import { spawn, type ChildProcess } from "node:child_process";

/**
 * Terminates a child process AND every process it spawned.
 *
 * This is the single most important function in the orchestrator, and the
 * classic failure of tools in this category: `child.kill()` only signals the
 * direct child. `rbxtsc` and `rojo` are reached through wrapper shims, so the
 * real worker is a grandchild that survives and keeps holding the output
 * directory or the Rojo port. The user then hits a stale server on the next
 * `rowork dev` with no idea why.
 *
 * Windows has no process groups, so we delegate to `taskkill /T`, which walks
 * the tree itself. Elsewhere the child is spawned detached, which makes it a
 * process-group leader, and a negative PID signals the whole group.
 */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
	const pid = child.pid;
	if (pid === undefined || child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve();
	}

	if (process.platform === "win32") {
		return new Promise((resolve) => {
			// /T kills the tree, /F forces it. Windows has no graceful equivalent
			// for a non-console child, so there is nothing softer to try first.
			const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
				stdio: "ignore",
			});
			killer.on("error", () => resolve());
			killer.on("close", () => resolve());
		});
	}

	try {
		// Negative PID targets the process group, not just the leader.
		process.kill(-pid, signal);
	} catch {
		// Already gone, or never became a group leader. Fall back to the child.
		try {
			child.kill(signal);
		} catch {
			// Nothing left to kill.
		}
	}

	return Promise.resolve();
}

/**
 * Best-effort synchronous kill, for the `exit` handler.
 *
 * Node runs `exit` listeners synchronously and ignores anything asynchronous,
 * so the promise-based path above is useless there. Detached children would
 * otherwise outlive a crash of the CLI itself.
 */
export function killTreeSync(child: ChildProcess): void {
	const pid = child.pid;
	if (pid === undefined || child.exitCode !== null) return;

	try {
		if (process.platform === "win32") {
			spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", detached: true });
		} else {
			process.kill(-pid, "SIGKILL");
		}
	} catch {
		// Exiting anyway.
	}
}
