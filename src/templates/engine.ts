import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RoworkError } from "../cli/errors.js";

export type TemplateVariables = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Racine des templates embarques, relative au dist/ compile. */
export function templatesRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
}

export function renderString(source: string, variables: TemplateVariables): string {
	return source.replace(PLACEHOLDER, (match, key: string) => {
		const value = variables[key];
		if (value === undefined) {
			throw new RoworkError(`Variable de template inconnue : \`${key}\`.`, {
				hint: `Occurrence : ${match}`,
			});
		}
		return value;
	});
}

/**
 * Traduit un nom de fichier de template en nom final.
 *
 * - `.tmpl` final retire
 * - prefixe `_` traduit en `.`
 *
 * Le prefixe `_` existe parce que npm exclut systematiquement les fichiers
 * `.gitignore` des tarballs publies : un template nomme `.gitignore` serait
 * absent du paquet installe.
 */
export function resolveTemplateName(name: string, variables: TemplateVariables): string {
	let output = name.endsWith(".tmpl") ? name.slice(0, -".tmpl".length) : name;
	if (output.startsWith("_")) output = `.${output.slice(1)}`;
	return renderString(output, variables);
}

/** Copie recursivement un dossier de templates en rendant noms et contenus. */
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
