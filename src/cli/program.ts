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
 * Construit l'instance Commander a partir du registre.
 *
 * Les commandes du coeur et celles des plugins passent par exactement le meme
 * chemin : le coeur consomme son propre contrat public, ce qui garantit qu'une
 * regression de l'API plugin casse aussi la CLI, donc se voit immediatement.
 */
export function createProgram(options: ProgramOptions): Command {
	const program = new Command();

	program
		.name("rowork")
		.description("Le meta-framework CLI pour le developpement de jeux Roblox.")
		.version(options.roworkVersion, "-v, --version")
		.option("--cwd <dir>", "repertoire de travail")
		.option("--verbose", "logs detailles")
		.option("--quiet", "n'afficher que les erreurs")
		.option("--no-plugins", "demarrer sans charger les plugins")
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
			// Commander passe : ...arguments positionnels, options, puis la Command.
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

	program.addHelpText(
		"after",
		`\n${pc.dim("Docs : https://github.com/nokogoat/Rowork")}\n`,
	);

	return program;
}
