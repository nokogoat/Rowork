import { spawn } from "node:child_process";

import { RoworkError } from "../cli/errors.js";

export interface RunOptions {
	cwd: string;
	/** Laisse passer les sorties de l'outil sur le terminal. */
	stdio?: "inherit" | "ignore";
}

/**
 * Lance un executable externe.
 *
 * Sous Windows, `npm` et `git` sont des shims `.cmd` que `spawn` ne sait pas
 * executer directement ; on vise donc explicitement `<commande>.cmd`. On evite
 * `shell: true`, qui ouvrirait une injection via les arguments.
 */
export function run(command: string, args: string[], options: RunOptions): Promise<void> {
	const binary = process.platform === "win32" && !command.endsWith(".cmd") ? `${command}.cmd` : command;

	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(binary, args, {
			cwd: options.cwd,
			stdio: options.stdio ?? "inherit",
		});

		child.on("error", (cause) => {
			rejectPromise(
				new RoworkError(`Impossible de lancer \`${command}\`.`, {
					hint: `Verifie que \`${command}\` est installe et accessible dans le PATH.`,
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
				new RoworkError(`\`${command} ${args.join(" ")}\` s'est termine avec le code ${String(code)}.`),
			);
		});
	});
}
