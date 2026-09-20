import { RoworkError } from "../cli/errors.js";

/**
 * Values Rowork itself used to write, that are safe to replace: the project
 * template shipped the abandoned Roact JSX factory before React was chosen.
 */
const REPLACEABLE: Record<string, string[]> = {
	jsxFactory: ["Roact.createElement"],
	jsxFragmentFactory: ["Roact.Fragment"],
};

/**
 * Sets `compilerOptions` entries in tsconfig.json by editing the text.
 *
 * tsconfig.json belongs to the user and is often JSON with comments, which a
 * parse-and-rewrite would destroy. So the value of an existing entry is replaced
 * in place and a missing entry is inserted as a new line, leaving everything else,
 * comments and layout included, exactly as it was. A value the user set to
 * something else is never overwritten: it is reported, and nothing is written.
 */
export function setCompilerOptions(source: string, file: string, options: Record<string, string>): string {
	let result = source;

	for (const [key, wanted] of Object.entries(options)) {
		const existing = new RegExp(`("${key}"\\s*:\\s*)"([^"]*)"`).exec(result);

		if (existing !== null) {
			const current = existing[2] as string;
			if (current === wanted) continue;
			if (!(REPLACEABLE[key] ?? []).includes(current)) {
				throw new RoworkError(`${file} sets \`${key}\` to "${current}", and this needs "${wanted}".`, {
					hint: `Change it to "${wanted}" yourself if you are sure nothing else depends on it, then run the command again.`,
				});
			}
			result = `${result.slice(0, existing.index)}${existing[1]}"${wanted}"${result.slice(existing.index + existing[0].length)}`;
			continue;
		}

		const opening = /("compilerOptions"\s*:\s*\{)([ \t]*\n)([ \t]*)/.exec(result);
		if (opening === null) {
			throw new RoworkError(`Cannot find \`compilerOptions\` in ${file}.`, {
				hint: `Add "${key}": "${wanted}" to it by hand.`,
			});
		}
		const indent = opening[3] as string;
		const at = opening.index + (opening[1] as string).length + (opening[2] as string).length;
		result = `${result.slice(0, at)}"${key}": "${wanted}",\n${indent}${result.slice(at)}`;
	}
	return result;
}
