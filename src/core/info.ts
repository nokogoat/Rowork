import { activeRegistry } from "../cli/registry.js";
import { coreModules } from "../modules/index.js";
import { coreIntegrations } from "../modules/integrations.js";
import { ROWORK_PLUGIN_API_VERSION, type RoworkConfig } from "../plugins/api.js";
import { runningRecord } from "./background.js";

/**
 * Everything Rowork knows about a project and about itself, as plain data.
 *
 * One source for `rowork info --json` and for the dashboard, so the two can never
 * disagree about what is installed or which commands exist.
 */
export function collectInfo(input: {
	config: RoworkConfig | undefined;
	projectRoot: string | undefined;
	roworkVersion: string;
}) {
	const { config, projectRoot } = input;
	const installed = config?.modules ?? [];
	const appliedIntegrations = config?.integrations ?? [];
	const dev = projectRoot === undefined ? undefined : runningRecord(projectRoot);

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

	return {
		rowork: { version: input.roworkVersion, pluginApiVersion: ROWORK_PLUGIN_API_VERSION },
		project:
			projectRoot === undefined || config === undefined
				? null
				: {
						name: config.name,
						root: projectRoot,
						language: config.language,
						paths: config.paths,
						modules: installed,
						integrations: appliedIntegrations,
						devRunningInBackground: dev === undefined ? null : { pid: dev.pid, port: dev.port },
					},
		modules,
		integrations,
		commands,
	};
}
