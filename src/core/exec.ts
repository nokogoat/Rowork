import { spawn } from "node:child_process";

import { RoworkError } from "../cli/errors.js";

export interface RunOptions {
	cwd: string;
	/** Whether the tool's own output reaches the terminal. */
	stdio?: "inherit" | "ignore";
}

/**
 * Runs an external executable.
 *
 * On Windows, `npm` and `git` are `.cmd` shims that `spawn` cannot execute
 * directly, so we explicitly target `<command>.cmd`. We deliberately avoid
 * `shell: true`, which would open an injection vector through the arguments.
 */
export function run(command: string, args: string[], options: RunOptions): Promise<void> {
	const binary =
		process.platform === "win32" && !command.endsWith(".cmd") ? `${command}.cmd` : command;

	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(binary, args, {
			cwd: options.cwd,
			stdio: options.stdio ?? "inherit",
		});

		child.on("error", (cause) => {
			rejectPromise(
				new RoworkError(`Could not run \`${command}\`.`, {
					hint: `Make sure \`${command}\` is installed and available on your PATH.`,
					cause,
				}),
			);
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(
				new RoworkError(`\`${command} ${args.join(" ")}\` exited with code ${String(code)}.`),
			);
		});
	});
}
