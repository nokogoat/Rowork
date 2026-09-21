/**
 * A tiny lexical scanner shared by every edit of a file the user owns.
 *
 * Rowork edits `PlayerData.ts`, `networking.ts`, `default.project.json`... by text, and
 * finds where a block ends by counting braces. A brace inside a string or a comment is not
 * structure: `nickname: "guest}"` used to close the block early, and the new field was
 * written inside the string. Every brace search now runs on a masked copy of the source.
 *
 * Not handled, on purpose: regular expression literals (`/\}/`). They are rare in the files
 * Rowork edits, and telling `/` (division) from `/` (regex) needs a real parser.
 */

/**
 * Returns a copy of `source`, the same length, where strings, template literals and
 * comments are replaced by spaces (line breaks are kept). Indexes found in the copy are
 * valid in the original, so a regular expression can look for code without being fooled by
 * text, and the edit is then made on the original.
 */
export function maskNonCode(source: string): string {
	const out = source.split("");
	const blank = (from: number, to: number): void => {
		for (let i = from; i < to && i < out.length; i += 1) {
			if (out[i] !== "\n" && out[i] !== "\r") out[i] = " ";
		}
	};

	let i = 0;
	while (i < source.length) {
		const char = source[i];
		const next = source[i + 1];

		if (char === "/" && next === "/") {
			const end = source.indexOf("\n", i);
			const stop = end === -1 ? source.length : end;
			blank(i, stop);
			i = stop;
		} else if (char === "/" && next === "*") {
			const end = source.indexOf("*/", i + 2);
			const stop = end === -1 ? source.length : end + 2;
			blank(i, stop);
			i = stop;
		} else if (char === '"' || char === "'" || char === "`") {
			// A backslash escapes the next character. A quote ends the string; a line break also ends
			// a plain string (an unterminated one), but not a template literal, which may span lines.
			let j = i + 1;
			while (j < source.length) {
				if (source[j] === "\\") {
					j += 2;
					continue;
				}
				if (source[j] === char) break;
				if (source[j] === "\n" && char !== "`") break;
				j += 1;
			}
			const stop = Math.min(j + 1, source.length);
			blank(i, stop);
			i = stop;
		} else {
			i += 1;
		}
	}
	return out.join("");
}

/**
 * Index of the `}` that closes a block whose `{` is just before `from`, in code that has
 * already been through `maskNonCode`. `undefined` when the block never closes.
 */
export function findClosingBrace(maskedCode: string, from: number): number | undefined {
	let depth = 1;
	for (let index = from; index < maskedCode.length; index += 1) {
		const character = maskedCode[index];
		if (character === "{") depth += 1;
		if (character === "}") depth -= 1;
		if (depth === 0) return index;
	}
	return undefined;
}
