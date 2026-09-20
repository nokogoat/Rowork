import { RoworkError } from "../cli/errors.js";
import { answered, prompts } from "../ui/prompt.js";
import { toFieldName } from "./player-data.js";
import type { ModuleDefinition, ModulePlan, PlanInput } from "./types.js";

type Direction = "server" | "client";

interface NetworkEvent {
	name: string;
	/** `server`: the client sends it to the server. `client`: the server sends it to clients. */
	direction: Direction;
	/** TypeScript parameter list, e.g. `itemId: string, amount: number`. */
	parameters: string;
}

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

/** Enough for real types, too little to break out of the interface. */
const SAFE_PARAMETERS = /^[A-Za-z0-9_:,<>[\]\s|?.'"]*$/;
const PARAMETER = /^[A-Za-z_][A-Za-z0-9_]*\??\s*:\s*\S.*$/;

/** Splits on commas that are not inside `<>` or `[]`, so `Map<string, number>` stays whole. */
function splitParameters(text: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (const character of text) {
		if (character === "<" || character === "[") depth += 1;
		if (character === ">" || character === "]") depth -= 1;
		if (character === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
		} else {
			current += character;
		}
	}
	if (current.trim() !== "") parts.push(current.trim());
	return parts;
}

/** Why a parameter list is not valid, or undefined when it is. */
export function parameterProblem(text: string): string | undefined {
	const trimmed = text.trim();
	if (trimmed === "") return undefined;
	if (!SAFE_PARAMETERS.test(trimmed)) return "Only plain TypeScript types: letters, digits and : , < > [ ] | ?";
	for (const part of splitParameters(trimmed)) {
		if (!PARAMETER.test(part)) {
			return `\`${part}\` is not \`name: type\`. The name is one word, like itemId: string`;
		}
	}
	return undefined;
}

export function checkParameters(parameters: string): string {
	const problem = parameterProblem(parameters);
	if (problem !== undefined) {
		throw new RoworkError(`Invalid arguments \`${parameters.trim()}\`.`, { hint: problem });
	}
	return parameters.trim();
}

/** Parses `buyItem:server(itemId: string, amount: number)`. */
export function parseEvent(spec: string): NetworkEvent {
	const match = /^\s*([^:()]+):(server|client)\s*(?:\((.*)\))?\s*$/.exec(spec);
	const name = match?.[1] === undefined ? undefined : toFieldName(match[1]);
	if (match === null || name === undefined || !IDENTIFIER.test(name)) {
		throw new RoworkError(`\`${spec}\` is not a valid event.`, {
			hint: "Write name:direction(arguments), e.g. buyItem:server(itemId: string). `server` = the client sends it to the server, `client` = the server sends it to clients.",
		});
	}
	return {
		name,
		direction: match[2] as Direction,
		parameters: checkParameters(match[3] ?? ""),
	};
}

async function askEvents(): Promise<NetworkEvent[]> {
	const events: NetworkEvent[] = [];

	for (;;) {
		const first = events.length === 0;
		const raw = answered(
			await prompts.text({
				message: first
					? "Name of a message between client and server (anything you like, e.g. buy item)"
					: "Another one? Type its name, or leave empty when you are done",
				placeholder: first ? "buy item" : "",
				validate: (value) => {
					if (value === undefined || value.trim() === "") return first ? "Type a name." : undefined;
					const name = toFieldName(value);
					if (!IDENTIFIER.test(name)) return "Use letters and digits, starting with a letter.";
					if (events.some((event) => event.name === name)) return `\`${name}\` is already there.`;
					return undefined;
				},
			}),
		);
		if (raw.trim() === "") return events;
		const name = toFieldName(raw);

		const direction = answered(
			await prompts.select({
				message: `Who sends ${name}?`,
				options: [
					{ value: "server", label: "The player's client, to the server", hint: "a button click, a purchase" },
					{ value: "client", label: "The server, to the player(s)", hint: "a notification, a result" },
				],
			}),
		) as Direction;

		const parameters = answered(
			await prompts.text({
				message: `What does ${name} carry? (like \`itemId: string, amount: number\`, empty for nothing)`,
				placeholder: "itemId: string, amount: number",
				defaultValue: "",
				validate: (value) => parameterProblem(value ?? ""),
			}),
		);

		events.push({ name, direction, parameters: parameters.trim() });
	}
}

function lines(events: NetworkEvent[], direction: Direction): string {
	const matching = events.filter((event) => event.direction === direction);
	return matching.length === 0
		? "\t// (none yet)"
		: matching.map((event) => `\t${event.name}(${event.parameters}): void;`).join("\n");
}

export const networkingModule: ModuleDefinition = {
	name: "networking",
	title: "Typed networking",
	description: "Messages between client and server with types, no RemoteEvent to create or wire by hand.",
	dependencies: ["@flamework/networking"],
	agentGuide: [
		"Every client/server message is declared once in `src/shared/networking.ts`, in `ClientToServerEvents` or `ServerToClientEvents`. To add one, add a line such as `buyItem(itemId: string, amount: number): void;`. Do not create RemoteEvents by hand.",
		"Server: `import { Events } from \"../network\"`, then `Events.name.connect((player, ...args) => {})`, `Events.name.fire(player, ...args)`, `Events.name.broadcast(...args)`. Client: `Events.name.fire(...args)` and `Events.name.connect((...args) => {})`.",
		"On the server the sender is always the first argument and comes from Roblox: never take a player from the arguments.",
	],
	options: [
		{
			flags: "--event <spec...>",
			description: 'a message, as name:direction(arguments), e.g. "buyItem:server(itemId: string)" (repeatable)',
		},
	],
	async plan({ guided, options, config }: PlanInput): Promise<ModulePlan> {
		let events: NetworkEvent[];
		if (guided) {
			events = await askEvents();
		} else {
			const given = options["event"];
			events = Array.isArray(given) ? given.map((spec) => parseEvent(String(spec))) : [];
		}

		const seen = new Set<string>();
		for (const event of events) {
			if (seen.has(event.name)) throw new RoworkError(`Event \`${event.name}\` is listed twice.`);
			seen.add(event.name);
		}

		const shared = config.paths.shared;
		const networkingFile = `${shared}/networking`;
		const example = events[0];

		return {
			files: [
				{
					template: "networking/networking",
					directory: shared,
					fileName: "networking.ts",
					variables: { toServer: lines(events, "server"), toClient: lines(events, "client") },
				},
				{
					template: "networking/server-network",
					directory: `${config.paths.source}/server`,
					fileName: "network.ts",
					variables: { networkingImport: `@import:${networkingFile}` },
				},
				{
					template: "networking/client-network",
					directory: `${config.paths.source}/client`,
					fileName: "network.ts",
					variables: { networkingImport: `@import:${networkingFile}` },
				},
			],
			register: [],
			notes: [
				events.length === 0
					? `No event yet: add one in ${networkingFile}.ts (see the comment at the top).`
					: `Events: ${events.map((event) => `${event.name} (${event.direction === "server" ? "client to server" : "server to client"})`).join(", ")}.`,
				`Server: import { Events } from "./network";   Client: import { Events } from "./network";`,
				example === undefined
					? "Add events in the two interfaces of src/shared/networking.ts."
					: example.direction === "server"
						? `Server listens:  Events.${example.name}.connect((player${example.parameters === "" ? "" : ", ..."}) => { ... });   Client sends:  Events.${example.name}.fire(${example.parameters === "" ? "" : "..."});`
						: `Client listens:  Events.${example.name}.connect((${example.parameters === "" ? "" : "..."}) => { ... });   Server sends:  Events.${example.name}.fire(player${example.parameters === "" ? "" : ", ..."});`,
			],
		};
	},
};
