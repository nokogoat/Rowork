import type { CommandDefinition } from "../plugins/api.js";
import { coreModules } from "../modules/index.js";
import { addCommand, moduleCommand } from "./add.js";
import { consoleCommand } from "./console.js";
import { agentsSyncCommand, infoCommand } from "./info.js";
import { updateCommand } from "./update.js";
import { wireCommand } from "./wire.js";
import { devCommand } from "./dev.js";
import { ejectCommand } from "./eject.js";
import { devLogsCommand, devStopCommand } from "./dev-background.js";
import { initCommand } from "./init.js";
import { makeCommand } from "./make-menu.js";
import { makeEventCommand } from "./make-event.js";
import { makeStatCommand } from "./make-stat.js";
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
	devStopCommand,
	devLogsCommand,
	makeCommand,
	makeServiceCommand,
	makeControllerCommand,
	makeComponentCommand,
	makeStatCommand,
	makeEventCommand,
	studioCommand,
	studioSetupCommand,
	consoleCommand,
	addCommand,
	ejectCommand,
	infoCommand,
	updateCommand,
	wireCommand,
	agentsSyncCommand,
	...coreModules.map(moduleCommand),
];
