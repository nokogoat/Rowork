import { RoworkError } from "../cli/errors.js";
import {
	isVinegarInstalled,
	launchStudio,
	needsStudioSetup,
	setupStudio,
} from "../core/studio.js";
import { defineCommand } from "../plugins/api.js";

function requireLinux(command: string): void {
	if (!needsStudioSetup()) {
		throw new RoworkError(`\`rowork ${command}\` is only needed on Linux.`, {
			hint: "Roblox Studio runs natively on Windows and macOS: install it from roblox.com/create.",
		});
	}
}

export const studioCommand = defineCommand({
	name: "studio",
	description: "Launch Roblox Studio on Linux (through Vinegar).",
	run(context) {
		requireLinux("studio");

		if (!isVinegarInstalled()) {
			throw new RoworkError("Vinegar (Roblox Studio for Linux) is not installed.", {
				hint: "Run `rowork studio:setup` first.",
			});
		}

		launchStudio();
		context.logger.success("Launching Roblox Studio through Vinegar.");
		context.logger.info("The first launch downloads Studio, and you sign in to Roblox in the browser.");
	},
});

export const studioSetupCommand = defineCommand({
	name: "studio:setup",
	description: "Install Roblox Studio for Linux (Vinegar) and the Rojo plugin.",
	options: [{ flags: "--no-plugin", description: "skip installing the Rojo plugin" }],
	async run(context) {
		requireLinux("studio:setup");

		const result = await setupStudio({
			logger: context.logger,
			projectRoot: context.projectRoot,
			plugin: context.options["plugin"] !== false,
		});

		context.logger.blank();
		context.logger.success("Vinegar is ready.");
		context.logger.info("Next: `rowork studio` to launch it, then `rowork dev` in your project.");
		if (!result.pluginInstalled && context.options["plugin"] !== false) {
			context.logger.info("The Rojo plugin will be installed by re-running `rowork studio:setup` after the first launch.");
		}
	},
});
