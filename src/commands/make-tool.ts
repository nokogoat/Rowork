import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { ensureFlameworkPath, generateFile, importPath, toClassBase } from "../core/generate.js";
import { defineCommand } from "../plugins/api.js";

export const makeToolCommand = defineCommand({
	name: "make:tool",
	description: "Create a tool (a Roblox Tool with its config, server behaviour and service).",
	arguments: [{ name: "name", description: "name of the tool, e.g. Pickaxe" }],
	options: [{ flags: "-f, --force", description: "overwrite the tool's own files if they exist" }],
	run(context) {
		const { projectRoot: root, config } = context;
		if (root === undefined || config === undefined) {
			throw new RoworkError("`rowork make:tool` must run inside a Rowork project.", {
				hint: "No usable rowork.json found here or in any parent directory. Create a project with `rowork start`.",
			});
		}

		const raw = context.args["name"];
		if (typeof raw !== "string") {
			throw new RoworkError("Missing name.", { hint: "Usage: rowork make:tool <name>" });
		}

		// `Pickaxe` and `PickaxeTool` both mean the same tool.
		const base = toClassBase(raw).replace(/(?<=.)Tool$/, "");
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

		// Shared infrastructure first, created once and never overwritten: a
		// failure on the tool's own files then leaves no half-written state
		// beyond files that are harmless to keep.
		write(sharedDirectory, "ToolDefinition.ts", "tool-definition", {}, false);
		write(
			servicesDirectory,
			"ToolService.ts",
			"tool-service",
			{ definitionImport: importPath(root, servicesDirectory, `${sharedDirectory}/ToolDefinition`) },
			false,
		);

		write(sharedDirectory, `${constName}.ts`, "tool-config", { constName, base, tag: constName }, true);
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

		for (const file of created) context.logger.step(file);
		context.logger.success(`Created tool ${base}`);

		const runtime = resolveProjectPath(root, join(config.paths.source, "server", "runtime.server.ts"));
		for (const directory of [servicesDirectory, componentsDirectory]) {
			if (ensureFlameworkPath(runtime, directory, context.logger)) {
				context.logger.step(`registered ${directory} in runtime.server.ts`);
			}
		}

		context.logger.blank();
		context.logger.info("Give it to a player from any service:");
		context.logger.info(`  this.tools.give(player, ${constName});`);
		context.logger.info(`Put your gameplay in ${constName}Component.activate().`);
	},
});
