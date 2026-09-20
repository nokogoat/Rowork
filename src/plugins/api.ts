/**
 * PUBLIC PLUGIN API CONTRACT.
 *
 * Everything exported here is exposed to third-party plugins through
 * `rowork/plugin`.
 *
 * Non-negotiable rule (see CLAUDE.md): any breaking change to this file bumps
 * ROWORK_PLUGIN_API_VERSION. Plugins declaring a different version are skipped
 * with a warning, never loaded anyway.
 */

/** Plugin contract version. Bump on every breaking change. */
export const ROWORK_PLUGIN_API_VERSION = 1;

export interface Logger {
	debug(message: string): void;
	info(message: string): void;
	success(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	/** Indented progress line, for the steps of a running command. */
	step(message: string): void;
	blank(): void;
}

export interface CommandArgument {
	/** Name used as the key in `CommandContext.args`. */
	name: string;
	description: string;
	/** Defaults to true. */
	required?: boolean;
	/** Collects every remaining argument into an array. */
	variadic?: boolean;
	defaultValue?: string;
}

export interface CommandOption {
	/** Commander syntax, e.g. `-f, --force` or `--path <dir>`. */
	flags: string;
	description: string;
	defaultValue?: string | boolean;
}

export interface CommandContext {
	/** Positional arguments, keyed by `CommandArgument.name`. */
	readonly args: Readonly<Record<string, string | string[] | undefined>>;
	readonly options: Readonly<Record<string, unknown>>;
	/** Effective working directory, honouring `--cwd`. */
	readonly cwd: string;
	/** Root of the Rowork project (the directory holding rowork.json), if any. */
	readonly projectRoot: string | undefined;
	readonly config: RoworkConfig | undefined;
	readonly logger: Logger;
	readonly roworkVersion: string;
}

export interface CommandDefinition {
	/** Invocation name, e.g. `init` or `make:service`. */
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
	/** Name shown in logs and command conflict warnings. */
	name: string;
	/** Must equal ROWORK_PLUGIN_API_VERSION. */
	apiVersion: number;
	/** Statically declared commands. */
	commands?: CommandDefinition[];
	/** Dynamic registration and initialisation. */
	setup?(context: PluginContext): Promise<void> | void;
}

export interface RoworkConfig {
	$schema?: string;
	/** Game name. */
	name: string;
	/** Contract version this project expects. */
	roworkApiVersion: number;
	/** Only `roblox-ts` is supported in v1 (see CLAUDE.md, v1 scope). */
	language: "roblox-ts";
	paths: {
		/** TypeScript sources. */
		source: string;
		/** roblox-ts compiler output. */
		out: string;
		/** Rojo project file. */
		rojoProject: string;
		/** Flamework services directory (target of make:service). */
		services: string;
		/** Flamework controllers directory (target of make:controller). */
		controllers: string;
		/** Shared code directory. */
		shared: string;
	};
	/** Plugin module specifiers to load explicitly. */
	plugins: string[];
	/** Names of the modules installed with `rowork add`. */
	modules?: string[];
}

/** Type-inference helper for command authors. */
export function defineCommand(definition: CommandDefinition): CommandDefinition {
	return definition;
}

/** Type-inference helper for plugin authors. */
export function definePlugin(plugin: RoworkPlugin): RoworkPlugin {
	return plugin;
}
