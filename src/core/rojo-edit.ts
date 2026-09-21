import { existsSync } from "node:fs";
import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";

/**
 * npm scopes that some packages need inside the game, and that the project template
 * does not map: `@rbxts/react` is built on the `@rbxts-js` packages, and without them
 * Studio waits for a folder that never appears ("Infinite yield possible on
 * ...node_modules:WaitForChild("@rbxts-js")") and the interface silently never starts.
 */
export const OPTIONAL_SCOPES = ["@rbxts-js"];

/** The scopes among `scopes` that are installed but not mapped in the Rojo project. */
export function unmappedScopes(projectSource: string, projectRoot: string, scopes: string[] = OPTIONAL_SCOPES): string[] {
	return scopes.filter((scope) => existsSync(join(projectRoot, "node_modules", scope)) && !projectSource.includes(`"${scope}"`));
}

/** The index of the `}` that closes the `{` at `open`, skipping over strings. */
function matchingBrace(source: string, open: number): number {
	let depth = 0;
	for (let i = open; i < source.length; i += 1) {
		const char = source[i];
		if (char === '"') {
			i += 1;
			while (i < source.length && source[i] !== '"') i += source[i] === "\\" ? 2 : 1;
		} else if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/**
 * Maps `node_modules/<scope>` into the game, next to `@rbxts` and `@flamework`.
 *
 * default.project.json belongs to the user, so this edits the text and leaves everything
 * else as it was. It refuses, and changes nothing, when the file no longer has the shape
 * the template gave it.
 */
export function addNodeModuleScopes(source: string, file: string, scopes: string[]): string {
	let result = source;

	for (const scope of scopes) {
		if (result.includes(`"${scope}"`)) continue;

		const fail = (): never => {
			throw new RoworkError(`Cannot find where ${file} maps \`node_modules\` into the game.`, {
				hint: `Add this next to "@rbxts" under "rbxts_include" > "node_modules": "${scope}": { "$path": "node_modules/${scope}" }`,
			});
		};

		const include = result.indexOf('"rbxts_include"');
		const modules = include < 0 ? -1 : result.indexOf('"node_modules"', include);
		const open = modules < 0 ? -1 : result.indexOf("{", modules);
		if (open < 0) return fail();
		const close = matchingBrace(result, open);
		if (close < 0) return fail();

		const body = result.slice(open + 1, close);
		const lastEntry = body.replace(/\s+$/, "");
		if (lastEntry.trim() === "") return fail();
		const entryIndent = /\n([ \t]+)"/.exec(body)?.[1] ?? "\t\t\t\t\t";
		const unit = entryIndent.includes("\t") ? "\t" : "  ";

		const entry = `,\n${entryIndent}"${scope}": {\n${entryIndent}${unit}"$path": "node_modules/${scope}"\n${entryIndent}}`;
		const end = open + 1 + lastEntry.length;
		result = `${result.slice(0, end)}${entry}${result.slice(end)}`;
	}
	return result;
}
