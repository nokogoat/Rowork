import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { ensureFlameworkPath, generateFile, toClassBase, withSuffix } from "../core/generate.js";
import {
	defineCommand,
	type CommandContext,
	type CommandDefinition,
	type RoworkConfig,
} from "../plugins/api.js";

type Side = "server" | "client";

const NAME_ARGUMENT = { name: "name", description: "name of the class, e.g. Inventory" };
const FORCE_OPTION = { flags: "-f, --force", description: "overwrite the file if it exists" };

function requireProject(context: CommandContext, command: string): { root: string; config: RoworkConfig } {
	if (context.projectRoot === undefined || context.config === undefined) {
		throw new RoworkError(`\`rowork ${command}\` must run inside a Rowork project.`, {
			hint: "No usable rowork.json found here or in any parent directory. Create a project with `rowork start`.",
		});
	}
	return { root: context.projectRoot, config: context.config };
}

function requireName(context: CommandContext, command: string): string {
	const name = context.args["name"];
	if (typeof name !== "string") {
		throw new RoworkError("Missing name.", { hint: `Usage: rowork ${command} <name>` });
	}
	return name;
}

/**
 * Generates one Flamework class, then makes sure the matching runtime entry
 * point scans its directory so the class is actually picked up.
 */
function generate(options: {
	context: CommandContext;
	command: string;
	kind: string;
	suffix: string;
	template: string;
	side: Side;
	directory: (config: RoworkConfig) => string;
	extraVariables?: (base: string) => Record<string, string>;
}): void {
	const { context } = options;
	const { root, config } = requireProject(context, options.command);
	const base = toClassBase(requireName(context, options.command));
	const className = withSuffix(base, options.suffix);
	const directory = options.directory(config);

	const written = generateFile({
		projectRoot: root,
		directory,
		fileName: `${className}.ts`,
		template: options.template,
		variables: { className, ...options.extraVariables?.(base) },
		force: context.options["force"] === true,
	});
	context.logger.success(`Created ${options.kind} ${className} (${written})`);

	const runtime = resolveProjectPath(root, join(config.paths.source, options.side, `runtime.${options.side}.ts`));
	if (ensureFlameworkPath(runtime, directory, context.logger)) {
		context.logger.step(`registered ${directory} in runtime.${options.side}.ts`);
	}
}

export const makeServiceCommand: CommandDefinition = defineCommand({
	name: "make:service",
	description: "Create a Flamework service (server-side singleton).",
	arguments: [NAME_ARGUMENT],
	options: [FORCE_OPTION],
	run(context) {
		generate({
			context,
			command: "make:service",
			kind: "service",
			suffix: "Service",
			template: "service",
			side: "server",
			directory: (config) => config.paths.services,
		});
	},
});

export const makeControllerCommand: CommandDefinition = defineCommand({
	name: "make:controller",
	description: "Create a Flamework controller (client-side singleton).",
	arguments: [NAME_ARGUMENT],
	options: [FORCE_OPTION],
	run(context) {
		generate({
			context,
			command: "make:controller",
			kind: "controller",
			suffix: "Controller",
			template: "controller",
			side: "client",
			directory: (config) => config.paths.controllers,
		});
	},
});

export const makeComponentCommand: CommandDefinition = defineCommand({
	name: "make:component",
	description: "Create a Flamework component (behaviour attached to tagged instances).",
	arguments: [NAME_ARGUMENT],
	options: [
		{ flags: "--side <side>", description: "server or client", defaultValue: "server" },
		{ flags: "--tag <tag>", description: "CollectionService tag (default: the name)" },
		FORCE_OPTION,
	],
	run(context) {
		const side = context.options["side"];
		if (side !== "server" && side !== "client") {
			throw new RoworkError(`Unknown side \`${String(side)}\`.`, {
				hint: "Use --side server or --side client.",
			});
		}

		const tag = context.options["tag"];
		if (typeof tag === "string" && !/^[A-Za-z0-9_.-]+$/.test(tag)) {
			throw new RoworkError(`\`${tag}\` is not a valid tag.`, {
				hint: "Use letters, digits, `_`, `-` or `.`.",
			});
		}
		generate({
			context,
			command: "make:component",
			kind: "component",
			suffix: "Component",
			template: "component",
			side,
			directory: (config) => `${config.paths.source}/${side}/components`,
			extraVariables: (base) => ({ tag: typeof tag === "string" ? tag : base }),
		});
	},
});
