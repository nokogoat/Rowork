import type { CommandDefinition } from "../plugins/api.js";
import { initCommand } from "./init.js";

/**
 * Commandes du coeur, listees explicitement plutot que decouvertes par glob :
 * verification par le compilateur, demarrage plus rapide, et aucun risque de
 * commande fantome au packaging.
 */
export const coreCommands: CommandDefinition[] = [initCommand];
