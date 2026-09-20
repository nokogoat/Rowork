import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import {
	ensureFlameworkPath,
	generateFile,
	importPath,
	toClassBase,
	writeToolRegistry,
} from "../core/generate.js";
import { defineCommand, type CommandContext } from "../plugins/api.js";
import { answered, prompts } from "../ui/prompt.js";
import { nameOrAsk, requireProject } from "./make.js";

interface ToolSettings {
	cooldown: number;
	canBeDropped: boolean;
	giveOnSpawn: boolean;
}

function parseCooldown(value: string): number | undefined {
	const number = Number(value.replace(",", "."));
	return value.trim() !== "" && Number.isFinite(number) && number >= 0 && number <= 3600
		? number
		: undefined;
}

async function askSettings(): Promise<ToolSettings> {
	const cooldown = answered(
		await prompts.text({
			message: "Seconds to wait between two uses?",
			placeholder: "0.5",
			defaultValue: "0.5",
			validate: (value) =>
				parseCooldown(value || "0.5") === undefined ? "A number between 0 and 3600." : undefined,
		}),
	);
	const canBeDropped = answered(
		await prompts.confirm({ message: "Can the player drop it on the ground?", initialValue: false }),
	);
	const giveOnSpawn = answered(
		await prompts.confirm({
			message: "Give it to every player when they spawn?",
			initialValue: true,
		}),
	);
	return { cooldown: parseCooldown(cooldown || "0.5") ?? 0.5, canBeDropped, giveOnSpawn };
}

function settingsFromOptions(context: CommandContext): ToolSettings {
	const raw = context.options["cooldown"];
	const cooldown = typeof raw === "string" ? parseCooldown(raw) : 0.5;
	if (cooldown === undefined) {
		throw new RoworkError(`\`${String(raw)}\` is not a valid cooldown.`, {
			hint: "Use a number of seconds between 0 and 3600, e.g. --cooldown 0.5",
		});
	}
	return {
		cooldown,
		canBeDropped: context.options["droppable"] === true,
		giveOnSpawn: context.options["giveOnSpawn"] !== false,
	};
}

export const makeToolCommand = defineCommand({
	name: "make:tool",
	guided: true,
	description: "Create a tool players hold: settings, behaviour, and automatic delivery.",
	arguments: [
		{
			name: "name",
			description: "name of the tool, e.g. Pickaxe (omit it for the guided version)",
			required: false,
		},
	],
	options: [
		{ flags: "--cooldown <seconds>", description: "seconds between two uses (default 0.5)" },
		{ flags: "--droppable", description: "the player can drop it" },
		{ flags: "--no-give-on-spawn", description: "do not give it to players automatically" },
		{ flags: "-f, --force", description: "overwrite the tool's own files if they exist" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "make:tool");

		const { name, guided } = await nameOrAsk(context, "make:tool", "What is the tool called?", "Pickaxe");
		const settings = guided ? await askSettings() : settingsFromOptions(context);

		// `Pickaxe` and `PickaxeTool` both mean the same tool.
		const base = toClassBase(name).replace(/(?<=.)Tool$/, "");
		const constName = `${base}Tool`;
		const force = context.options["force"] === true;

		const sharedDirectory = `${config.paths.shared}/tools`;
		const componentsDirectory = `${config.paths.source}/server/components`;
		const servicesDirectory = config.paths.services;

		const created: string[] = [];
		const write = (
			directory: string,
			fileName: string,
			template: string,
			variables: Record<string, string>,
			own: boolean,
		): void => {
			const written = generateFile({
				projectRoot: root,
				directory,
				fileName,
				template,
				variables,
				force: own && force,
				ifExists: own ? "fail" : "skip",
			});
			if (written !== undefined) created.push(written);
		};

		// Shared files first, created once and never overwritten: a failure on
		// the tool's own files then leaves nothing harmful behind.
		write(sharedDirectory, "ToolDefinition.ts", "tool-definition", {}, false);
		write(
			servicesDirectory,
			"ToolService.ts",
			"tool-service",
			{
				definitionImport: importPath(root, servicesDirectory, `${sharedDirectory}/ToolDefinition`),
				registryImport: importPath(root, servicesDirectory, `${sharedDirectory}/index`),
			},
			false,
		);

		write(
			sharedDirectory,
			`${constName}.ts`,
			"tool-config",
			{
				constName,
				base,
				tag: constName,
				cooldown: String(settings.cooldown),
				canBeDropped: String(settings.canBeDropped),
				giveOnSpawn: String(settings.giveOnSpawn),
			},
			true,
		);
		write(
			componentsDirectory,
			`${constName}Component.ts`,
			"tool-component",
			{
				constName,
				base,
				tag: constName,
				className: `${constName}Component`,
				configImport: importPath(root, componentsDirectory, `${sharedDirectory}/${constName}`),
			},
			true,
		);

		writeToolRegistry(root, sharedDirectory);

		const runtime = resolveProjectPath(root, join(config.paths.source, "server", "runtime.server.ts"));
		for (const directory of [servicesDirectory, componentsDirectory]) {
			if (ensureFlameworkPath(runtime, directory, context.logger)) {
				context.logger.step(`registered ${directory} in runtime.server.ts`);
			}
		}

		for (const file of created) context.logger.step(file);
		context.logger.success(`Created tool ${base}`);
		context.logger.blank();
		context.logger.info(
			settings.giveOnSpawn
				? `Every player gets the ${base} when they spawn.`
				: `The ${base} is not given automatically: settings are in ${sharedDirectory}/${constName}.ts.`,
		);
		context.logger.info(`Write what it does in ${componentsDirectory}/${constName}Component.ts (activate).`);
		context.logger.info(`Change its settings later in ${sharedDirectory}/${constName}.ts.`);
	},
});
