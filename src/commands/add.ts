import { RoworkError } from "../cli/errors.js";
import { coreModules } from "../modules/index.js";
import type { ModuleDefinition } from "../modules/types.js";
import { installModule, installedModules } from "../core/modules.js";
import { defineCommand, type CommandDefinition } from "../plugins/api.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
import { requireProject } from "./make.js";

/** Does running the module with no option ask questions? See `ModuleDefinition.asksQuestions`. */
export function moduleAsks(definition: ModuleDefinition): boolean {
	return definition.asksQuestions ?? (definition.options ?? []).length > 0;
}

/** One `add:<name>` command per module, so each can have its own flags. */
export function moduleCommand(definition: ModuleDefinition): CommandDefinition {
	return defineCommand({
		name: `add:${definition.name}`,
		guided: moduleAsks(definition),
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
			// A module with nothing to ask (the linter) runs anywhere, terminal or not.
			const asksQuestions = moduleAsks(definition);
			if (!scripted && asksQuestions) {
				requireInteractive(`add:${definition.name}`, `rowork add:${definition.name} <options> (see --help)`);
			}

			await installModule(context, definition, root, !scripted && asksQuestions);
		},
	});
}

export const addCommand = defineCommand({
	name: "add",
	guided: true,
	arguments: [{ name: "module", description: "the feature to add, e.g. player-data (omit it to choose from a list)", required: false }],
	description: "Add a ready-made feature (a working pack of files) to your game, chosen from a list.",
	async run(context) {
		requireProject(context, "add");

		// `rowork add player-data`: the guided version of that module, no list.
		const named = context.args["module"];
		if (typeof named === "string") {
			const wanted = named.replace(/^add:/, "");
			const module = coreModules.find((candidate) => candidate.name === wanted);
			if (module === undefined) {
				const close = coreModules.filter((candidate) => candidate.name.startsWith(wanted.slice(0, 3))).map((candidate) => candidate.name);
				throw new RoworkError(`There is no feature called \`${wanted}\`.`, {
					hint: `Available: ${coreModules.map((candidate) => candidate.name).join(", ")}.${close.length > 0 ? ` Did you mean ${close.join(", ")}?` : ""}`,
				});
			}
			if (moduleAsks(module)) {
				requireInteractive(`add ${module.name}`, `rowork add:${module.name} <options> (see --help)`);
			}
			await moduleCommand(module).run({ ...context, args: {}, options: {} });
			return;
		}

		requireInteractive("add", "rowork add:<module> (run `rowork --help` to list them)");

		const installed = installedModules(context);
		prompts.intro("rowork add");
		const chosen = answered(
			await prompts.select({
				message: "Which feature do you want to add? (a working pack, not an empty file)",
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
