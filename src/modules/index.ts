import { leaderstatsModule } from "./leaderstats.js";
import { playerDataModule } from "./player-data.js";
import type { ModuleDefinition } from "./types.js";

/**
 * Modules shipped with Rowork, listed explicitly like the core commands.
 * Rule for adding one: it must be a chore almost every game redoes.
 */
export const coreModules: ModuleDefinition[] = [playerDataModule, leaderstatsModule];
