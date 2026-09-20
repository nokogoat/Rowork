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

function defaultFor(type: FieldType, raw: string | undefined): string {
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
	const name = match?.[1]?.trim();
	if (match === null || name === undefined || !IDENTIFIER.test(name)) {
		throw new RoworkError(`\`${spec}\` is not a valid field.`, {
			hint: "Write name:type=default, e.g. coins:number=0. The name starts with a lowercase letter.",
		});
	}
	const type = (match[2] ?? "number") as FieldType;
	return { name, type, defaultValue: defaultFor(type, match[3]) };
}

async function askFields(): Promise<Field[]> {
	const chosen = answered(
		await prompts.multiselect({
			message: "What do you want to save for each player?",
			options: COMMON_FIELDS.map((field) => ({ value: field.name, label: field.name })),
			initialValues: ["coins", "level"],
			required: false,
		}),
	);
	const fields = COMMON_FIELDS.filter((field) => chosen.includes(field.name));

	for (;;) {
		const name = answered(
			await prompts.text({
				message: "Add your own field? (a name like `kills`, or leave empty to finish)",
				placeholder: "kills",
				validate: (value) =>
					value === undefined || value === "" || IDENTIFIER.test(value)
						? fields.some((field) => field.name === value)
							? "Already added."
							: undefined
						: "Start with a lowercase letter, then letters and digits only.",
			}),
		);
		if (name === "") return fields;

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
		fields.push({ name, type, defaultValue: defaultFor(type, initial) });
	}
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
