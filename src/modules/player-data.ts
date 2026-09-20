import { RoworkError } from "../cli/errors.js";
import { answered, prompts } from "../ui/prompt.js";
import type { ModuleDefinition, ModulePlan, PlanInput } from "./types.js";

type FieldType = "number" | "string" | "boolean";

interface Field {
	name: string;
	type: FieldType;
	/** The default, already written as source code. */
	defaultValue: string;
}

/** Suggestions offered by the guided version: almost every game wants these. */
const COMMON_FIELDS: Field[] = [
	{ name: "coins", type: "number", defaultValue: "0" },
	{ name: "level", type: "number", defaultValue: "1" },
	{ name: "xp", type: "number", defaultValue: "0" },
];

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

export function defaultFor(type: FieldType, raw: string | undefined): string {
	if (type === "number") {
		const value = raw === undefined || raw === "" ? 0 : Number(raw);
		if (!Number.isFinite(value)) throw new RoworkError(`\`${String(raw)}\` is not a number.`);
		return String(value);
	}
	if (type === "boolean") return raw === "true" ? "true" : "false";
	return JSON.stringify(raw ?? "");
}

/** Parses `name:type=default`, e.g. `coins:number=0` or `nickname:string=Guest`. */
export function parseField(spec: string): Field {
	const match = /^([^:=]+)(?::(number|string|boolean))?(?:=(.*))?$/.exec(spec.trim());
	const name = match?.[1] === undefined ? undefined : toFieldName(match[1]);
	if (match === null || name === undefined || !IDENTIFIER.test(name)) {
		throw new RoworkError(`\`${spec}\` is not a valid field.`, {
			hint: "Write name:type=default, e.g. coins:number=0. The name uses letters and digits and starts with a letter.",
		});
	}
	const type = (match[2] ?? "number") as FieldType;
	return { name, type, defaultValue: defaultFor(type, match[3]) };
}

const OTHER = "__other__";

/**
 * Turns whatever the person typed into a valid field name:
 * `Best Score` and `best-score` both become `bestScore`.
 */
export function toFieldName(raw: string): string {
	const words = raw.split(/[^A-Za-z0-9]+/).filter((word) => word.length > 0);
	return words
		.map((word, index) =>
			index === 0
				? word.charAt(0).toLowerCase() + word.slice(1)
				: word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join("");
}

async function askCustomField(taken: Field[], first: boolean): Promise<Field | undefined> {
	const raw = answered(
		await prompts.text({
			message: first
				? "Name of the value to save (anything you like, e.g. kills or best score)"
				: "Another one? Type its name, or leave empty when you are done",
			placeholder: first ? "kills" : "",
			validate: (value) => {
				if (first && (value === undefined || value.trim() === "")) return "Type a name.";
				if (value === undefined || value.trim() === "") return undefined;
				const name = toFieldName(value);
				if (!IDENTIFIER.test(name)) return "Use letters and digits, starting with a letter.";
				if (taken.some((field) => field.name === name)) return `\`${name}\` is already there.`;
				return undefined;
			},
		}),
	);
	if (raw.trim() === "") return undefined;

	const name = toFieldName(raw);
	const type = answered(
		await prompts.select({
			message: `What kind of value is ${name}?`,
			options: [
				{ value: "number", label: "Number", hint: "coins, kills, level" },
				{ value: "string", label: "Text", hint: "a nickname, a title" },
				{ value: "boolean", label: "Yes / no", hint: "has finished the tutorial" },
			],
		}),
	) as FieldType;

	const initial = answered(
		await prompts.text({
			message: `Starting value of ${name}?`,
			placeholder: type === "number" ? "0" : type === "boolean" ? "false" : "",
			defaultValue: "",
		}),
	);
	return { name, type, defaultValue: defaultFor(type, initial) };
}

async function askFields(): Promise<Field[]> {
	const chosen = answered(
		await prompts.multiselect({
			message: "What do you want to save for each player? (space to tick, enter to confirm)",
			options: [
				...COMMON_FIELDS.map((field) => ({ value: field.name, label: field.name })),
				{ value: OTHER, label: "Other...", hint: "type your own, with the name you want" },
			],
			initialValues: ["coins", "level"],
			required: true,
		}),
	);

	const fields = COMMON_FIELDS.filter((field) => chosen.includes(field.name));

	if (chosen.includes(OTHER)) {
		let first = true;
		for (;;) {
			const field = await askCustomField(fields, first);
			if (field === undefined) break;
			fields.push(field);
			first = false;
		}
	}
	return fields;
}

function fieldsFromOptions(options: Readonly<Record<string, unknown>>): Field[] {
	const specs = options["field"];
	if (!Array.isArray(specs) || specs.length === 0) {
		return COMMON_FIELDS.filter((field) => field.name !== "xp");
	}
	return specs.map((spec) => parseField(String(spec)));
}

export const playerDataModule: ModuleDefinition = {
	name: "player-data",
	title: "Player data",
	description: "Save and load each player's progress (coins, level...) so it survives leaving the game.",
	dependencies: ["@rbxts/lapis", "@rbxts/t"],
	agentGuide: [
		"Saved data lives in `PlayerDataService` (server). From another service: inject it and call `get(player)`, `update(player, (data) => { data.coins += 1; return data; })`, `onLoaded(cb)`, `onChanged(cb)`.",
		"To save a new value, add it in TWO places in `src/shared/data/PlayerData.ts`: the `PlayerData` interface and `DEFAULT_PLAYER_DATA`. Do not read data from the client.",
		"Data is undefined until it has loaded: always handle that case.",
	],
	options: [
		{
			flags: "--field <spec...>",
			description: "a value to save, as name:type=default, e.g. coins:number=0 (repeatable)",
		},
	],
	async plan({ guided, options, config }: PlanInput): Promise<ModulePlan> {
		const fields = guided ? await askFields() : fieldsFromOptions(options);
		if (fields.length === 0) {
			throw new RoworkError("Nothing to save: add at least one field.", {
				hint: "Example: --field coins:number=0",
			});
		}
		const seen = new Set<string>();
		for (const field of fields) {
			if (seen.has(field.name)) throw new RoworkError(`Field \`${field.name}\` is listed twice.`);
			seen.add(field.name);
		}

		const dataDirectory = `${config.paths.shared}/data`;
		const dataImport = `${dataDirectory}/PlayerData`;

		return {
			files: [
				{
					template: "player-data/PlayerData",
					directory: dataDirectory,
					fileName: "PlayerData.ts",
					variables: {
						interfaceFields: fields.map((field) => `\t${field.name}: ${field.type};`).join("\n"),
						defaultFields: fields.map((field) => `\t${field.name}: ${field.defaultValue},`).join("\n"),
					},
				},
				{
					template: "player-data/PlayerDataService",
					directory: config.paths.services,
					fileName: "PlayerDataService.ts",
					// Resolved by the installer, which knows the project root.
					variables: { dataImport: `@import:${dataImport}` },
				},
			],
			register: [{ side: "server", directory: config.paths.services }],
			notes: [
				`Saving: ${fields.map((field) => field.name).join(", ")}.`,
				`To save something new, add it to ${dataImport}.ts (two places, both in that file).`,
				"Read and change a player's data from any service:",
				"  const data = this.playerData.get(player);",
				"  this.playerData.update(player, (data) => { data.coins += 10; return data; });",
				"Testing in Studio: data is only really saved once the place is published and",
				"'Enable Studio Access to API Services' is on. Otherwise it is kept in memory.",
			],
		};
	},
};
