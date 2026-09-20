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
 * Dossier de commandes ad hoc, propres a un projet, sans passer par un paquet npm.
 *
 * Prefere l'extension .mjs : le package.json d'un projet roblox-ts n'est pas
 * `"type": "module"`, et Node emet alors un avertissement MODULE_TYPELESS_PACKAGE_JSON
 * sur chaque fichier .js charge.
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
 * Charge les plugins depuis trois sources, dans cet ordre :
 *   1. `plugins` declares dans rowork.json (explicite, deterministe)
 *   2. dependances du projet dont le nom matche `rowork-plugin-*`
 *   3. fichiers de `.rowork/commands/`
 *
 * Invariant : l'echec d'un plugin ne doit JAMAIS empecher la CLI de tourner.
 * Chaque chargement est isole, une erreur devient un avertissement.
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

/** Repere les paquets `rowork-plugin-*` dans le package.json du projet. */
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
		logger.debug(`package.json illisible dans ${projectRoot}, auto-detection des plugins ignoree.`);
		return [];
	}
}

async function loadPluginModule(
	specifier: string,
	projectRoot: string,
	options: LoadPluginsOptions,
): Promise<void> {
	try {
		// Resolution depuis le projet de l'utilisateur, pas depuis node_modules de
		// Rowork : la CLI peut etre installee globalement.
		const requireFromProject = createRequire(join(projectRoot, "package.json"));
		const resolved = requireFromProject.resolve(specifier);
		const module = (await import(pathToFileURL(resolved).href)) as {
			default?: unknown;
			plugin?: unknown;
		};

		const plugin = (module.default ?? module.plugin) as RoworkPlugin | undefined;
		if (plugin === undefined || typeof plugin !== "object") {
			logger.warn(`Plugin \`${specifier}\` ignore : aucun export par defaut valide.`);
			return;
		}

		if (plugin.apiVersion !== ROWORK_PLUGIN_API_VERSION) {
			logger.warn(
				`Plugin \`${plugin.name || specifier}\` ignore : cible l'API v${String(plugin.apiVersion)}, ` +
					`cette CLI fournit la v${ROWORK_PLUGIN_API_VERSION}.`,
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

		logger.debug(`Plugin charge : ${plugin.name || specifier}`);
	} catch (error) {
		logger.warn(
			`Plugin \`${specifier}\` non charge : ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/** Charge les commandes ponctuelles de `.rowork/commands/*.{js,mjs}`. */
async function loadLocalCommands(projectRoot: string, registry: CommandRegistry): Promise<void> {
	const directory = join(projectRoot, LOCAL_COMMANDS_DIR);
	if (!existsSync(directory)) return;

	let entries: string[];
	try {
		entries = readdirSync(directory).filter((file) => /\.(?:js|mjs)$/.test(file));
	} catch (error) {
		logger.warn(
			`Dossier ${LOCAL_COMMANDS_DIR} illisible : ${error instanceof Error ? error.message : String(error)}`,
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
				logger.warn(`${join(LOCAL_COMMANDS_DIR, file)} n'exporte aucune commande valide.`);
				continue;
			}

			for (const definition of definitions) {
				registry.register(definition, { kind: "local", file });
			}
		} catch (error) {
			logger.warn(
				`${join(LOCAL_COMMANDS_DIR, file)} non charge : ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
