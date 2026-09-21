import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { logFile, tailLog } from "../core/background.js";
import { loadConfig } from "../core/config.js";
import { collectInfo } from "../core/info.js";

/** Root of the shipped dashboard files, relative to the compiled dist/. */
function dashboardRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard");
}

/** The only files served: a fixed list, so no request can name a path of its own. */
const STATIC_FILES: Record<string, { file: string; type: string }> = {
	"/": { file: "index.html", type: "text/html; charset=utf-8" },
	"/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
	"/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
};

const COOKIE = "rowork_dashboard";

export interface DashboardOptions {
	projectRoot: string;
	roworkVersion: string;
	/** 0 lets the system pick a free port. */
	port: number;
}

export interface RunningDashboard {
	url: string;
	port: number;
	close(): Promise<void>;
}

function sameToken(given: string | undefined, expected: string): boolean {
	if (given === undefined) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

function cookieToken(request: IncomingMessage): string | undefined {
	const header = request.headers.cookie;
	if (header === undefined) return undefined;
	for (const part of header.split(";")) {
		const [name, ...value] = part.trim().split("=");
		if (name === COOKIE) return value.join("=");
	}
	return undefined;
}

/**
 * A local web dashboard for one project.
 *
 * This server can show logs and, later, run commands and use an API key, so it is
 * built like something a hostile web page will try to reach:
 *
 *  - It listens on 127.0.0.1 only, never on a network interface.
 *  - A random token, printed in the terminal, is required. It is exchanged once for a
 *    SameSite=Strict, HttpOnly cookie and removed from the URL, so it does not stay
 *    in the address bar, the history or a Referer header.
 *  - The Host header must be this very address. Without that check, a web page can
 *    point its own domain at 127.0.0.1 ("DNS rebinding") and talk to this server as
 *    if it were the same site.
 *  - Only GET is accepted, and only fixed files and fixed API routes exist.
 */
export function startDashboard(options: DashboardOptions): Promise<RunningDashboard> {
	const token = randomBytes(24).toString("hex");
	const sockets = new Set<Socket>();
	let boundPort = 0;

	const allowedHosts = (): string[] => [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];

	const send = (response: ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8"): void => {
		response.writeHead(status, {
			"content-type": type,
			"cache-control": "no-store",
			"x-content-type-options": "nosniff",
			"referrer-policy": "no-referrer",
			"content-security-policy": "default-src 'self'; frame-ancestors 'none'",
		});
		response.end(body);
	};

	const server: Server = createServer((request, response) => {
		if (!allowedHosts().includes(request.headers.host ?? "")) {
			send(response, 403, "Forbidden: unexpected Host header.");
			return;
		}
		if (request.method !== "GET") {
			send(response, 405, "Method not allowed.");
			return;
		}

		const url = new URL(request.url ?? "/", `http://127.0.0.1:${boundPort}`);

		// The first visit carries the token in the URL: trade it for a cookie and clean the address.
		const queryToken = url.searchParams.get("token") ?? undefined;
		if (queryToken !== undefined) {
			if (!sameToken(queryToken, token)) {
				send(response, 403, "Forbidden: wrong token.");
				return;
			}
			response.writeHead(302, {
				location: url.pathname,
				"set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
				"cache-control": "no-store",
			});
			response.end();
			return;
		}

		if (!sameToken(cookieToken(request), token)) {
			send(response, 403, "Forbidden: open the address printed by `rowork dashboard`, it carries a one-time token.");
			return;
		}

		const asset = STATIC_FILES[url.pathname];
		if (asset !== undefined) {
			const path = join(dashboardRoot(), asset.file);
			if (!existsSync(path)) {
				send(response, 500, `Missing dashboard file ${asset.file}.`);
				return;
			}
			send(response, 200, readFileSync(path, "utf8"), asset.type);
			return;
		}

		if (url.pathname === "/api/info") {
			let config;
			try {
				config = loadConfig(options.projectRoot);
			} catch {
				config = undefined;
			}
			const info = collectInfo({ config, projectRoot: options.projectRoot, roworkVersion: options.roworkVersion });
			send(response, 200, JSON.stringify(info), "application/json; charset=utf-8");
			return;
		}

		if (url.pathname === "/api/dev/logs") {
			streamLogs(request, response, options.projectRoot);
			return;
		}

		send(response, 404, "Not found.");
	});

	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});

	return new Promise((resolvePromise, rejectPromise) => {
		server.once("error", rejectPromise);
		server.listen(options.port, "127.0.0.1", () => {
			const address = server.address();
			boundPort = typeof address === "object" && address !== null ? address.port : options.port;
			resolvePromise({
				url: `http://127.0.0.1:${boundPort}/?token=${token}`,
				port: boundPort,
				close: () =>
					new Promise<void>((done) => {
						// Server-sent event streams never end on their own: cut them.
						for (const socket of sockets) socket.destroy();
						server.close(() => done());
					}),
			});
		});
	});
}

/**
 * Sends the last lines of the background `rowork dev` log, then each new line as it
 * is written, as server-sent events. Polling the file (rather than a watcher) is the
 * same on every OS and survives the log being restarted by a new `dev -d`.
 */
function streamLogs(request: IncomingMessage, response: ServerResponse, projectRoot: string): void {
	response.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-store",
		connection: "keep-alive",
		"x-content-type-options": "nosniff",
	});

	const emit = (line: string): void => {
		response.write(`data: ${JSON.stringify(line)}\n\n`);
	};

	for (const line of tailLog(projectRoot, 200)) emit(line);

	const file = logFile(projectRoot);
	let offset = existsSync(file) ? statSync(file).size : 0;
	let pending = "";

	const timer = setInterval(() => {
		if (!existsSync(file)) return;
		const size = statSync(file).size;
		if (size < offset) offset = 0; // a new `dev -d` restarted the log
		if (size === offset) return;

		const chunks: Buffer[] = [];
		const stream = createReadStream(file, { start: offset, end: size - 1 });
		stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
		stream.on("end", () => {
			pending += Buffer.concat(chunks).toString("utf8");
			const lines = pending.split("\n");
			pending = lines.pop() ?? "";
			for (const line of lines) if (line !== "") emit(line);
		});
		offset = size;
	}, 400);

	request.on("close", () => clearInterval(timer));
}
