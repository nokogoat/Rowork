import { RoworkError } from "../cli/errors.js";

/**
 * Small, careful edits to files the user owns.
 *
 * `make:stat` and `make:event` extend a file a module generated earlier
 * (PlayerData.ts, networking.ts), which the user may since have edited. Each
 * function here works on the source text, refuses instead of guessing when the
 * file no longer has the expected shape, and returns the new text without
 * touching the disk: the caller writes every file only once all of them
 * accepted their edit, so a refusal leaves the project exactly as it was.
 */

interface Block {
	/** Index just after the opening brace. */
	start: number;
	/** Index of the matching closing brace. */
	end: number;
}

/** Finds `{ ... }` after `opening`, matching nested braces. */
export function findBlock(source: string, opening: RegExp): Block | undefined {
	const match = opening.exec(source);
	if (match === null) return undefined;

	const start = match.index + match[0].length;
	let depth = 1;
	for (let index = start; index < source.length; index += 1) {
		const character = source[index];
		if (character === "{") depth += 1;
		if (character === "}") depth -= 1;
		if (depth === 0) return { start, end: index };
	}
	return undefined;
}

function unrecognized(file: string, what: string): RoworkError {
	return new RoworkError(`Cannot find ${what} in ${file}.`, {
		hint: `${file} no longer has the shape Rowork generated, so it was not touched. Add the line by hand, or restore the original structure.`,
	});
}

/** Appends `line` as the last entry of a block, on its own line, keeping the layout. */
function appendToBlock(source: string, block: Block, line: string, needsComma: boolean): string {
	const body = source.slice(block.start, block.end);
	const trimmed = body.trimEnd();
	const lastLineBreak = trimmed.lastIndexOf("\n");

	// The block must be laid out one entry per line, as it was generated.
	if (trimmed.trim() !== "" && lastLineBreak === -1) return "";

	let before = trimmed;
	// An object literal needs a comma after the previous entry.
	// (A trailing comment line is not an entry: leave it alone.)
	const lastLine = trimmed.slice(lastLineBreak + 1).trim();
	if (needsComma && trimmed.trim() !== "" && !trimmed.endsWith(",") && !lastLine.startsWith("//")) {
		before = `${trimmed},`;
	}

	// Keep the line break and the indentation that were in front of the closing brace:
	// a nested block (`middleware: { ... }`) is indented, a top-level one is not.
	const trailing = body.slice(trimmed.length);
	const closing = source.slice(block.end);
	return `${source.slice(0, block.start)}${before}\n${line}${trailing.includes("\n") ? trailing : "\n"}${closing}`;
}

export type StatType = "number" | "string" | "boolean";

const FIELD = (name: string): RegExp => new RegExp(`^\\s*${name}\\s*\\??\\s*:`, "m");
/** An event is a method signature, `name(...)`, not a field. */
const EVENT = (name: string): RegExp => new RegExp(`^\\s*${name}\\s*\\(`, "m");

/** Adds a field to the `PlayerData` interface and to `DEFAULT_PLAYER_DATA`. */
export function addFieldToPlayerData(
	source: string,
	file: string,
	field: { name: string; type: StatType; defaultValue: string },
): string {
	const iface = findBlock(source, /export\s+interface\s+PlayerData\s*\{/);
	if (iface === undefined) throw unrecognized(file, "`export interface PlayerData { ... }`");

	if (FIELD(field.name).test(source.slice(iface.start, iface.end))) {
		throw new RoworkError(`\`${field.name}\` is already saved in ${file}.`, {
			hint: "Pick another name, or edit the existing field by hand.",
		});
	}

	const withInterface = appendToBlock(source, iface, `\t${field.name}: ${field.type};`, false);
	if (withInterface === "") throw unrecognized(file, "one field per line in `PlayerData`");

	const defaults = findBlock(withInterface, /export\s+const\s+DEFAULT_PLAYER_DATA\s*:\s*PlayerData\s*=\s*\{/);
	if (defaults === undefined) throw unrecognized(file, "`export const DEFAULT_PLAYER_DATA: PlayerData = { ... }`");

	const withDefaults = appendToBlock(withInterface, defaults, `\t${field.name}: ${field.defaultValue},`, true);
	if (withDefaults === "") throw unrecognized(file, "one entry per line in `DEFAULT_PLAYER_DATA`");
	return withDefaults;
}

/** Adds a name to the `SHOWN` list of the leaderstats service. */
export function addToShownList(source: string, file: string, name: string): string {
	const match = /(const\s+SHOWN\b[^=]*=\s*\[)([^\]]*)(\])/.exec(source);
	if (match === null) throw unrecognized(file, "the `SHOWN` list");

	const items = (match[2] ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item !== "");
	if (items.includes(JSON.stringify(name))) return source;

	const updated = [...items, JSON.stringify(name)].join(", ");
	return `${source.slice(0, match.index)}${match[1]}${updated}${match[3]}${source.slice(match.index + match[0].length)}`;
}

const PLACEHOLDER = /^\s*\/\/ \(none yet\)\s*\n/m;

/** Adds an event signature to the client-to-server or server-to-client interface. */
export function addEventToNetworking(
	source: string,
	file: string,
	direction: "server" | "client",
	event: { name: string; parameters: string },
): string {
	const both = [/interface\s+ClientToServerEvents\s*\{/, /interface\s+ServerToClientEvents\s*\{/];
	for (const opening of both) {
		const block = findBlock(source, opening);
		if (block === undefined) throw unrecognized(file, `\`${opening.source.replace(/\\s[*+]/g, " ").replace(/\\/g, "")}\``);
		if (EVENT(event.name).test(source.slice(block.start, block.end))) {
			throw new RoworkError(`An event called \`${event.name}\` already exists in ${file}.`, {
				hint: "Pick another name.",
			});
		}
	}

	const block = findBlock(source, direction === "server" ? both[0] as RegExp : both[1] as RegExp);
	if (block === undefined) throw unrecognized(file, "the events interface");

	// The generated "(none yet)" placeholder goes away once there is a real event.
	const body = source.slice(block.start, block.end).replace(PLACEHOLDER, "\n");
	const cleaned = `${source.slice(0, block.start)}${body}${source.slice(block.end)}`;
	const cleanedBlock = findBlock(cleaned, direction === "server" ? both[0] as RegExp : both[1] as RegExp);
	if (cleanedBlock === undefined) throw unrecognized(file, "the events interface");

	const updated = appendToBlock(cleaned, cleanedBlock, `\t${event.name}(${event.parameters}): void;`, false);
	if (updated === "") throw unrecognized(file, "one event per line");
	return updated;
}

/**
 * Adds an event to the `middleware` list of the server's `createServer` call, so
 * a new event the client sends is rate limited like the others.
 *
 * Returns undefined, not an error, when the list is not there any more: the user
 * may have removed it on purpose, and the event itself is still worth adding. The
 * caller says so.
 */
export function addRateLimit(source: string, name: string): string | undefined {
	const block = findBlock(source, /middleware\s*:\s*\{/);
	if (block === undefined) return undefined;
	if (new RegExp(`^\\s*${name}\\s*:`, "m").test(source.slice(block.start, block.end))) return source;

	const updated = appendToBlock(source, block, `\t\t${name}: [limit()],`, true);
	return updated === "" ? undefined : updated;
}
