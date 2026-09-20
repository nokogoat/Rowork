import pc from "picocolors";

import { activeRegistry } from "../cli/registry.js";
import { runningRecord } from "../core/background.js";
import { syncAgentDocs } from "../core/agent-docs.js";
import { ROWORK_PLUGIN_API_VERSION, defineCommand } from "../plugins/api.js";
import { coreModules } from "../modules/index.js";
import { coreIntegrations } from "../modules/integrations.js";
import { requireProject } from "./make.js";

export const infoCommand = defineCommand({
	name: "info",
	description: "Show the project, what is installed and every available command (--json for scripts and AIs).",
	options: [{ flags: "--json", description: "print machine-readable JSON on stdout" }],
	run(context) {
		const installed = context.config?.modules ?? [];
		const dev =
			context.projectRoot === undefined ? undefined : runningRecord(context.projectRoot);

		const modules = coreModules.map((module) => ({
			name: module.name,
			title: module.title,
			description: module.description,
			installed: installed.includes(module.name),
			requires: module.requires ?? [],
			dependencies: module.dependencies ?? [],
			command: `add:${module.name}`,
			options: (module.options ?? []).map((option) => ({ flags: option.flags, description: option.description })),
		}));

		const appliedIntegrations = context.config?.integrations ?? [];
		const integrations = coreIntegrations.map((integration) => ({
			name: integration.name,
			title: integration.title,
			description: integration.description,
			modules: integration.modules,
			applied: appliedIntegrations.includes(integration.name),
		}));

		const commands = (activeRegistry()?.all() ?? []).map(({ definition }) => ({
			name: definition.name,
			description: definition.description,
			guided: definition.guided === true,
			arguments: (definition.arguments ?? []).map((argument) => ({
				name: argument.name,
				description: argument.description,
				required: argument.required ?? true,
				variadic: argument.variadic === true,
			})),
			options: (definition.options ?? []).map((option) => ({ flags: option.flags, description: option.description })),
		}));

		if (context.options["json"] === true) {
			const output = {
				rowork: { version: context.roworkVersion, pluginApiVersion: ROWORK_PLUGIN_API_VERSION },
				project:
					context.projectRoot === undefined || context.config === undefined
						? null
						: {
								name: context.config.name,
								root: context.projectRoot,
								language: context.config.language,
								paths: context.config.paths,
								modules: installed,
								integrations: appliedIntegrations,
								devRunningInBackground: dev === undefined ? null : { pid: dev.pid, port: dev.port },
							},
				modules,
				integrations,
				commands,
			};
			process.stdout.write(`${JSON.stringify(output, undefined, 2)}\n`);
			return;
		}

		const { logger } = context;
		logger.info(`${pc.bold("Rowork")} ${context.roworkVersion}`);
		if (context.projectRoot === undefined || context.config === undefined) {
			logger.info(pc.dim("Not inside a Rowork project. `rowork start` creates one."));
			return;
		}
		logger.info(`${pc.bold(context.config.name)} ${pc.dim(context.projectRoot)}`);
		logger.info(`  dev: ${dev === undefined ? "not running in the background" : `running in the background (pid ${dev.pid}, port ${dev.port})`}`);
		logger.blank();
		logger.info(pc.bold("Modules"));
		for (const module of modules) {
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
