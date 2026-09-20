import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import type { ModuleDefinition } from "../modules/types.js";
import type { CommandContext } from "../plugins/api.js";
import { CONFIG_FILENAME, resolveProjectPath } from "./config.js";
import { run as runBinary } from "./exec.js";
import { ensureFlameworkPath, generateFile, importPath } from "./generate.js";
import { findExecutable } from "./toolchain.js";

/** Prefix a module uses to say "the import path to this project file". */
const IMPORT_MARKER = "@import:";

export function installedModules(context: CommandContext): string[] {
	return context.config?.modules ?? [];
}

/** Adds a module's name to `modules` in rowork.json, keeping the file readable. */
function recordModule(projectRoot: string, name: string): void {
	const file = join(projectRoot, CONFIG_FILENAME);
	const config = JSON.parse(readFileSync(file, "utf8")) as { modules?: string[] };
	config.modules = [...new Set([...(config.modules ?? []), name])].sort();
	writeFileSync(file, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}

/**
 * Installs one module into the current project.
 *
 * Checks come first and writes come last: a module that cannot be installed
 * (already there, missing prerequisite, a file it would overwrite) must leave
 * the project exactly as it was.
 */
export async function installModule(
	context: CommandContext,
	definition: ModuleDefinition,
	root: string,
	guided: boolean,
): Promise<void> {
	const config = context.config;
	if (config === undefined) throw new RoworkError("No project.");
	const { logger } = context;

	if (installedModules(context).includes(definition.name)) {
		throw new RoworkError(`The ${definition.title} module is already installed.`, {
			hint: "Its files are yours to edit. Adding it again would overwrite your changes.",
		});
	}

	for (const required of definition.requires ?? []) {
		if (!installedModules(context).includes(required)) {
			throw new RoworkError(`The ${definition.title} module needs the \`${required}\` module first.`, {
				hint: `Run \`rowork add:${required}\`, then try again.`,
			});
		}
	}

	const plan = await definition.plan({ guided, options: context.options, config });

	const files = plan.files.map((file) => ({
		...file,
		variables: Object.fromEntries(
			Object.entries(file.variables).map(([key, value]) => [
				key,
				value.startsWith(IMPORT_MARKER)
					? importPath(root, file.directory, value.slice(IMPORT_MARKER.length))
					: value,
			]),
		),
	}));

	const clashes = files
		.map((file) => join(file.directory, file.fileName))
		.filter((path) => existsSync(resolveProjectPath(root, path)));
	if (clashes.length > 0) {
		throw new RoworkError(`Would overwrite: ${clashes.join(", ")}.`, {
			hint: "Move or rename those files, then run the command again.",
		});
	}

	logger.info(`Adding the ${definition.title} module`);

	if (definition.dependencies !== undefined && context.options["install"] !== false) {
		if (findExecutable("npm", root) === undefined) {
			throw new RoworkError("npm was not found on your PATH.", { hint: "Install Node.js." });
		}
		logger.step(`installing ${definition.dependencies.join(", ")} (npm)`);
		logger.blank();
		await runBinary("npm", ["install", ...definition.dependencies], { cwd: root });
		logger.blank();
	}

	for (const file of files) {
		const written = generateFile({
			projectRoot: root,
			directory: file.directory,
			fileName: file.fileName,
			template: file.template,
			templateRoot: "modules",
			variables: file.variables,
			force: false,
		});
		if (written !== undefined) logger.step(written);
	}

	for (const entry of plan.register) {
		const runtime = resolveProjectPath(root, join(config.paths.source, entry.side, `runtime.${entry.side}.ts`));
		if (ensureFlameworkPath(runtime, entry.directory, logger)) {
			logger.step(`registered ${entry.directory} in runtime.${entry.side}.ts`);
		}
	}

	recordModule(root, definition.name);

	logger.success(`${definition.title} module added`);
	logger.blank();
	for (const note of plan.notes) logger.info(note);
}
