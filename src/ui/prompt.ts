import * as prompts from "@clack/prompts";

import { RoworkError } from "../cli/errors.js";

export { prompts };

/** True when a person can answer questions: both ends are a terminal. */
export function isInteractive(): boolean {
	return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/** Fails with the non-interactive form when the command cannot ask its questions. */
export function requireInteractive(command: string, usage: string): void {
	if (!isInteractive()) {
		throw new RoworkError(`\`rowork ${command}\` needs a terminal to ask its questions.`, {
			hint: `Outside a terminal, give everything on the command line: ${usage}`,
		});
	}
}

/** Ends a guided flow cleanly on Ctrl+C or Escape instead of throwing a stack trace. */
export function answered<T>(value: T): Exclude<T, symbol> {
	if (prompts.isCancel(value)) {
		prompts.cancel("Cancelled, nothing was created.");
		process.exit(0);
	}
	return value as Exclude<T, symbol>;
}
