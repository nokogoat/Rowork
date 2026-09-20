import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { answered, prompts } from "../ui/prompt.js";
import type { ModuleDefinition, ModulePlan, PlanInput } from "./types.js";

interface DataField {
	name: string;
	type: string;
}

/**
 * Reads the fields of the `PlayerData` interface the player-data module wrote.
 * Deliberately a plain read of a file the user owns: if they reshaped it, the
 * module says what it could not find instead of guessing.
 */
function readDataFields(projectRoot: string, dataFile: string): DataField[] {
	let source: string;
	try {
		source = readFileSync(resolveProjectPath(projectRoot, dataFile), "utf8");
	} catch {
		throw new RoworkError(`Cannot read ${dataFile}.`, {
			hint: "The leaderstats module shows values from PlayerData. Add it with `rowork add:player-data` first.",
		});
	}

	const body = /export interface PlayerData\s*{([^}]*)}/.exec(source)?.[1] ?? "";
	const fields = [...body.matchAll(/^\s*(\w+)\s*:\s*(number|string|boolean)\s*;/gm)].map((match) => ({
		name: match[1] as string,
		type: match[2] as string,
	}));

	if (fields.length === 0) {
		throw new RoworkError(`No number, text or yes/no field found in ${dataFile}.`, {
			hint: "Expected fields like `coins: number;` inside `export interface PlayerData { ... }`.",
		});
	}
	return fields;
}

export const leaderstatsModule: ModuleDefinition = {
	name: "leaderstats",
	title: "Leaderstats",
	description: "Show chosen player data (coins, level...) in the in-game leaderboard, kept up to date.",
	requires: ["player-data"],
	agentGuide: [
		"`LeaderstatsService` mirrors PlayerData into Roblox's leaderboard. To show another value, add its name to the `SHOWN` list at the top of the file.",
		"The leaderboard is only a display: read values from `PlayerDataService`, never from the `leaderstats` folder.",
	],
	options: [
		{
			flags: "--stat <field...>",
			description: "a PlayerData field to show in the leaderboard (repeatable)",
		},
	],
	async plan({ guided, options, config, projectRoot }: PlanInput): Promise<ModulePlan> {
		const dataFile = `${config.paths.shared}/data/PlayerData.ts`;
		const fields = readDataFields(projectRoot, dataFile);
		const names = fields.map((field) => field.name);

		let shown: string[];
		if (guided) {
			shown = answered(
				await prompts.multiselect({
					message: "Which values show in the leaderboard?",
					options: fields.map((field) => ({
						value: field.name,
						label: field.name,
						hint: field.type,
					})),
					initialValues: fields.filter((field) => field.type === "number").map((field) => field.name),
					required: true,
				}),
			);
		} else {
			const given = options["stat"];
			shown = Array.isArray(given)
				? given.map(String)
				: fields.filter((field) => field.type === "number").map((field) => field.name);
			const unknown = shown.filter((name) => !names.includes(name));
			if (unknown.length > 0) {
				throw new RoworkError(`Unknown PlayerData field: ${unknown.join(", ")}.`, {
					hint: `Available: ${names.join(", ")}.`,
				});
			}
			if (shown.length === 0) {
				throw new RoworkError("Nothing to show.", {
					hint: "Give at least one field, e.g. --stat coins.",
				});
			}
		}

		const services = config.paths.services;
		return {
			files: [
				{
					template: "leaderstats/LeaderstatsService",
					directory: services,
					fileName: "LeaderstatsService.ts",
					variables: {
						dataImport: `@import:${config.paths.shared}/data/PlayerData`,
						shown: shown.map((name) => JSON.stringify(name)).join(", "),
					},
				},
			],
			register: [{ side: "server", directory: services }],
			notes: [
				`Showing in the leaderboard: ${shown.join(", ")}.`,
				`To show another value, add its name to SHOWN in ${join(services, "LeaderstatsService.ts")}.`,
				"Values follow PlayerDataService.update: nothing else to write.",
			],
		};
	},
};
