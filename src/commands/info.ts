import pc from "picocolors";

import { syncAgentDocs } from "../core/agent-docs.js";
import { collectInfo } from "../core/info.js";
import { defineCommand } from "../plugins/api.js";
import { requireProject } from "./make.js";

export const infoCommand = defineCommand({
	name: "info",
	description: "Show the project, what is installed and every available command (--json for scripts and AIs).",
	options: [{ flags: "--json", description: "print machine-readable JSON on stdout" }],
	run(context) {
		const info = collectInfo({
			config: context.config,
			projectRoot: context.projectRoot,
			roworkVersion: context.roworkVersion,
		});

		if (context.options["json"] === true) {
			process.stdout.write(`${JSON.stringify(info, undefined, 2)}\n`);
			return;
		}

		const { logger } = context;
		logger.info(`${pc.bold("Rowork")} ${context.roworkVersion}`);
		if (info.project === null) {
			logger.info(pc.dim("Not inside a Rowork project. `rowork start` creates one."));
			return;
		}
		const dev = info.project.dev;
		logger.info(`${pc.bold(info.project.name)} ${pc.dim(info.project.root)}`);
		logger.info(`  dev: ${dev === null ? "not running" : `running ${dev.mode === "foreground" ? "in a terminal" : "in the background"} (pid ${dev.pid}, port ${dev.port})`}`);
		logger.blank();
		logger.info(pc.bold("Modules"));
		for (const module of info.modules) {
			logger.info(`  ${module.installed ? pc.green("installed") : pc.dim("available")}  ${module.name}: ${module.description}`);
		}
		logger.blank();
		logger.info(pc.dim("`rowork info --json` prints all of this, and every command, for scripts and AIs."));
	},
});

export const agentsSyncCommand = defineCommand({
	name: "agents:sync",
	description: "Create or refresh AGENTS.md (instructions for AIs and newcomers) from the project's current state.",
	run(context) {
		const { root, config } = requireProject(context, "agents:sync");
		const touched = syncAgentDocs(root, config, context.roworkVersion);
		if (touched.length === 0) context.logger.info("AGENTS.md is already up to date.");
		else context.logger.success(`Updated ${touched.join(", ")}.`);
	},
});
