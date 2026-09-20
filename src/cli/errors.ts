/**
 * An expected, user-facing error: short message plus a resolution hint.
 * Anything else (an internal bug) surfaces as a full stack trace.
 */
export class RoworkError extends Error {
	readonly hint: string | undefined;
	readonly exitCode: number;

	constructor(
		message: string,
		options: { hint?: string; exitCode?: number; cause?: unknown } = {},
	) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = "RoworkError";
		this.hint = options.hint;
		this.exitCode = options.exitCode ?? 1;
	}
}

export function isRoworkError(error: unknown): error is RoworkError {
	return error instanceof RoworkError;
}
