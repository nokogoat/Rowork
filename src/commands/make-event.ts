import { readFileSync, writeFileSync } from "node:fs";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { addEventToNetworking } from "../core/schema-edit.js";
import { checkParameters, parameterProblem } from "../modules/networking.js";
import { toFieldName } from "../modules/player-data.js";
import { installModule } from "../core/modules.js";
import { networkingModule } from "../modules/networking.js";
import { defineCommand } from "../plugins/api.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
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
		}

		const name = toFieldName(rawName);
		if (!IDENTIFIER.test(name)) {
			throw new RoworkError(`\`${rawName}\` cannot be used as a name.`, { hint: "Use letters and digits, starting with a letter." });
		}

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

		writeFileSync(path, addEventToNetworking(source, file, side, { name, parameters }), "utf8");
		context.logger.step(`${file}: added ${name}(${parameters})`);
		context.logger.success(`Message \`${name}\` added (${side === "server" ? "client to server" : "server to client"}).`);
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
