import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { RoworkError } from "../cli/errors.js";
import type { Logger } from "../plugins/api.js";
import { renderString, templatesRoot } from "../templates/engine.js";
import { resolveProjectPath } from "./config.js";

/** Flamework's own naming convention: `Inventory` -> `InventoryService`. */
export function withSuffix(pascalName: string, suffix: string): string {
	return pascalName.endsWith(suffix) && pascalName.length > suffix.length
		? pascalName
		: `${pascalName}${suffix}`;
}

/** Turns anything typed by the user into a class-safe PascalCase name. */
export function toClassBase(raw: string): string {
	const pascal = raw
		.split(/[^A-Za-z0-9]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");

	if (!/^[A-Z][A-Za-z0-9]*$/.test(pascal)) {
		throw new RoworkError(`\`${raw}\` cannot be turned into a class name.`, {
			hint: "Use letters and digits, starting with a letter: e.g. Inventory, or player-stats.",
		});
	}
	return pascal;
}

export interface GenerateOptions {
	projectRoot: string;
	/** Directory to write into, relative to the project root. */
	directory: string;
	fileName: string;
	/** Template name under `templates/<templateRoot>/`, without the `.ts.tmpl` suffix. */
	template: string;
	/** Directory under `templates/` holding the template. Defaults to `make`. */
	templateRoot?: string;
	variables: Record<string, string>;
	force: boolean;
	/** What to do when the file exists and `force` is off. Defaults to failing. */
	ifExists?: "fail" | "skip";
}

/**
 * Writes one generated file and returns its path relative to the project, or
 * undefined when it already existed and `ifExists` is "skip".
 */
export function generateFile(options: GenerateOptions): string | undefined {
	const directory = resolveProjectPath(options.projectRoot, options.directory);
	const target = join(directory, options.fileName);
	const shown = relative(options.projectRoot, target);

	if (existsSync(target) && !options.force) {
		if (options.ifExists === "skip") return undefined;
		throw new RoworkError(`${shown} already exists.`, {
			hint: "Pick another name, or pass --force to overwrite it.",
		});
	}

	// `name.ts.tmpl` by default; a template that is not TypeScript carries its own
	// extension in its name (`eslint.config.mjs` is stored as `eslint.config.mjs.tmpl`).
	const base = join(templatesRoot(), options.templateRoot ?? "make", options.template);
	const source = readFileSync(existsSync(`${base}.ts.tmpl`) ? `${base}.ts.tmpl` : `${base}.tmpl`, "utf8");
	mkdirSync(directory, { recursive: true });
	writeFileSync(target, renderString(source, options.variables), "utf8");
	return shown;
}

/** Relative module specifier from one project directory to a file (no extension). */
export function importPath(projectRoot: string, fromDirectory: string, toFile: string): string {
	const path = relative(resolveProjectPath(projectRoot, fromDirectory), resolveProjectPath(projectRoot, toFile))
		.split("\\")
		.join("/");
	return path.startsWith(".") ? path : `./${path}`;
}

/**
 * Makes sure a runtime entry file scans a directory.
 *
 * Flamework only discovers what `addPaths` lists, so a class written to a
 * directory that is not listed compiles fine and then silently never runs.
 * Returns true when the file was changed. The edit is a plain text insertion
 * next to the existing `addPaths` calls; if the file does not look the way Rowork
 * generated it, nothing is touched and the caller is told to do it by hand.
 */
export function ensureFlameworkPath(
	runtimeFile: string,
	directory: string,
	logger: Logger,
): boolean {
	const posixDirectory = directory.split("\\").join("/");

	if (!existsSync(runtimeFile)) {
		logger.warn(`${runtimeFile} not found: add Flamework.addPaths("${posixDirectory}") yourself.`);
		return false;
	}

	const source = readFileSync(runtimeFile, "utf8");
	const alreadyListed = new RegExp(
		`Flamework\\.addPaths\\(\\s*["']${posixDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\s*\\)`,
	);
	if (alreadyListed.test(source)) return false;

	// Keep the addPaths calls together: insert after the last one when there is
	// one, and otherwise right before ignite().
	const calls = [...source.matchAll(/^[ \t]*Flamework\.addPaths\([^\n]*\);?[ \t]*$/gm)];
	const last = calls.at(-1);
	const line = `Flamework.addPaths("${posixDirectory}");`;

	if (last !== undefined) {
		const indent = /^[ \t]*/.exec(last[0])?.[0] ?? "";
		const end = last.index + last[0].length;
		writeFileSync(runtimeFile, `${source.slice(0, end)}\n${indent}${line}${source.slice(end)}`, "utf8");
		return true;
	}

	const ignite = /^([ \t]*)Flamework\.ignite\(\);?/m.exec(source);
	if (ignite === null) {
		logger.warn(`Could not find Flamework.ignite() in ${runtimeFile}: add ${line} yourself.`);
		return false;
	}

	writeFileSync(
		runtimeFile,
		`${source.slice(0, ignite.index)}${ignite[1] ?? ""}${line}\n\n${source.slice(ignite.index)}`,
		"utf8",
	);
	return true;
}
