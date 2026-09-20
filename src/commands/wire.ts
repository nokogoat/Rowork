import { applyPendingIntegrations, pendingIntegrations } from "../core/modules.js";
import { syncAgentDocs } from "../core/agent-docs.js";
import { loadConfig } from "../core/config.js";
import { defineCommand } from "../plugins/api.js";
import { requireProject } from "./make.js";

export const wireCommand = defineCommand({
	name: "wire",
	description: "Connect the installed modules that work together (done automatically by `rowork add`).",
	options: [{ flags: "--dry-run", description: "list what would be wired and change nothing" }],
	async run(context) {
		const { root, config } = requireProject(context, "wire");
		const pending = pendingIntegrations(config);

		if (pending.length === 0) {
			context.logger.info("Everything that can be wired together already is.");
			return;
		}

		if (context.options["dryRun"] === true) {
			for (const integration of pending) {
				context.logger.step(`${integration.title}: ${integration.description} (${integration.modules.join(" + ")})`);
			}
			context.logger.info("Dry run: nothing was changed.");
			return;
		}

		const applied = await applyPendingIntegrations(context, root);
		if (applied.length > 0) {
			syncAgentDocs(root, loadConfig(root), context.roworkVersion);
			context.logger.success(`Wired: ${applied.join(", ")}.`);
		} else {
			process.exitCode = 1;
		}
	},
});
