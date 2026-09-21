/*
 * Rowork dashboard. No framework, no build step, no network access beyond the
 * server that served this page.
 *
 * Everything that comes from outside (tool output, command names, descriptions) is
 * put on the page with textContent, never as HTML: a hostile line in a log must not
 * be able to run script in this page.
 */
(() => {
	"use strict";

	const $ = (id) => document.getElementById(id);

	/** Builds an element with text only. */
	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function clear(node) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	// ---- tabs
	for (const tab of document.querySelectorAll(".tab")) {
		tab.addEventListener("click", () => {
			for (const other of document.querySelectorAll(".tab")) other.classList.toggle("active", other === tab);
			for (const panel of document.querySelectorAll(".panel")) {
				panel.classList.toggle("active", panel.id === tab.dataset.tab);
			}
		});
	}

	// ---- overview
	function renderInfo(info) {
		$("version").textContent = `v${info.rowork.version}`;
		$("project").textContent = info.project
			? `${info.project.name}  ·  ${info.project.root}`
			: "Not inside a Rowork project";

		const modules = $("modules");
		clear(modules);
		for (const module of info.modules) {
			const item = el("li");
			item.appendChild(el("span", "name", module.title));
			item.appendChild(el("span", "desc", module.description));
			item.appendChild(
				module.installed ? el("span", "badge installed", "installed") : el("code", "", `rowork add ${module.name}`),
			);
			modules.appendChild(item);
		}

		const integrations = $("integrations");
		clear(integrations);
		for (const integration of info.integrations) {
			const item = el("li");
			item.appendChild(el("span", "name", integration.modules.join(" + ")));
			item.appendChild(el("span", "desc", integration.description));
			item.appendChild(
				integration.applied ? el("span", "badge applied", "wired") : el("span", "badge", "waiting for both"),
			);
			integrations.appendChild(item);
		}

		const commands = $("commands");
		clear(commands);
		for (const command of info.commands) {
			const item = el("div", "command");
			item.appendChild(el("span", "cmd", `rowork ${command.name}`));
			item.appendChild(el("span", "desc", command.description));
			if (command.guided) item.appendChild(el("span", "badge guided", "guided"));
			commands.appendChild(item);
		}

		const dev = info.project && info.project.devRunningInBackground;
		const status = $("dev-status");
		status.textContent = dev ? `running in the background (pid ${dev.pid}, port ${dev.port})` : "not running in the background";
		status.className = dev ? "status on" : "status";
	}

	async function refresh() {
		try {
			const response = await fetch("/api/info", { cache: "no-store" });
			if (response.ok) renderInfo(await response.json());
		} catch {
			// The server stopped: keep what is on screen.
		}
	}
	refresh();
	setInterval(refresh, 3000);

	// ---- dev output
	const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
	const log = $("log");
	const MAX_LINES = 2000;

	function addLine(text) {
		log.appendChild(document.createTextNode(`${text.replace(ANSI, "")}\n`));
		while (log.childNodes.length > MAX_LINES) log.removeChild(log.firstChild);
		if ($("follow").checked) log.scrollTop = log.scrollHeight;
	}

	const stream = new EventSource("/api/dev/logs");
	stream.onmessage = (event) => {
		try {
			addLine(JSON.parse(event.data));
		} catch {
			// Ignore a malformed message rather than break the stream.
		}
	};

	$("clear").addEventListener("click", () => clear(log));
})();
