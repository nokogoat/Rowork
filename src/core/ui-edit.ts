import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import type { RoworkConfig } from "../plugins/api.js";
import { resolveProjectPath } from "./config.js";

/**
 * Small, careful edits to the interface files the `ui` module generated and the user
 * may since have changed. Same rules as `schema-edit.ts`: work on the text, refuse
 * instead of guessing, and return the new text without touching the disk so the
 * caller can write everything at once, or nothing.
 *
 * Two marker comments say where new things go. They are visible in the generated
 * files, and moving them (or the lines above them) is how a user reorders the interface.
 */
export const SCREENS_MARKER = "{/* rowork:screens */}";
export const ELEMENTS_MARKER = "{/* rowork:elements */}";

/** Where the interface lives: `<source>/client/ui`. */
export function uiDirectory(config: RoworkConfig): string {
	return `${config.paths.source}/client/ui`;
}

export function screensDirectory(config: RoworkConfig): string {
	return `${uiDirectory(config)}/screens`;
}

/** The screens that exist, by name (`Shop` for `screens/ShopScreen.tsx`). */
export function listScreens(root: string, config: RoworkConfig): string[] {
	const directory = resolveProjectPath(root, screensDirectory(config));
	if (!existsSync(directory)) return [];
	return readdirSync(directory)
		.filter((file) => /Screen\.tsx$/.test(file))
		.map((file) => file.replace(/Screen\.tsx$/, ""))
		.sort();
}

function cannotFind(file: string, what: string): RoworkError {
	return new RoworkError(`Cannot find ${what} in ${file}.`, {
		hint: `${file} no longer has the shape Rowork generated, so it was not touched. Put the marker back (or add the line by hand), then run the command again.`,
	});
}

/** Adds `import { name } from "path";` after the last import, keeping the file's layout. */
function addImport(source: string, name: string, path: string): string {
	const line = `import { ${name} } from "${path}";`;
	const imports = [...source.matchAll(/^import[^;]*;[ \t]*$/gm)];
	const last = imports.at(-1);
	if (last === undefined) return `${line}\n${source}`;
	const end = last.index + last[0].length;
	return `${source.slice(0, end)}\n${line}${source.slice(end)}`;
}

/** Puts `<Name />` on its own line just before the marker, at the marker's indentation. */
function addBeforeMarker(source: string, file: string, marker: string, element: string): string {
	const at = source.indexOf(marker);
	if (at < 0) throw cannotFind(file, `the \`${marker}\` marker`);
	const lineStart = source.lastIndexOf("\n", at) + 1;
	const indent = /^[ \t]*/.exec(source.slice(lineStart, at))?.[0] ?? "";
	return `${source.slice(0, lineStart)}${indent}${element}\n${source.slice(lineStart)}`;
}

/** Shows a new screen from `App`. Refuses when it is already there. */
export function addScreenToApp(source: string, file: string, className: string, importPath: string): string {
	if (new RegExp(`<${className}[\\s/>]`).test(source)) {
		throw new RoworkError(`${className} is already shown by ${file}.`, { hint: "Each screen is listed once." });
	}
	const withElement = addBeforeMarker(source, file, SCREENS_MARKER, `<${className} />`);
	return addImport(withElement, className, importPath);
}

/** Places a component inside a screen. Refuses when the screen already uses it. */
export function addElementToScreen(source: string, file: string, componentName: string, importPath: string): string {
	if (new RegExp(`<${componentName}[\\s/>]`).test(source)) {
		throw new RoworkError(`${file} already uses ${componentName}.`, { hint: "Place a second one by hand if you need it." });
	}
	const withElement = addBeforeMarker(source, file, ELEMENTS_MARKER, `<${componentName} />`);
	return addImport(withElement, componentName, importPath);
}

/**
 * True when the interface has the shape screens need: `App` lists screens between markers
 * and `UiController` draws into `PlayerGui`. A project whose `ui` module predates screens
 * does not, and is told what to change instead of being rewritten.
 */
export function screensSupported(root: string, config: RoworkConfig, read: (path: string) => string | undefined): { ok: boolean; reason?: string } {
	const app = read(resolveProjectPath(root, join(uiDirectory(config), "App.tsx")));
	const controller = read(resolveProjectPath(root, join(config.paths.controllers, "UiController.tsx")));
	if (app === undefined || !app.includes(SCREENS_MARKER)) {
		return { ok: false, reason: `${uiDirectory(config)}/App.tsx has no \`${SCREENS_MARKER}\` marker` };
	}
	if (controller === undefined || !controller.includes("createPortal")) {
		return { ok: false, reason: `${config.paths.controllers}/UiController.tsx does not draw into PlayerGui with createPortal` };
	}
	return { ok: true };
}
