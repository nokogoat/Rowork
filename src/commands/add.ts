import { coreModules } from "../modules/index.js";
import type { ModuleDefinition } from "../modules/types.js";
import { installModule, installedModules } from "../core/modules.js";
import { defineCommand, type CommandDefinition } from "../plugins/api.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
import { requireProject } from "./make.js";

/** One `add:<name>` command per module, so each can have its own flags. */
export function moduleCommand(definition: ModuleDefinition): CommandDefinition {
	return defineCommand({
		name: `add:${definition.name}`,
		description: `Add the ${definition.title} module: ${definition.description}`,
		options: [
			...(definition.options ?? []),
			...(definition.dependencies === undefined
				? []
				: [{ flags: "--no-install", description: "do not run npm install" }]),
		],
		async run(context) {
			const { root } = requireProject(context, `add:${definition.name}`);

			// Guided when nothing was given on the command line.
			const scripted = Object.keys(context.options).some(
				(key) => key !== "install" && context.options[key] !== undefined,
			);
			if (!scripted) {
				requireInteractive(`add:${definition.name}`, `rowork add:${definition.name} <options> (see --help)`);
			}

			await installModule(context, definition, root, !scripted);
		},
	});
}

export const addCommand = defineCommand({
	name: "add",
	description: "Add a ready-made feature to your game, chosen from a list.",
	async run(context) {
		requireProject(context, "add");
		requireInteractive("add", "rowork add:<module> (run `rowork --help` to list them)");

		const installed = installedModules(context);
		prompts.intro("rowork add");
		const chosen = answered(
			await prompts.select({
				message: "What do you want to add?",
				options: coreModules.map((module) => ({
					value: module.name,
					label: installed.includes(module.name) ? `${module.title} (installed)` : module.title,
					hint: module.description,
				})),
			}),
		);

		const module = coreModules.find((candidate) => candidate.name === chosen);
		if (module === undefined) return;
		await moduleCommand(module).run({ ...context, args: {}, options: {} });
	},
});
