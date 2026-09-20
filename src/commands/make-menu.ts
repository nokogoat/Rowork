import { defineCommand, type CommandDefinition } from "../plugins/api.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
import { makeToolCommand } from "./make-tool.js";
import { makeComponentCommand, makeControllerCommand, makeServiceCommand, requireProject } from "./make.js";

interface Choice {
	command: CommandDefinition;
	label: string;
	hint: string;
}

/** Everything `rowork make` can create, in the order most people need it. */
const CHOICES: Choice[] = [
	{ command: makeToolCommand, label: "Tool", hint: "something a player holds and uses: pickaxe, sword, torch" },
	{ command: makeServiceCommand, label: "Service", hint: "server-side logic: data, rules, spawning" },
	{ command: makeControllerCommand, label: "Controller", hint: "client-side logic: input, camera, effects" },
	{ command: makeComponentCommand, label: "Component", hint: "behaviour attached to tagged objects: doors, pickups" },
];

export const makeCommand = defineCommand({
	name: "make",
	guided: true,
	description: "Create a file in the right place and connect it where it is needed (choose from a list).",
	async run(context) {
		requireProject(context, "make");
		requireInteractive("make", "rowork make:tool <name>, make:service <name>, make:controller <name> or make:component <name>");

		prompts.intro("rowork make");
		const chosen = answered(
			await prompts.select({
				message: "Which file do you want to create? (Rowork puts it in the right place and connects it)",
				options: CHOICES.map((choice) => ({ value: choice.command.name, label: choice.label, hint: choice.hint })),
			}),
		);

		const choice = CHOICES.find((candidate) => candidate.command.name === chosen);
		if (choice === undefined) return;

		// No argument and no option: the chosen command runs its guided version.
		await choice.command.run({ ...context, args: {}, options: {} });
	},
});
