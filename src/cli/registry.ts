import type { CommandDefinition } from "../plugins/api.js";
import { logger } from "../ui/logger.js";

/** Origine d'une commande, utilisee pour arbitrer les conflits de noms. */
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
			return "le coeur de Rowork";
		case "plugin":
			return `le plugin ${origin.pluginName}`;
		case "local":
			return `le fichier local ${origin.file}`;
	}
}

/**
 * Registre des commandes, toutes sources confondues.
 *
 * Arbitrage des conflits : le coeur gagne toujours. Sans cette regle, un plugin
 * tiers pourrait detourner `rowork init` de facon invisible pour l'utilisateur.
 * Entre plugins, le premier enregistre gagne, et le conflit est signale.
 */
export class CommandRegistry {
	private readonly commands = new Map<string, RegisteredCommand>();
	private readonly aliases = new Map<string, string>();

	register(definition: CommandDefinition, origin: CommandOrigin): void {
		const existing = this.commands.get(definition.name);

		if (existing !== undefined) {
			if (existing.origin.kind === "core" || origin.kind !== "core") {
				logger.warn(
					`Commande \`${definition.name}\` ignoree : deja fournie par ${describeOrigin(existing.origin)} ` +
						`(tentative depuis ${describeOrigin(origin)}).`,
				);
				return;
			}
			logger.warn(
				`Commande \`${definition.name}\` fournie par ${describeOrigin(existing.origin)} remplacee par le coeur de Rowork.`,
			);
		}

		this.commands.set(definition.name, { definition, origin });

		for (const alias of definition.aliases ?? []) {
			const owner = this.aliases.get(alias);
			if (owner !== undefined && owner !== definition.name) {
				logger.warn(`Alias \`${alias}\` ignore : deja pris par \`${owner}\`.`);
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
