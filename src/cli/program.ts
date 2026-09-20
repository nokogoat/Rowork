import { Command } from "commander";
import pc from "picocolors";

import type { CommandContext, RoworkConfig } from "../plugins/api.js";
import { logger } from "../ui/logger.js";
import type { CommandRegistry } from "./registry.js";

export interface ProgramOptions {
	registry: CommandRegistry;
	cwd: string;
	projectRoot: string | undefined;
	config: RoworkConfig | undefined;
	roworkVersion: string;
}

/**
 * Builds the Commander instance from the registry.
 *
 * Core commands and plugin commands go through exactly the same path: the core
 * consumes its own public contract, which guarantees that a regression in the
 * plugin API also breaks the CLI, and is therefore noticed immediately.
 */
export function createProgram(options: ProgramOptions): Command {
	const program = new Command();

	program
		.name("rowork")
		.description("The meta-framework CLI for Roblox game development.")
		.version(options.roworkVersion, "-v, --version")
		.option("--cwd <dir>", "working directory")
		.option("--verbose", "verbose logging")
		.option("--quiet", "only print errors")
		.option("--no-plugins", "start without loading any plugin")
		.showHelpAfterError()
		.configureHelp({ sortSubcommands: true });

	for (const { definition } of options.registry.all()) {
		const command = program.command(definition.name).description(definition.description);

		for (const alias of definition.aliases ?? []) command.alias(alias);

		for (const argument of definition.arguments ?? []) {
			const required = argument.required ?? true;
			const inner = argument.variadic ? `${argument.name}...` : argument.name;
			const token = required ? `<${inner}>` : `[${inner}]`;
			command.argument(token, argument.description, argument.defaultValue);
		}

		for (const option of definition.options ?? []) {
			command.option(option.flags, option.description, option.defaultValue);
		}

		command.action(async (...invocation: unknown[]) => {
			// Commander passes: ...positional arguments, options, then the Command.
			const positional = invocation.slice(0, -2) as (string | string[] | undefined)[];
			const commandOptions = (invocation.at(-2) ?? {}) as Record<string, unknown>;

			const args: Record<string, string | string[] | undefined> = {};
			(definition.arguments ?? []).forEach((argument, index) => {
				args[argument.name] = positional[index];
			});

			const context: CommandContext = {
				args,
				options: commandOptions,
				cwd: options.cwd,
				projectRoot: options.projectRoot,
				config: options.config,
				logger,
				roworkVersion: options.roworkVersion,
			};

			await definition.run(context);
		});
	}

	program.addHelpText("after", `\n${pc.dim("Docs: https://github.com/nokogoat/Rowork")}\n`);

	return program;
}
