import type { CommandDefinition } from "../plugins/api.js";
import { consoleCommand } from "./console.js";
import { devCommand } from "./dev.js";
import { initCommand } from "./init.js";
import { makeCommand } from "./make-menu.js";
import { makeToolCommand } from "./make-tool.js";
import { makeComponentCommand, makeControllerCommand, makeServiceCommand } from "./make.js";
import { startCommand } from "./start.js";
import { studioCommand, studioSetupCommand } from "./studio.js";

/**
 * Core commands, listed explicitly rather than discovered by glob: the compiler
 * checks them, startup stays fast, and no phantom command can slip into the
 * published package.
 */
export const coreCommands: CommandDefinition[] = [
	startCommand,
	initCommand,
	devCommand,
	makeCommand,
	makeServiceCommand,
	makeControllerCommand,
	makeComponentCommand,
	makeToolCommand,
	studioCommand,
	studioSetupCommand,
	consoleCommand,
];
