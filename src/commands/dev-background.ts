import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { clearRecord, logFile, runningRecord, stopProcess, tailLog } from "../core/background.js";
import { defineCommand } from "../plugins/api.js";

function requireRoot(root: string | undefined, command: string): string {
	if (root === undefined) {
		throw new RoworkError(`\`rowork ${command}\` must run inside a Rowork project.`, {
			hint: "No rowork.json found here or in any parent directory.",
		});
	}
	return root;
}

export const devStopCommand = defineCommand({
	name: "dev:stop",
	description: "Stop the `rowork dev` running in the background.",
	async run(context) {
		const root = requireRoot(context.projectRoot, "dev:stop");
		const record = runningRecord(root);

		if (record === undefined) {
			context.logger.info("No `rowork dev` is running in the background.");
			return;
		}

		context.logger.step(`stopping rowork dev (pid ${record.pid})`);
		const clean = await stopProcess(record.pid);
		clearRecord(root);

		if (clean) {
			context.logger.success("Stopped.");
		} else {
			context.logger.warn(
				`It did not stop in time and was killed. If port ${record.port} is still busy, look for a leftover rojo process.`,
			);
		}
	},
});

export const devLogsCommand = defineCommand({
	name: "dev:logs",
	description: "Show the output of the background `rowork dev` (compiler errors included).",
	options: [
		{ flags: "-n, --lines <count>", description: "how many recent lines to show (default 40)" },
		{ flags: "-f, --follow", description: "keep printing new output until Ctrl+C" },
	],
	async run(context) {
		const root = requireRoot(context.projectRoot, "dev:logs");
		const file = logFile(root);

		if (!existsSync(file)) {
			throw new RoworkError("There is no background log yet.", {
				hint: "Start one with `rowork dev -d`.",
			});
		}

		const rawLines = context.options["lines"];
		const count = typeof rawLines === "string" ? Number(rawLines) : 40;
		if (!Number.isInteger(count) || count < 1) {
			throw new RoworkError(`\`${String(rawLines)}\` is not a valid line count.`);
		}

		for (const line of tailLog(root, count)) process.stdout.write(`${line}\n`);

		if (context.options["follow"] !== true) {
			if (runningRecord(root) === undefined) {
				context.logger.info(pc.dim("(rowork dev is not running in the background)"));
			}
			return;
		}

		// Follow: print what is appended, until Ctrl+C.
		let offset = statSync(file).size;
		await new Promise<void>((resolve) => {
			const timer = setInterval(() => {
				const size = statSync(file).size;
				if (size < offset) offset = 0; // the log was restarted
				if (size === offset) return;

				const buffer = Buffer.alloc(size - offset);
				const fd = openSync(file, "r");
				readSync(fd, buffer, 0, buffer.length, offset);
				closeSync(fd);
				offset = size;
				process.stdout.write(buffer);
			}, 300);

			process.once("SIGINT", () => {
				clearInterval(timer);
				resolve();
			});
		});
	},
});
