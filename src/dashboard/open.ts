import { spawn } from "node:child_process";

/** Opens an address in the default browser. Best effort: the address is always printed too. */
export function openBrowser(url: string): void {
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
