/**
 * CONTRAT PUBLIC DE L'API PLUGIN.
 *
 * Tout ce qui est exporte ici est expose aux plugins tiers via `rowork/plugin`.
 * Regle non negociable (voir CLAUDE.md) : toute modification incompatible de ce
 * fichier incremente ROWORK_PLUGIN_API_VERSION. Les plugins declarant une autre
 * version sont ignores avec un avertissement, jamais charges de force.
 */

/** Version du contrat plugin. A incrementer a chaque breaking change. */
export const ROWORK_PLUGIN_API_VERSION = 1;

export interface Logger {
	debug(message: string): void;
	info(message: string): void;
	success(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	/** Ligne de progression indentee, pour les etapes d'une commande. */
	step(message: string): void;
	blank(): void;
}

export interface CommandArgument {
	/** Nom utilise comme cle dans `CommandContext.args`. */
	name: string;
	description: string;
	/** Defaut : true. */
	required?: boolean;
	/** Collecte tous les arguments restants dans un tableau. */
	variadic?: boolean;
	defaultValue?: string;
}

export interface CommandOption {
	/** Syntaxe Commander, ex. `-f, --force` ou `--path <dir>`. */
	flags: string;
	description: string;
	defaultValue?: string | boolean;
}

export interface CommandContext {
	/** Arguments positionnels, indexes par `CommandArgument.name`. */
	readonly args: Readonly<Record<string, string | string[] | undefined>>;
	readonly options: Readonly<Record<string, unknown>>;
	/** Repertoire de travail effectif (respecte `--cwd`). */
	readonly cwd: string;
	/** Racine du projet Rowork (dossier contenant rowork.json), si on est dedans. */
	readonly projectRoot: string | undefined;
	readonly config: RoworkConfig | undefined;
	readonly logger: Logger;
	readonly roworkVersion: string;
}

export interface CommandDefinition {
	/** Nom invoque, ex. `init` ou `make:service`. */
	name: string;
	description: string;
	aliases?: string[];
	arguments?: CommandArgument[];
	options?: CommandOption[];
	run(context: CommandContext): Promise<void> | void;
}

export interface PluginContext {
	registerCommand(definition: CommandDefinition): void;
	readonly logger: Logger;
	readonly cwd: string;
	readonly projectRoot: string | undefined;
	readonly config: RoworkConfig | undefined;
	readonly roworkVersion: string;
}

export interface RoworkPlugin {
	/** Nom affiche dans les logs et les conflits de commandes. */
	name: string;
	/** Doit valoir ROWORK_PLUGIN_API_VERSION. */
	apiVersion: number;
	/** Commandes declarees statiquement. */
	commands?: CommandDefinition[];
	/** Enregistrement dynamique et initialisation. */
	setup?(context: PluginContext): Promise<void> | void;
}

export interface RoworkConfig {
	$schema?: string;
	/** Nom du jeu. */
	name: string;
	/** Version du contrat attendue par le projet. */
	roworkApiVersion: number;
	/** Seul `roblox-ts` est supporte en v1 (voir CLAUDE.md, scope v1). */
	language: "roblox-ts";
	paths: {
		/** Sources TypeScript. */
		source: string;
		/** Sortie du compilateur roblox-ts. */
		out: string;
		/** Fichier projet Rojo. */
		rojoProject: string;
		/** Dossier des services Flamework (cible de make:service). */
		services: string;
		/** Dossier des controllers Flamework (cible de make:controller). */
		controllers: string;
		/** Dossier du code partage. */
		shared: string;
	};
	/** Specificateurs de modules plugins a charger explicitement. */
	plugins: string[];
}

/** Helper d'inference de types pour les auteurs de commandes. */
export function defineCommand(definition: CommandDefinition): CommandDefinition {
	return definition;
}

/** Helper d'inference de types pour les auteurs de plugins. */
export function definePlugin(plugin: RoworkPlugin): RoworkPlugin {
	return plugin;
}
