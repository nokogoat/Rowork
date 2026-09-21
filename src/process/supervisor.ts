import type { ChildProcess } from "node:child_process";
import spawn from "cross-spawn";
import pc from "picocolors";

import { pathWithLocalBinaries } from "../core/toolchain.js";
import type { Logger } from "../plugins/api.js";
import { createLineSplitter } from "./log-mux.js";
import { killTree, killTreeSync } from "./tree-kill.js";

export interface TaskDefinition {
	/** Short label shown as the log prefix. */
	name: string;
	command: string;
	args: string[];
	/** Colourises this task's prefix. */
	paint: (text: string) => string;
}

interface RunningTask {
	definition: TaskDefinition;
	child: ChildProcess;
	/** Last lines seen, replayed if the task dies unexpectedly. */
	recentOutput: string[];
	exited: boolean;
}

const RECENT_OUTPUT_LINES = 12;

export interface SupervisorOptions {
	tasks: TaskDefinition[];
	cwd: string;
	logger: Logger;
	/** Receives, verbatim, every line the supervisor prints for a task (prefix and colours included). */
	onOutput?: (text: string) => void;
}

/**
 * Runs several long-lived tools side by side under one terminal.
 *
 * Two rules drive the design:
 *
 *  - A task dying is a hard stop. A `rowork dev` that keeps a Rojo server alive
 *    after the compiler died would serve stale code while looking healthy,
 *    which is worse than exiting.
 *  - Nothing outlives the supervisor. Every exit path, including Ctrl+C and a
 *    crash of the CLI itself, goes through a process-tree kill.
 */
export class Supervisor {
	private readonly running: RunningTask[] = [];
	private shuttingDown = false;
	private exitCode = 0;

	constructor(private readonly options: SupervisorOptions) {}

	async run(): Promise<number> {
		const width = Math.max(...this.options.tasks.map((task) => task.name.length));

		this.installSignalHandlers();

		for (const definition of this.options.tasks) {
			this.start(definition, width);
		}

		await Promise.all(this.running.map((task) => this.waitFor(task)));

		return this.exitCode;
	}

	private start(definition: TaskDefinition, width: number): void {
		const prefix = definition.paint(definition.name.padEnd(width));

		const child = spawn(definition.command, definition.args, {
			cwd: this.options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
			// A process group of its own, so the whole tree can be signalled at
			// once. Not on Windows, where it would open a separate console window.
			detached: process.platform !== "win32",
			env: {
				...process.env,
				// Children write to a pipe, not a TTY, so they would drop their
				// colours. Most respect FORCE_COLOR, which keeps compiler
				// diagnostics readable.
				FORCE_COLOR: "1",
				PATH: pathWithLocalBinaries(this.options.cwd),
			},
		});

		const task: RunningTask = { definition, child, recentOutput: [], exited: false };
		this.running.push(task);

		const emit = (line: string, isStderr: boolean): void => {
			task.recentOutput.push(line);
			if (task.recentOutput.length > RECENT_OUTPUT_LINES) task.recentOutput.shift();
			const text = `${prefix} ${pc.dim("|")} ${isStderr ? pc.yellow(line) : line}\n`;
			process.stderr.write(text);
			this.options.onOutput?.(text);
		};

		const stdout = createLineSplitter((line) => emit(line, false));
		const stderr = createLineSplitter((line) => emit(line, true));

		child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

		child.on("error", (error) => {
			emit(`could not start \`${definition.command}\`: ${error.message}`, true);
		});

		child.on("close", () => {
			stdout.flush();
			stderr.flush();
		});
	}

	private waitFor(task: RunningTask): Promise<void> {
		return new Promise((resolve) => {
			const settle = (code: number | null, signal: NodeJS.Signals | null): void => {
				if (task.exited) return;
				task.exited = true;

				if (!this.shuttingDown) {
					this.reportUnexpectedExit(task, code, signal);
					void this.shutdown(code ?? 1);
				}
				resolve();
			};

			task.child.on("close", settle);
			task.child.on("error", () => settle(1, null));
		});
	}

	/**
	 * Surfaces the failure loudly and replays the task's last lines.
	 *
	 * In a unified log the actual cause has usually scrolled past, buried under
	 * output from the tasks that are still healthy. Repeating it at the bottom
	 * is the difference between a usable orchestrator and a wall of text.
	 */
	private reportUnexpectedExit(
		task: RunningTask,
		code: number | null,
		signal: NodeJS.Signals | null,
	): void {
		const reason = signal !== null ? `signal ${signal}` : `exit code ${String(code)}`;
		const { logger } = this.options;

		logger.blank();
		logger.error(`Task \`${task.definition.name}\` stopped (${reason}). Shutting the others down.`);

		if (task.recentOutput.length > 0) {
			logger.info(pc.dim(`  last output from ${task.definition.name}:`));
			for (const line of task.recentOutput) logger.info(pc.dim(`    ${line}`));
		}
		logger.blank();
	}

	private async shutdown(code: number): Promise<void> {
		if (this.shuttingDown) return;
		this.shuttingDown = true;
		this.exitCode = code;

		await Promise.all(
			this.running.filter((task) => !task.exited).map((task) => killTree(task.child)),
		);
	}

	private installSignalHandlers(): void {
		const onSignal = (): void => {
			if (this.shuttingDown) return;
			this.options.logger.blank();
			this.options.logger.info("Stopping...");
			void this.shutdown(0);
		};

		// SIGHUP is what closing the terminal window sends. Without it the CLI
		// dies on the spot, its "exit" handler never runs, and the tasks (each in
		// a process group of their own) carry on with nobody to stop them,
		// still holding the Rojo port. SIGBREAK is the Windows equivalent of
		// Ctrl+Break and closing the console.
		for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
			process.once(signal, onSignal);
		}

		// Last resort: if the CLI itself throws, detached children would survive.
		process.once("exit", () => {
			for (const task of this.running) {
				if (!task.exited) killTreeSync(task.child);
			}
		});
	}
}
