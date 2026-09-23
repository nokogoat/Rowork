import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { formatGenerated } from "../core/format-generated.js";
import { ensureFlameworkPath, generateFile, toClassBase, withSuffix } from "../core/generate.js";
import {
	defineCommand,
	type CommandContext,
	type CommandDefinition,
	type RoworkConfig,
} from "../plugins/api.js";
import { listStats } from "../core/project-index.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
import { askStatLink, resolveStats, serviceMembers } from "./links.js";

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
async function generate(options: {
	context: CommandContext;
	command: string;
	name: string;
	kind: string;
	suffix: string;
	template: string;
	side: Side;
	directory: (config: RoworkConfig) => string;
	extraVariables?: (base: string) => Record<string, string>;
}): Promise<void> {
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
	if (written !== undefined) await formatGenerated(root, [resolveProjectPath(root, join(directory, `${className}.ts`))], context.logger);
}

export const makeServiceCommand: CommandDefinition = defineCommand({
	name: "make:service",
	guided: true,
	description: "Create a service file (server logic) in the right place and register it with Flamework.",
	arguments: [NAME_ARGUMENT],
	options: [
		{ flags: "--uses <values>", description: "saved values it uses, comma separated (e.g. kills,coins): injected for you" },
		FORCE_OPTION,
	],
	async run(context) {
		const { root, config } = requireProject(context, "make:service");
		const { name, guided } = await nameOrAsk(context, "make:service", "What is the service called?", "Inventory");

		// "Link it to...?": the saved values this service works with, injected for you.
		const typed =
			typeof context.options["uses"] === "string"
				? context.options["uses"]
				: guided
					? await askStatLink(root, config, "Does it use saved values? Type their names, separated by commas.", false)
					: undefined;
		const linked = typed === undefined ? [] : resolveStats(listStats(root, config), typed, "try again");
		const injected = serviceMembers(root, config, linked);

		await generate({
			context,
			command: "make:service",
			name,
			kind: "service",
			suffix: "Service",
			template: "service",
			side: "server",
			directory: (cfg) => cfg.paths.services,
			extraVariables: () => ({ imports: injected.imports, members: injected.members }),
		});
		if (linked.length > 0) context.logger.step(`linked to ${linked.map((stat) => stat.name).join(", ")}: injected in the constructor`);
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
		await generate({
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
		{ flags: "--instance <class>", description: "Roblox class it attaches to, for typed access to `this.instance` (default: Instance)" },
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
		let instanceType: unknown = context.options["instance"] ?? "Instance";

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
			// So `this.instance` is typed, instead of the generic `Instance` (no properties of its own).
			instanceType = answered(
				await prompts.select({
					message: "What kind of object does it attach to?",
					options: [
						{ value: "BasePart", label: "A physical object", hint: "a door, a pickup, a chest" },
						{ value: "Model", label: "A model", hint: "a group of parts" },
						{ value: "Tool", label: "A tool", hint: "an item a player can hold" },
						{ value: "GuiButton", label: "A UI button", hint: "TextButton or ImageButton" },
						{ value: "Instance", label: "Anything", hint: "no particular type, works on any instance" },
						{ value: "other", label: "Other...", hint: "type the Roblox class yourself" },
					],
					initialValue: "Instance",
				}),
			);
			if (instanceType === "other") {
				instanceType = answered(
					await prompts.text({
						message: "Which Roblox class? (e.g. Humanoid, SurfaceGui, BillboardGui)",
						placeholder: "Instance",
						validate: (value) => (/^[A-Za-z][A-Za-z0-9]*$/.test(value ?? "") ? undefined : "A class name: letters and digits, starting with a letter."),
					}),
				);
			}
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
		if (typeof instanceType !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(instanceType)) {
			throw new RoworkError(`\`${String(instanceType)}\` is not a Roblox class name.`, {
				hint: "Use a class from the Roblox API, e.g. BasePart, Model, Tool, GuiButton.",
			});
		}

		const chosenSide: Side = side;
		const chosenInstanceType = instanceType;
		await generate({
			context,
			command: "make:component",
			name,
			kind: "component",
			suffix: "Component",
			template: "component",
			side: chosenSide,
			directory: (config) => `${config.paths.source}/${chosenSide}/components`,
			extraVariables: (base) => ({
				tag: typeof tag === "string" && tag !== "" ? tag : base,
				instanceType: chosenInstanceType,
				generics: chosenInstanceType === "Instance" ? "" : `<{}, ${chosenInstanceType}>`,
			}),
		});
	},
});
