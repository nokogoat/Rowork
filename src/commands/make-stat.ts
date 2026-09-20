import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { generateFile } from "../core/generate.js";
import { addFieldToPlayerData, addToShownList, type StatType } from "../core/schema-edit.js";
import { defineCommand } from "../plugins/api.js";
import { defaultFor, toFieldName } from "../modules/player-data.js";
import { answered, prompts, requireInteractive } from "../ui/prompt.js";
import { requireProject } from "./make.js";

const ADD_METHOD = `
	/** Adds to the player's \`{{ name }}\` (1 by default). Use a negative amount to subtract. */
	add(player: Player, amount = 1): void {
		this.playerData.update(player, (data) => {
			data.{{ name }} += amount;
			return data;
		});
	}
`;

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

export const makeStatCommand = defineCommand({
	name: "make:stat",
	description: "Add a saved value (kills, coins...) to the player data, in every place it must be, and a service to use it.",
	guided: true,
	arguments: [{ name: "name", description: "the value, e.g. kills (omit it for the guided version)", required: false }],
	options: [
		{ flags: "--type <type>", description: "number (default), string or boolean" },
		{ flags: "--default <value>", description: "starting value for a new player (default 0, empty, or false)" },
		{ flags: "--leaderboard", description: "show it in the leaderboard (default for numbers)" },
		{ flags: "--no-leaderboard", description: "do not show it in the leaderboard" },
		{ flags: "--service", description: "create the helper service (default for numbers)" },
		{ flags: "--no-service", description: "do not create the helper service" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "make:stat");
		const installed = config.modules ?? [];

		if (!installed.includes("player-data")) {
			throw new RoworkError("There is no player data to add a value to.", {
				hint: "Run `rowork add:player-data` first: it is what saves the values.",
			});
		}

		const hasLeaderboard = installed.includes("leaderstats");
		const given = context.args["name"];
		let rawName: string;
		let type: StatType = "number";
		let rawDefault: string | undefined;
		// A counter (kills, coins) is what a leaderboard and add/get/set are for: those
		// are the defaults for numbers. Text and yes/no values get them only on request.
		const wants = (option: string, fallback: boolean): boolean =>
			context.options[option] === undefined ? fallback : context.options[option] === true;
		let leaderboard = false;
		let service = false;

		if (typeof given === "string") {
			rawName = given;
			const asked = context.options["type"];
			if (asked !== undefined) {
				if (asked !== "number" && asked !== "string" && asked !== "boolean") {
					throw new RoworkError(`Unknown type \`${String(asked)}\`.`, { hint: "Use number, string or boolean." });
				}
				type = asked;
			}
			rawDefault = typeof context.options["default"] === "string" ? context.options["default"] : undefined;
			leaderboard = hasLeaderboard && wants("leaderboard", type === "number");
			service = wants("service", type === "number");
		} else {
			requireInteractive("make:stat", "rowork make:stat <name> --type number --default 0");
			rawName = answered(
				await prompts.text({
					message: "What do you want to save for each player? (anything you like, e.g. kills or best score)",
					placeholder: "kills",
					validate: (value) => (IDENTIFIER.test(toFieldName(value ?? "")) ? undefined : "Use letters and digits, starting with a letter."),
				}),
			);
			type = answered(
				await prompts.select({
					message: "What kind of value is it?",
					options: [
						{ value: "number", label: "Number", hint: "kills, coins, level" },
						{ value: "string", label: "Text", hint: "a nickname, a title" },
						{ value: "boolean", label: "Yes / no", hint: "has finished the tutorial" },
					],
				}),
			) as StatType;
			rawDefault = answered(
				await prompts.text({
					message: "Starting value for a new player?",
					placeholder: type === "number" ? "0" : type === "boolean" ? "false" : "",
					defaultValue: "",
				}),
			);
			if (hasLeaderboard) {
				leaderboard = answered(await prompts.confirm({ message: "Show it in the leaderboard?", initialValue: type === "number" }));
			}
			service = answered(
				await prompts.confirm({ message: "Create a small service to read and change it (get, set, add)?", initialValue: type === "number" }),
			);
		}

		const name = toFieldName(rawName);
		if (!IDENTIFIER.test(name)) {
			throw new RoworkError(`\`${rawName}\` cannot be used as a name.`, {
				hint: "Use letters and digits, starting with a letter: kills, bestScore.",
			});
		}
		const defaultValue = defaultFor(type, rawDefault);
		const className = `${name.charAt(0).toUpperCase()}${name.slice(1)}Service`;

		// ---- every edit is computed in memory first: nothing is written unless all of them work
		const dataFile = `${config.paths.shared}/data/PlayerData.ts`;
		const dataPath = resolveProjectPath(root, dataFile);
		let dataSource: string;
		try {
			dataSource = readFileSync(dataPath, "utf8");
		} catch {
			throw new RoworkError(`Cannot read ${dataFile}.`, { hint: "It is created by `rowork add:player-data`." });
		}
		const newData = addFieldToPlayerData(dataSource, dataFile, { name, type, defaultValue });

		let newShown: { path: string; source: string } | undefined;
		if (leaderboard) {
			const shownFile = `${config.paths.services}/LeaderstatsService.ts`;
			const shownPath = resolveProjectPath(root, shownFile);
			newShown = { path: shownPath, source: addToShownList(readFileSync(shownPath, "utf8"), shownFile, name) };
		}

		const servicePath = join(config.paths.services, `${className}.ts`);
		if (service && existsAt(root, servicePath)) {
			throw new RoworkError(`${servicePath} already exists.`, { hint: "Pick another name, or use --no-service." });
		}

		// ---- write
		writeFileSync(dataPath, newData, "utf8");
		context.logger.step(`${dataFile}: added \`${name}: ${type}\` and its starting value`);
		if (newShown !== undefined) {
			writeFileSync(newShown.path, newShown.source, "utf8");
			context.logger.step(`${config.paths.services}/LeaderstatsService.ts: added to the leaderboard`);
		}
		if (service) {
			const written = generateFile({
				projectRoot: root,
				directory: config.paths.services,
				fileName: `${className}.ts`,
				template: "stat-service",
				variables: { name, type, className, extra: type === "number" ? ADD_METHOD.replaceAll("{{ name }}", name) : "" },
				force: false,
			});
			if (written !== undefined) context.logger.step(written);
		}

		context.logger.success(`Saved \`${name}\` for every player.`);
		context.logger.blank();
		context.logger.info("Players who already have a save get the starting value the next time they join.");
		if (service) {
			context.logger.info(`Use it from any service:  constructor(private readonly ${name}: ${className}) {}   then   this.${name}.${type === "number" ? "add(player)" : "set(player, value)"}`);
		}
	},
});

function existsAt(root: string, relativePath: string): boolean {
	try {
		readFileSync(resolveProjectPath(root, relativePath));
		return true;
	} catch {
		return false;
	}
}
