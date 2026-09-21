import { spawn } from "node:child_process";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { startDashboard } from "../dashboard/server.js";
import { defineCommand } from "../plugins/api.js";
import { requireProject } from "./make.js";

/** Opens the address in the default browser. Best effort: the address is always printed too. */
function openBrowser(url: string): void {
	const [command, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];
	try {
		const child = spawn(command, args, { stdio: "ignore", detached: true });
		child.on("error", () => {});
		child.unref();
	} catch {
		// No browser to open: the printed address is enough.
	}
}

export const dashboardCommand = defineCommand({
	name: "dashboard",
	description: "Open a local web dashboard for the project: state, modules and the live output of `dev`.",
	options: [
		{ flags: "--port <port>", description: "port to listen on (default: any free one)" },
		{ flags: "--no-open", description: "print the address without opening a browser" },
	],
	async run(context) {
		const { root } = requireProject(context, "dashboard");

		const rawPort = context.options["port"];
		const port = typeof rawPort === "string" ? Number(rawPort) : 0;
		if (!Number.isInteger(port) || port < 0 || port > 65535) {
			throw new RoworkError(`\`${String(rawPort)}\` is not a valid port.`, { hint: "Use a number between 0 and 65535." });
		}

		const dashboard = await startDashboard({ projectRoot: root, roworkVersion: context.roworkVersion, port }).catch((error: unknown) => {
			throw new RoworkError("Could not start the dashboard.", {
				hint: error instanceof Error ? error.message : String(error),
			});
		});

		context.logger.success("Dashboard running. Only this computer can reach it.");
		context.logger.info(`  ${pc.bold(dashboard.url)}`);
		context.logger.info(pc.dim("  The address carries a secret token: do not share it. Press Ctrl+C to stop."));
		if (context.options["open"] !== false) openBrowser(dashboard.url);

		await new Promise<void>((resolve) => {
			const stop = (): void => resolve();
			for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.once(signal, stop);
		});

		await dashboard.close();
		context.logger.info("Dashboard stopped.");
	},
});
