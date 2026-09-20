import { resolve } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { scaffoldProject } from "../core/scaffold.js";
import { defineCommand } from "../plugins/api.js";
import { isInteractive } from "../ui/prompt.js";
import { printNextSteps } from "./next-steps.js";
import { startCommand } from "./start.js";

export const initCommand = defineCommand({
	name: "init",
	guided: true,
	description: "Create a ready-to-run Roblox project (roblox-ts + Flamework + Rojo).",
	arguments: [
		{ name: "name", description: "project name, also used as the directory name", required: false },
	],
	options: [
		{ flags: "--path <dir>", description: "parent directory to create the project in" },
		{ flags: "--no-install", description: "skip installing npm dependencies" },
		{ flags: "--no-rokit", description: "skip installing the pinned Roblox toolchain" },
		{ flags: "--install-rokit", description: "download and install Rokit if it is missing" },
		{ flags: "--no-git", description: "skip git repository initialisation" },
		{ flags: "--no-examples", description: "skip the example service and controller" },
		{ flags: "-f, --force", description: "allow a target directory that is not empty" },
	],
	async run(context) {
		const name = context.args["name"];
		if (typeof name !== "string") {
			// No name given: this is the guided version of the command.
			if (isInteractive()) return startCommand.run(context);
			throw new RoworkError("Missing project name.", {
				hint: `Usage: rowork init <name>. In a terminal, ${pc.bold("rowork init")} alone starts the guided setup.`,
			});
		}

		const result = await scaffoldProject(
			{
				name,
				parent:
					typeof context.options["path"] === "string"
						? resolve(context.cwd, context.options["path"])
						: context.cwd,
				install: context.options["install"] !== false,
				rokit: context.options["rokit"] !== false,
				installRokit: context.options["installRokit"] === true,
				git: context.options["git"] !== false,
				examples: context.options["examples"] !== false,
				force: context.options["force"] === true,
				roworkVersion: context.roworkVersion,
			},
			context.logger,
		);

		printNextSteps(context.logger, name, result);
	},
});
