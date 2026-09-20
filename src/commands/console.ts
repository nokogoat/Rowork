import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { activeRegistry } from "../cli/registry.js";
import { defineCommand } from "../plugins/api.js";
import { requireInteractive } from "../ui/prompt.js";

/** Marks child processes so the console cannot be nested inside itself. */
const IN_CONSOLE = "ROWORK_IN_CONSOLE";

const BUILTINS: readonly { name: string; description: string }[] = [
	{ name: "help", description: "list the commands" },
	{ name: "clear", description: "clear the screen" },
	{ name: "exit", description: "leave the console (or press Ctrl+D)" },
];

/** Splits a line into arguments, keeping "quoted text" together. */
export function tokenize(line: string): string[] {
	const tokens: string[] = [];
	const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
	for (const match of line.matchAll(pattern)) {
		tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
	}
	return tokens;
}

function commandNames(): string[] {
	const registered = activeRegistry()?.all().map((entry) => entry.definition.name) ?? [];
	return [...registered, ...BUILTINS.map((builtin) => builtin.name)].sort();
}

function printHelp(): void {
	const entries = [
		...(activeRegistry()?.all().map((entry) => ({
			name: entry.definition.name,
			description: entry.definition.description,
		})) ?? []),
		...BUILTINS,
	].filter((entry) => entry.name !== "console");
	const width = Math.max(...entries.map((entry) => entry.name.length));

	process.stderr.write("\n");
	for (const entry of entries) {
		process.stderr.write(`  ${pc.cyan(entry.name.padEnd(width))}  ${entry.description}\n`);
	}
	process.stderr.write(`\n  ${pc.dim("Add --help to any command for its options.")}\n\n`);
}

/**
 * Runs one line as a normal `rowork` process.
 *
 * A child process rather than an in-process call: guided prompts, `--help`,
 * error reporting and the Ctrl+C handling of `rowork dev` then behave exactly
 * as they do outside the console, with no shared state to leak between
 * commands. The console itself ignores Ctrl+C while a command runs, so
 * stopping `dev` returns to the prompt instead of closing everything.
 */
function runLine(tokens: string[], cwd: string): Promise<void> {
	return new Promise((resolve) => {
		const script = process.argv[1];
		if (script === undefined) {
			resolve();
			return;
		}

		const ignore = (): void => {};
		process.on("SIGINT", ignore);

		const child = spawn(process.execPath, [script, "--cwd", cwd, ...tokens], {
			stdio: "inherit",
			env: { ...process.env, [IN_CONSOLE]: "1" },
		});

		const finish = (): void => {
			process.off("SIGINT", ignore);
			resolve();
		};
		child.on("error", (error) => {
			process.stderr.write(`${pc.red("error")} ${error.message}\n`);
			finish();
		});
		child.on("close", finish);
	});
}

export const consoleCommand = defineCommand({
	name: "console",
	description: "Open an interactive Rowork prompt: type commands without retyping `rowork`.",
	async run(context) {
		if (process.env[IN_CONSOLE] !== undefined) {
			throw new RoworkError("You are already in the Rowork console.");
		}
		requireInteractive("console", "rowork <command>");

		const label = context.config?.name ?? "rowork";
		const promptText = `${pc.bold(pc.cyan(label))}${pc.dim(" >")} `;

		process.stderr.write(
			`${pc.bold("Rowork console")} ${pc.dim(`v${context.roworkVersion}`)}\n` +
				pc.dim("Type a command (make, dev, studio...). `help` lists them, `exit` leaves.\n\n"),
		);

		const history: string[] = [];

		for (;;) {
			// A fresh interface per line: guided commands take over the terminal
			// with their own prompts, and two readers on stdin would fight.
			const rl = createInterface({
				input: process.stdin,
				output: process.stderr,
				history: [...history],
				completer: (line: string): [string[], string] => {
					const names = commandNames();
					const hits = line.includes(" ") ? [] : names.filter((name) => name.startsWith(line));
					return [hits.length > 0 ? hits : [], line];
				},
			});

			let line: string;
			try {
				line = await rl.question(promptText);
			} catch {
				// Ctrl+D or a closed input.
				rl.close();
				return;
			}
			rl.close();

			const tokens = tokenize(line.trim());
			if (tokens[0] === "rowork") tokens.shift();
			if (tokens.length === 0) continue;

			history.unshift(line.trim());

			const [first] = tokens;
			if (first === "exit" || first === "quit") return;
			if (first === "clear") {
				process.stderr.write("\x1bc");
				continue;
			}
			if (first === "help" || first === "?") {
				printHelp();
				continue;
			}

			// Commander would dump the whole usage for a typo: say it in one line.
			if (first !== undefined && !first.startsWith("-") && !commandNames().includes(first)) {
				const close = commandNames().filter((name) => name.startsWith(first.slice(0, 3)));
				process.stderr.write(
					`${pc.red("error")} Unknown command \`${first}\`.${close.length > 0 ? ` Did you mean ${close.map((name) => `\`${name}\``).join(", ")}?` : ""} Type \`help\` for the list.\n\n`,
				);
				continue;
			}

			await runLine(tokens, context.cwd);
			process.stderr.write("\n");
		}
	},
});
