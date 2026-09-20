import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { CommandRegistry, CommandOrigin } from "../cli/registry.js";
import { logger } from "../ui/logger.js";
import {
	ROWORK_PLUGIN_API_VERSION,
	type CommandDefinition,
	type PluginContext,
	type RoworkConfig,
	type RoworkPlugin,
} from "./api.js";

/**
 * Directory for one-off, project-specific commands that do not warrant an npm
 * package.
 *
 * Prefer the .mjs extension: a roblox-ts package.json is not
 * `"type": "module"`, so Node emits a MODULE_TYPELESS_PACKAGE_JSON warning for
 * every .js file loaded from here.
 */
const LOCAL_COMMANDS_DIR = join(".rowork", "commands");

const PLUGIN_NAME_PATTERN = /^(@[^/]+\/)?rowork-plugin-/;

export interface LoadPluginsOptions {
	registry: CommandRegistry;
	projectRoot: string | undefined;
	config: RoworkConfig | undefined;
	cwd: string;
	roworkVersion: string;
}

/**
 * Loads plugins from three sources, in order:
 *   1. `plugins` declared in rowork.json (explicit, deterministic)
 *   2. project dependencies whose name matches `rowork-plugin-*`
 *   3. files in `.rowork/commands/`
 *
 * Invariant: a failing plugin must NEVER stop the CLI from running. Every load
 * is isolated, and an error degrades to a warning.
 */
export async function loadPlugins(options: LoadPluginsOptions): Promise<void> {
	const { projectRoot } = options;
	if (projectRoot === undefined) return;

	const specifiers = new Set<string>(options.config?.plugins ?? []);
	for (const name of autoDetectedPlugins(projectRoot)) specifiers.add(name);

	for (const specifier of specifiers) {
		await loadPluginModule(specifier, projectRoot, options);
	}

	await loadLocalCommands(projectRoot, options.registry);
}

/** Picks up `rowork-plugin-*` packages from the project manifest. */
function autoDetectedPlugins(projectRoot: string): string[] {
	const manifestPath = join(projectRoot, "package.json");
	if (!existsSync(manifestPath)) return [];

	try {
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return [
			...Object.keys(manifest.dependencies ?? {}),
			...Object.keys(manifest.devDependencies ?? {}),
		].filter((name) => PLUGIN_NAME_PATTERN.test(name));
	} catch {
		logger.debug(`Unreadable manifest in ${projectRoot}, skipping plugin auto-detection.`);
		return [];
	}
}

async function loadPluginModule(
	specifier: string,
	projectRoot: string,
	options: LoadPluginsOptions,
): Promise<void> {
	try {
		// Resolve from the user project, not from the node_modules of Rowork
		// itself: the CLI may well be installed globally.
		const requireFromProject = createRequire(join(projectRoot, "package.json"));
		const resolved = requireFromProject.resolve(specifier);
		const module = (await import(pathToFileURL(resolved).href)) as {
			default?: unknown;
			plugin?: unknown;
		};

		const plugin = (module.default ?? module.plugin) as RoworkPlugin | undefined;
		if (plugin === undefined || typeof plugin !== "object") {
			logger.warn(`Skipping plugin \`${specifier}\`: no valid default export.`);
			return;
		}

		if (plugin.apiVersion !== ROWORK_PLUGIN_API_VERSION) {
			logger.warn(
				`Skipping plugin \`${plugin.name || specifier}\`: targets API v${String(plugin.apiVersion)}, ` +
					`this CLI provides v${ROWORK_PLUGIN_API_VERSION}.`,
			);
			return;
		}

		const origin: CommandOrigin = { kind: "plugin", pluginName: plugin.name || specifier };

		for (const definition of plugin.commands ?? []) {
			options.registry.register(definition, origin);
		}

		if (typeof plugin.setup === "function") {
			const context: PluginContext = {
				registerCommand: (definition: CommandDefinition) =>
					options.registry.register(definition, origin),
				logger,
				cwd: options.cwd,
				projectRoot: options.projectRoot,
				config: options.config,
				roworkVersion: options.roworkVersion,
			};
			await plugin.setup(context);
		}

		logger.debug(`Loaded plugin: ${plugin.name || specifier}`);
	} catch (error) {
		logger.warn(
			`Could not load plugin \`${specifier}\`: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/** Loads ad hoc commands from `.rowork/commands/`. */
async function loadLocalCommands(projectRoot: string, registry: CommandRegistry): Promise<void> {
	const directory = join(projectRoot, LOCAL_COMMANDS_DIR);
	if (!existsSync(directory)) return;

	let entries: string[];
	try {
		entries = readdirSync(directory).filter((file) => /\.(?:js|mjs)$/.test(file));
	} catch (error) {
		logger.warn(
			`Unreadable ${LOCAL_COMMANDS_DIR} directory: ${error instanceof Error ? error.message : String(error)}`,
		);
		return;
	}

	for (const file of entries) {
		const fullPath = join(directory, file);
		try {
			const module = (await import(pathToFileURL(fullPath).href)) as { default?: unknown };
			const exported = module.default;
			const definitions = (Array.isArray(exported) ? exported : [exported]).filter(
				(value): value is CommandDefinition =>
					typeof value === "object" &&
					value !== null &&
					typeof (value as CommandDefinition).name === "string" &&
					typeof (value as CommandDefinition).run === "function",
			);

			if (definitions.length === 0) {
				logger.warn(`${join(LOCAL_COMMANDS_DIR, file)} exports no valid command.`);
				continue;
			}

			for (const definition of definitions) {
				registry.register(definition, { kind: "local", file });
			}
		} catch (error) {
			logger.warn(
				`Could not load ${join(LOCAL_COMMANDS_DIR, file)}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
