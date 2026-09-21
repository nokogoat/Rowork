import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { coreModules } from "../modules/index.js";
import { coreIntegrations } from "../modules/integrations.js";
import type { ModuleDefinition, ModulePlan } from "../modules/types.js";
import type { CommandContext, Logger, RoworkConfig } from "../plugins/api.js";
import { syncAgentDocs } from "./agent-docs.js";
import { addNodeModuleScopes } from "./rojo-edit.js";
import { setCompilerOptions } from "./tsconfig-edit.js";
import { CONFIG_FILENAME, loadConfig, resolveProjectPath } from "./config.js";
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

	const plan = await definition.plan({ guided, options: context.options, config, projectRoot: root });

	const files = resolveFiles(plan, root);
	assertNoClash(files, root);

	// tsconfig.json is computed now, so a conflict stops the install before anything is written.
	let newTsconfig: { path: string; source: string } | undefined;
	if (plan.compilerOptions !== undefined) {
		const path = join(root, "tsconfig.json");
		let current: string;
		try {
			current = readFileSync(path, "utf8");
		} catch {
			throw new RoworkError("Cannot read tsconfig.json.", { hint: "This module needs to set compiler options there." });
		}
		newTsconfig = { path, source: setCompilerOptions(current, "tsconfig.json", plan.compilerOptions) };
	}

	// Same for default.project.json: computed now, written with the rest.
	let newProject: { path: string; source: string } | undefined;
	if (plan.nodeModuleScopes !== undefined) {
		const path = join(root, config.paths.rojoProject);
		let current: string;
		try {
			current = readFileSync(path, "utf8");
		} catch {
			throw new RoworkError(`Cannot read ${config.paths.rojoProject}.`, { hint: "This module needs to map a package folder there." });
		}
		newProject = { path, source: addNodeModuleScopes(current, config.paths.rojoProject, plan.nodeModuleScopes) };
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

	writePlan(logger, root, config, plan, files, "modules");
	if (newTsconfig !== undefined && newTsconfig.source !== readFileSync(newTsconfig.path, "utf8")) {
		writeFileSync(newTsconfig.path, newTsconfig.source, "utf8");
		logger.step(`tsconfig.json: set ${Object.keys(plan.compilerOptions ?? {}).join(", ")}`);
	}

	if (newProject !== undefined && newProject.source !== readFileSync(newProject.path, "utf8")) {
		writeFileSync(newProject.path, newProject.source, "utf8");
		logger.step(`${config.paths.rojoProject}: mapped ${(plan.nodeModuleScopes ?? []).join(", ")} into the game`);
	}

	recordModule(root, definition.name);

	if (definition.postInstall !== undefined && context.options["install"] !== false) {
		try {
			await definition.postInstall({ logger, projectRoot: root, options: context.options });
		} catch (error) {
			logger.warn(`${definition.title}: a last step did not finish (${error instanceof Error ? error.message : String(error)}). The module itself is installed.`);
		}
	}

	// Glue between this module and the ones already there, whatever the order.
	await applyPendingIntegrations(context, root);

	// The project's AGENTS.md lists installed modules and how to use them.
	const touched = syncAgentDocs(root, loadConfig(root), context.roworkVersion);
	if (touched.length > 0) logger.step(`updated ${touched.join(", ")}`);

	logger.success(`${definition.title} module added`);
	logger.blank();
	for (const note of plan.notes) logger.info(note);
}

type ResolvedFile = ModulePlan["files"][number];

/** Turns `@import:` markers into real relative import paths. */
function resolveFiles(plan: ModulePlan, root: string): ResolvedFile[] {
	return plan.files.map((file) => ({
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
}

function clashesOf(files: ResolvedFile[], root: string): string[] {
	return files
		.map((file) => join(file.directory, file.fileName))
		.filter((path) => existsSync(resolveProjectPath(root, path)));
}

function assertNoClash(files: ResolvedFile[], root: string): void {
	const clashes = clashesOf(files, root);
	if (clashes.length > 0) {
		throw new RoworkError(`Would overwrite: ${clashes.join(", ")}.`, {
			hint: "Move or rename those files, then run the command again.",
		});
	}
}

function writePlan(
	logger: Logger,
	root: string,
	config: RoworkConfig,
	plan: ModulePlan,
	files: ResolvedFile[],
	templateRoot: string,
): void {
	for (const file of files) {
		const written = generateFile({
			projectRoot: root,
			directory: file.directory,
			fileName: file.fileName,
			template: file.template,
			templateRoot,
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

	addScripts(logger, root, plan.scripts);
}

/** Adds npm scripts to package.json. A script the user already has is left exactly as it is. */
function addScripts(logger: Logger, root: string, scripts: Record<string, string> | undefined): void {
	if (scripts === undefined) return;
	const file = join(root, "package.json");
	if (!existsSync(file)) return;

	const source = readFileSync(file, "utf8");
	const manifest = JSON.parse(source) as { scripts?: Record<string, string> };
	const existing = manifest.scripts ?? {};

	const added: string[] = [];
	for (const [name, command] of Object.entries(scripts)) {
		if (existing[name] === undefined) {
			existing[name] = command;
			added.push(name);
		} else if (existing[name] !== command) {
			logger.warn(`package.json already has a \`${name}\` script: kept as it is.`);
		}
	}
	if (added.length === 0) return;

	manifest.scripts = existing;
	writeFileSync(file, `${JSON.stringify(manifest, undefined, /^\t/m.test(source) ? "\t" : 2)}\n`, "utf8");
	logger.step(`package.json: added ${added.map((name) => `\`npm run ${name}\``).join(", ")}`);
}

function recordIntegration(projectRoot: string, name: string): void {
	const file = join(projectRoot, CONFIG_FILENAME);
	const config = JSON.parse(readFileSync(file, "utf8")) as { integrations?: string[] };
	config.integrations = [...new Set([...(config.integrations ?? []), name])].sort();
	writeFileSync(file, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}

/** Integrations whose modules are all installed and that have not been applied yet. */
export function pendingIntegrations(config: RoworkConfig): typeof coreIntegrations {
	const installed = config.modules ?? [];
	const applied = config.integrations ?? [];
	return coreIntegrations.filter(
		(integration) => integration.modules.every((name) => installed.includes(name)) && !applied.includes(integration.name),
	);
}

/**
 * Generates the glue between modules that are now all installed.
 *
 * A failure never undoes the module that triggered it: the integration is
 * skipped with a warning and stays pending, so `rowork wire` can retry.
 */
export async function applyPendingIntegrations(
	context: CommandContext,
	root: string,
	options: { dryRun?: boolean } = {},
): Promise<string[]> {
	const { logger } = context;
	const applied: string[] = [];

	for (const integration of pendingIntegrations(loadConfig(root))) {
		if (options.dryRun === true) {
			applied.push(integration.name);
			continue;
		}

		try {
			const config = loadConfig(root);
			const plan = integration.plan({ config, projectRoot: root });
			const files = resolveFiles(plan, root);
			assertNoClash(files, root);

			logger.blank();
			logger.info(`Wiring ${integration.title}`);
			writePlan(logger, root, config, plan, files, "integrations");
			recordIntegration(root, integration.name);
			for (const note of plan.notes) logger.info(note);
			applied.push(integration.name);
		} catch (error) {
			logger.warn(`Could not wire ${integration.title}: ${error instanceof Error ? error.message : String(error)}`);
			logger.info("Fix that, then run `rowork wire` to try again.");
		}
	}
	return applied;
}

/**
 * Installs several modules in dependency order, for `rowork start`.
 *
 * A module that needs another one brings it along. One failing does not stop
 * the others: the project already exists and is usable, so it is reported and
 * can be retried with `rowork add`.
 */
export async function installModulesByName(context: CommandContext, root: string, names: string[]): Promise<string[]> {
	const wanted = new Set(names);
	for (const module of coreModules) {
		if (wanted.has(module.name)) for (const required of module.requires ?? []) wanted.add(required);
	}

	const done: string[] = [];
	for (const module of coreModules) {
		if (!wanted.has(module.name)) continue;
		try {
			await installModule({ ...context, projectRoot: root, config: loadConfig(root), options: {} }, module, root, false);
			done.push(module.name);
		} catch (error) {
			context.logger.warn(`Could not add ${module.title}: ${error instanceof Error ? error.message : String(error)}`);
			context.logger.info(`Retry later with \`rowork add ${module.name}\`.`);
		}
	}
	return done;
}
