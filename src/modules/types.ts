import type { CommandOption, RoworkConfig } from "../plugins/api.js";

/** One file a module writes into the project. */
export interface ModuleFile {
	/** Template under `templates/modules/`, without the `.ts.tmpl` suffix. */
	template: string;
	/** Destination directory, relative to the project root. */
	directory: string;
	fileName: string;
	variables: Record<string, string>;
}

/** Everything a module decided to do, once its options are known. */
export interface ModulePlan {
	files: ModuleFile[];
	/** Flamework directories the module's classes live in, to be registered. */
	register: { side: "server" | "client"; directory: string }[];
	/** Short lines printed after installation: what was added, what to do next. */
	notes: string[];
}

export interface PlanInput {
	/** True when the user ran the command with no options: ask the questions. */
	guided: boolean;
	options: Readonly<Record<string, unknown>>;
	config: RoworkConfig;
	/** Root of the project, for modules that read what is already there. */
	projectRoot: string;
}

/**
 * A module: a small, readable set of files copied into the user's project.
 *
 * The user owns those files afterwards and is expected to read and edit them,
 * which is why a module never installs an opaque runtime of its own.
 */
export interface ModuleDefinition {
	/** Kebab-case identifier, also the command suffix: `add:<name>`. */
	name: string;
	/** Human name shown in menus. */
	title: string;
	description: string;
	/** Other modules that must be installed first. */
	requires?: string[];
	/** npm packages to install. Versions are resolved by npm, never hardcoded. */
	dependencies?: string[];
	/**
	 * How to use the module once installed, written for whoever reads the
	 * project's AGENTS.md next: a person learning it, or an AI working in it.
	 * Short imperative lines: where the code is, what to call, what to edit.
	 */
	agentGuide?: string[];
	/** Flags for the scripted form. */
	options?: CommandOption[];
	plan(input: PlanInput): Promise<ModulePlan> | ModulePlan;
}
