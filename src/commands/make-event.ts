import { readFileSync, writeFileSync } from "node:fs";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { addEventToNetworking, addRateLimit } from "../core/schema-edit.js";
import { checkParameters, parameterProblem } from "../modules/networking.js";
import { toFieldName } from "../modules/player-data.js";
import { installModule } from "../core/modules.js";
import { networkingModule } from "../modules/networking.js";
import { defineCommand } from "../plugins/api.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listStats, pascal } from "../core/project-index.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
import { askStatLink, createEventHandler, resolveStats } from "./links.js";
import { requireProject } from "./make.js";

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

export const makeEventCommand = defineCommand({
	name: "make:event",
	description: "Add an event (a typed message between client and server) to the networking file where it belongs.",
	guided: true,
	arguments: [{ name: "name", description: "the message, e.g. buyItem (omit it for the guided version)", required: false }],
	options: [
		{ flags: "--to <side>", description: "who receives it: server (default) or client" },
		{ flags: "--args <list>", description: 'what it carries, e.g. "itemId: string, amount: number"' },
		{ flags: "--link <value>", description: "a saved value the server changes when it receives this (a client event only)" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "make:event");

		const missingModule = !(config.modules ?? []).includes("networking");
		const given = context.args["name"];
		if (missingModule && typeof given === "string") {
			// Scripted: no question to ask. Say the one command that does both.
			throw new RoworkError("There is no networking file to add an event to.", {
				hint: `Run \`rowork add:networking --event "${given}:server()"\`: it installs typed networking and starts with that event.`,
			});
		}

		let rawName: string;
		let side: "server" | "client" = "server";
		let parameters = "";
		let linkTyped: string | undefined;

		if (typeof given === "string") {
			rawName = given;
			const to = context.options["to"];
			if (to !== undefined) {
				if (to !== "server" && to !== "client") {
					throw new RoworkError(`Unknown side \`${String(to)}\`.`, { hint: "--to server (the client sends it) or --to client (the server sends it)." });
				}
				side = to;
			}
			parameters = checkParameters(typeof context.options["args"] === "string" ? context.options["args"] : "");
			if (typeof context.options["link"] === "string") linkTyped = context.options["link"];
		} else {
			requireInteractive("make:event", 'rowork make:event <name> --to server --args "itemId: string"');
			rawName = answered(
				await prompts.text({
					message: "Name of the message (anything you like, e.g. buy item)",
					placeholder: "buy item",
					validate: (value) => (IDENTIFIER.test(toFieldName(value ?? "")) ? undefined : "Use letters and digits, starting with a letter."),
				}),
			);
			side = answered(
				await prompts.select({
					message: `Who sends ${toFieldName(rawName)}?`,
					options: [
						{ value: "server", label: "The player's client, to the server", hint: "a button click, a purchase" },
						{ value: "client", label: "The server, to the player(s)", hint: "a notification, a result" },
					],
				}),
			) as "server" | "client";
			parameters = answered(
				await prompts.text({
					message: "What does it carry? (like `itemId: string, amount: number`, empty for nothing)",
					placeholder: "itemId: string, amount: number",
					defaultValue: "",
					validate: (value) => parameterProblem(value ?? ""),
				}),
			).trim();
			// "Link it to...?" only makes sense for what the client sends: that is what the server reacts to.
			if (side === "server") {
				linkTyped = await askStatLink(root, config, "Should the server change a saved value when it receives this? Type its name.", true);
			}
		}

		const name = toFieldName(rawName);
		if (!IDENTIFIER.test(name)) {
			throw new RoworkError(`\`${rawName}\` cannot be used as a name.`, { hint: "Use letters and digits, starting with a letter." });
		}

		// A link is checked before anything is written.
		let linkStat: ReturnType<typeof resolveStats>[number] | undefined;
		if (linkTyped !== undefined) {
			if (side !== "server") {
				throw new RoworkError("A link only applies to an event the client sends.", {
					hint: "The server reacts to events from the client. Use --to server, or drop --link.",
				});
			}
			linkStat = resolveStats(listStats(root, config), linkTyped, "then link it")[0];
			const handlerFile = join(config.paths.services, `${pascal(name)}Handler.ts`);
			if (existsSync(join(root, handlerFile))) {
				throw new RoworkError(`${handlerFile} already exists.`, { hint: "Pick another name for the event." });
			}
		}
		const linkNow = (): void => {
			if (linkStat === undefined) return;
			const handler = createEventHandler({ root, config, event: { name }, stat: linkStat });
			context.logger.step(`${handler.path}: runs on the server when \`${name}\` arrives, linked to \`${linkStat.name}\``);
			context.logger.info("It decides the amount on the server: do not use a number the client sent.");
		};

		// Guided and typed networking is not installed: offer to install it, starting with this event.
		if (missingModule) {
			const proceed = answered(
				await prompts.confirm({
					message: `Events need the Typed networking module, which is not installed. Add it now, starting with \`${name}\`?`,
					initialValue: true,
				}),
			);
			if (!proceed) {
				prompts.cancel("Nothing changed.");
				return;
			}
			await installModule(
				{ ...context, options: { event: [`${name}:${side}(${parameters})`] } },
				networkingModule,
				root,
				false,
			);
			linkNow();
			return;
		}

		const file = `${config.paths.shared}/networking.ts`;
		const path = resolveProjectPath(root, file);
		let source: string;
		try {
			source = readFileSync(path, "utf8");
		} catch {
			throw new RoworkError(`Cannot read ${file}.`, { hint: "It is created by `rowork add:networking`." });
		}

		const newNetworking = addEventToNetworking(source, file, side, { name, parameters });

		// An event the client sends is rate limited like the others: its line is added to the
		// server's list. Computed before anything is written, like every edit here.
		const serverFile = `${config.paths.source}/server/network.ts`;
		let newServer: string | undefined;
		let unprotected = false;
		if (side === "server") {
			try {
				newServer = addRateLimit(readFileSync(resolveProjectPath(root, serverFile), "utf8"), name);
			} catch {
				newServer = undefined;
			}
			unprotected = newServer === undefined;
		}

		writeFileSync(path, newNetworking, "utf8");
		context.logger.step(`${file}: added ${name}(${parameters})`);
		if (newServer !== undefined) {
			writeFileSync(resolveProjectPath(root, serverFile), newServer, "utf8");
			context.logger.step(`${serverFile}: ${name} is rate limited per player`);
		}
		if (unprotected) {
			context.logger.warn(`${serverFile} has no \`middleware\` list: \`${name}\` is NOT rate limited. Add \`${name}: [limit()]\` yourself, or a cheater can flood it.`);
		}
		linkNow();
		context.logger.success(`Event \`${name}\` added (${side === "server" ? "client to server" : "server to client"}).`);
		context.logger.blank();
		const args = parameters === "" ? "" : "...";
		if (side === "server") {
			context.logger.info(`Server listens:  Events.${name}.connect((player${args === "" ? "" : ", ..."}) => { ... });`);
			context.logger.info(`Client sends:    Events.${name}.fire(${args});`);
		} else {
			context.logger.info(`Client listens:  Events.${name}.connect((${args}) => { ... });`);
			context.logger.info(`Server sends:    Events.${name}.fire(player${args === "" ? "" : ", ..."});`);
		}
	},
});
