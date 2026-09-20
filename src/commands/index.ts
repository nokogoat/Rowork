import type { CommandDefinition } from "../plugins/api.js";
import { devCommand } from "./dev.js";
import { initCommand } from "./init.js";
import { startCommand } from "./start.js";

/**
 * Core commands, listed explicitly rather than discovered by glob: the compiler
 * checks them, startup stays fast, and no phantom command can slip into the
 * published package.
 */
export const coreCommands: CommandDefinition[] = [startCommand, initCommand, devCommand];
