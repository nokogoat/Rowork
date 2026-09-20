import spawn from "cross-spawn";

import { RoworkError } from "../cli/errors.js";

export interface RunOptions {
	cwd: string;
	/** Whether the tool's own output reaches the terminal. */
	stdio?: "inherit" | "ignore";
	/** Extra environment variables, merged over the current ones. */
	env?: Record<string, string>;
}

/**
 * Runs an external executable.
 *
 * Every external tool Rowork drives on Windows (`npm`, `rojo`, `rbxtsc`) is a
 * `.cmd` shim, and since the fix for CVE-2024-27980 Node refuses to spawn one
 * without `shell: true`, failing with EINVAL. Turning the shell on instead
 * would make every argument a shell injection vector, and a hostile
 * rowork.json could then run arbitrary commands on a contributor's machine.
 *
 * cross-spawn is the standard way out: it invokes `cmd.exe` itself and escapes
 * the arguments, so no argument is ever interpreted as a command. It is also
 * why `.cmd` is never appended by hand anywhere in this codebase.
 */
export function run(command: string, args: string[], options: RunOptions): Promise<void> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: options.stdio ?? "inherit",
			env: { ...process.env, ...options.env },
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
