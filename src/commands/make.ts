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
import { answered, prompts, requireInteractive } from "../ui/prompt.js";

export type Side = "server" | "client";

const NAME_ARGUMENT = {
	name: "name",
	description: "name of the class, e.g. Inventory (omit it for the guided version)",
	required: false,
};
const FORCE_OPTION = { flags: "-f, --force", description: "overwrite the file if it exists" };

export function requireProject(
	context: CommandContext,
	command: string,
): { root: string; config: RoworkConfig } {
	if (context.projectRoot === undefined || context.config === undefined) {
		throw new RoworkError(`\`rowork ${command}\` must run inside a Rowork project.`, {
			hint: "No usable rowork.json found here or in any parent directory. Create a project with `rowork start`.",
		});
	}
	return { root: context.projectRoot, config: context.config };
}

/** Validates a name typed in a prompt, using the same rules as the command line. */
export function validateName(value: string | undefined): string | undefined {
	try {
		toClassBase((value ?? "").trim());
		return undefined;
	} catch (error) {
		return error instanceof RoworkError ? error.message : String(error);
	}
}

/**
 * The name from the command line, or, in a terminal with none given, from a
 * question. `undefined` guided means the caller should also ask its other
 * questions.
 */
export async function nameOrAsk(
	context: CommandContext,
	command: string,
	message: string,
	placeholder: string,
): Promise<{ name: string; guided: boolean }> {
	const given = context.args["name"];
	if (typeof given === "string") return { name: given, guided: false };

	requireInteractive(command, `rowork ${command} <name>`);
	const name = answered(await prompts.text({ message, placeholder, validate: validateName })).trim();
	return { name, guided: true };
}

/**
 * Generates one Flamework class, then makes sure the matching runtime entry
 * point scans its directory so the class is actually picked up.
 */
function generate(options: {
	context: CommandContext;
	command: string;
	name: string;
	kind: string;
	suffix: string;
	template: string;
	side: Side;
	directory: (config: RoworkConfig) => string;
	extraVariables?: (base: string) => Record<string, string>;
}): void {
	const { context } = options;
	const { root, config } = requireProject(context, options.command);
	const base = toClassBase(options.name);
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
	context.logger.success(`Created ${options.kind} ${className} (${written ?? directory})`);

	const runtime = resolveProjectPath(root, join(config.paths.source, options.side, `runtime.${options.side}.ts`));
	if (ensureFlameworkPath(runtime, directory, context.logger)) {
		context.logger.step(`registered ${directory} in runtime.${options.side}.ts`);
	}
}

export const makeServiceCommand: CommandDefinition = defineCommand({
	name: "make:service",
	guided: true,
	description: "Create a service file (server logic) in the right place and register it with Flamework.",
	arguments: [NAME_ARGUMENT],
	options: [FORCE_OPTION],
	async run(context) {
		requireProject(context, "make:service");
		const { name } = await nameOrAsk(context, "make:service", "What is the service called?", "Inventory");
		generate({
			context,
			command: "make:service",
			name,
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
	guided: true,
	description: "Create a controller file (client logic) in the right place and register it with Flamework.",
	arguments: [NAME_ARGUMENT],
	options: [FORCE_OPTION],
	async run(context) {
		requireProject(context, "make:controller");
		const { name } = await nameOrAsk(context, "make:controller", "What is the controller called?", "Camera");
		generate({
			context,
			command: "make:controller",
			name,
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
	guided: true,
	description: "Create a component file (behaviour for tagged objects) in the right place and register it with Flamework.",
	arguments: [NAME_ARGUMENT],
	options: [
		{ flags: "--side <side>", description: "server (default) or client" },
		{ flags: "--tag <tag>", description: "CollectionService tag (default: the name)" },
		FORCE_OPTION,
	],
	async run(context) {
		requireProject(context, "make:component");
		const { name, guided } = await nameOrAsk(
			context,
			"make:component",
			"What is the component called?",
			"Door",
		);

		let side: unknown = context.options["side"] ?? "server";
		let tag: unknown = context.options["tag"];

		if (guided) {
			side = answered(
				await prompts.select({
					message: "Where does it run?",
					options: [
						{ value: "server", label: "Server", hint: "game rules, data, anything players must not cheat" },
						{ value: "client", label: "Client", hint: "visuals, input, UI" },
					],
					initialValue: "server",
				}),
			);
			tag = answered(
				await prompts.text({
					message: "Which tag makes it attach to an instance?",
					placeholder: toClassBase(name),
					defaultValue: toClassBase(name),
					validate: (value) =>
						/^[A-Za-z0-9_.-]*$/.test(value ?? "") ? undefined : "Letters, digits, _ - . only.",
				}),
			);
		}

		if (side !== "server" && side !== "client") {
			throw new RoworkError(`Unknown side \`${String(side)}\`.`, {
				hint: "Use --side server or --side client.",
			});
		}
		if (typeof tag === "string" && !/^[A-Za-z0-9_.-]+$/.test(tag)) {
			throw new RoworkError(`\`${tag}\` is not a valid tag.`, {
				hint: "Use letters, digits, `_`, `-` or `.`.",
			});
		}

		const chosenSide: Side = side;
		generate({
			context,
			command: "make:component",
			name,
			kind: "component",
			suffix: "Component",
			template: "component",
			side: chosenSide,
			directory: (config) => `${config.paths.source}/${chosenSide}/components`,
			extraVariables: (base) => ({ tag: typeof tag === "string" && tag !== "" ? tag : base }),
		});
	},
});
