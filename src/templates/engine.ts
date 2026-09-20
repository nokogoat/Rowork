import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RoworkError } from "../cli/errors.js";

export type TemplateVariables = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Root of the bundled templates, relative to the compiled dist/. */
export function templatesRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
}

export function renderString(source: string, variables: TemplateVariables): string {
	return source.replace(PLACEHOLDER, (match, key: string) => {
		const value = variables[key];
		if (value === undefined) {
			throw new RoworkError(`Unknown template variable: \`${key}\`.`, {
				hint: `Found in: ${match}`,
			});
		}
		return value;
	});
}

/**
 * Turns a template file name into its final name.
 *
 * - a trailing `.tmpl` is dropped
 * - a leading `_` becomes `.`
 *
 * The `_` convention exists because npm always strips `.gitignore` files from
 * published tarballs: a template literally named `.gitignore` would be missing
 * from the installed package.
 */
export function resolveTemplateName(name: string, variables: TemplateVariables): string {
	let output = name.endsWith(".tmpl") ? name.slice(0, -".tmpl".length) : name;
	if (output.startsWith("_")) output = `.${output.slice(1)}`;
	return renderString(output, variables);
}

/** Recursively copies a template directory, rendering both names and contents. */
export function renderTree(
	sourceDirectory: string,
	targetDirectory: string,
	variables: TemplateVariables,
): string[] {
	const written: string[] = [];
	mkdirSync(targetDirectory, { recursive: true });

	for (const entry of readdirSync(sourceDirectory)) {
		const sourcePath = join(sourceDirectory, entry);
		const targetPath = join(targetDirectory, resolveTemplateName(entry, variables));

		if (statSync(sourcePath).isDirectory()) {
			written.push(...renderTree(sourcePath, targetPath, variables));
			continue;
		}

		mkdirSync(dirname(targetPath), { recursive: true });
		writeFileSync(targetPath, renderString(readFileSync(sourcePath, "utf8"), variables), "utf8");
		written.push(targetPath);
	}

	return written;
}
