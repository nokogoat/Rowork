import type { CommandDefinition } from "../plugins/api.js";
import { logger } from "../ui/logger.js";

/** Where a command came from, used to arbitrate name conflicts. */
export type CommandOrigin =
	| { kind: "core" }
	| { kind: "plugin"; pluginName: string }
	| { kind: "local"; file: string };

export interface RegisteredCommand {
	definition: CommandDefinition;
	origin: CommandOrigin;
}

function describeOrigin(origin: CommandOrigin): string {
	switch (origin.kind) {
		case "core":
			return "Rowork core";
		case "plugin":
			return `plugin ${origin.pluginName}`;
		case "local":
			return `local file ${origin.file}`;
	}
}

/**
 * Registry of every command, whatever its source.
 *
 * Conflict arbitration: core always wins. Without this rule a third-party
 * plugin could silently hijack `rowork init`. Between plugins, first
 * registration wins and the conflict is reported.
 */
export class CommandRegistry {
	private readonly commands = new Map<string, RegisteredCommand>();
	private readonly aliases = new Map<string, string>();

	register(definition: CommandDefinition, origin: CommandOrigin): void {
		const existing = this.commands.get(definition.name);

		if (existing !== undefined) {
			if (existing.origin.kind === "core" || origin.kind !== "core") {
				logger.warn(
					`Skipping command \`${definition.name}\`: already provided by ${describeOrigin(existing.origin)} ` +
						`(attempted by ${describeOrigin(origin)}).`,
				);
				return;
			}
			logger.warn(
				`Command \`${definition.name}\` from ${describeOrigin(existing.origin)} replaced by Rowork core.`,
			);
		}

		this.commands.set(definition.name, { definition, origin });

		for (const alias of definition.aliases ?? []) {
			const owner = this.aliases.get(alias);
			if (owner !== undefined && owner !== definition.name) {
				logger.warn(`Skipping alias \`${alias}\`: already taken by \`${owner}\`.`);
				continue;
			}
			this.aliases.set(alias, definition.name);
		}
	}

	all(): RegisteredCommand[] {
		return [...this.commands.values()].sort((a, b) =>
			a.definition.name.localeCompare(b.definition.name),
		);
	}

	has(name: string): boolean {
		return this.commands.has(name);
	}
}
