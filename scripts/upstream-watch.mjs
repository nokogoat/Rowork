#!/usr/bin/env node
/**
 * Weekly check that Rowork still works with the LATEST upstream tools.
 *
 * Rowork does not pin most of what it installs: npm resolves the newest
 * roblox-ts, Flamework, Lapis and so on when a project is created. So a tool
 * can change under us between two pull requests and nobody notices until a user
 * hits it. This script is what notices first.
 *
 * What it does:
 *   1. Reports the latest version of every upstream tool, and whether the
 *      offline-fallback Rojo version in Rowork has fallen behind.
 *   2. Creates a real project (real npm install, real Rokit), adds every module,
 *      and compiles it with the real compiler.
 *   3. Points the project at the latest Rojo and runs a real `rojo build`, which
 *      proves the generated Rojo project file is still accepted.
 *
 * `--report-only` does step 1 and stops: quick, and needs no install.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repositoryRoot, "bin", "rowork.js");
const reportOnly = process.argv.includes("--report-only");

const NPM_PACKAGES = [
	"roblox-ts",
	"rbxts-transformer-flamework",
	"@flamework/core",
	"@flamework/components",
	"@flamework/networking",
	"@rbxts/lapis",
	"eslint",
	"eslint-plugin-roblox-ts",
	"@rbxts/react",
	"@rbxts/react-roblox",
	"@rbxts/ui-labs",
	"prettier",
	"@rbxts/t",
];

const failures = [];
const report = [];

function githubHeaders() {
	const headers = { "User-Agent": "rowork-upstream-watch", Accept: "application/vnd.github+json" };
	if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	return headers;
}

async function latestRelease(repository) {
	const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: githubHeaders() });
	if (!response.ok) throw new Error(`${repository}: GitHub answered ${response.status}`);
	return String((await response.json()).tag_name).replace(/^v/, "");
}

function latestNpm(name) {
	const result = spawnSync("npm", ["view", name, "version"], { encoding: "utf8", shell: process.platform === "win32" });
	if (result.status !== 0) throw new Error(`npm view ${name} failed: ${result.stderr}`);
	return result.stdout.trim();
}

/** The one Rojo version Rowork writes down itself: the offline fallback in versions.ts. */
function pinnedRojo() {
	const source = readFileSync(join(repositoryRoot, "src", "core", "versions.ts"), "utf8");
	return /FALLBACK_ROJO_VERSION = "([^"]+)"/.exec(source)?.[1];
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { encoding: "utf8", ...options, shell: options.shell ?? (process.platform === "win32") });
	return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// ---- 1. what is out there

report.push("## Upstream versions", "", "| Tool | Latest | Note |", "| --- | --- | --- |");

let latestRojo;
try {
	latestRojo = await latestRelease("rojo-rbx/rojo");
	const pinned = pinnedRojo();
	const behind = pinned !== undefined && pinned !== latestRojo;
	report.push(`| Rojo | ${latestRojo} | offline fallback is ${pinned}${behind ? " (**behind**, update it in src/core/versions.ts)" : ""} |`);
	const latestRokit = await latestRelease("rojo-rbx/rokit");
	report.push(`| Rokit | ${latestRokit} | always installed at its latest |`);
} catch (error) {
	failures.push(`could not read the latest GitHub releases: ${error.message}`);
}

for (const name of NPM_PACKAGES) {
	try {
		report.push(`| ${name} | ${latestNpm(name)} | resolved by npm at project creation |`);
	} catch (error) {
		failures.push(error.message);
	}
}

// ---- 2 and 3. does it still work

const workspace = mkdtempSync(join(tmpdir(), "rowork-watch-"));
const home = join(workspace, "home");
mkdirSync(home);

if (!reportOnly && failures.length === 0) {
	// A throwaway home: Rokit's self-install edits shell profiles.
	const env = { ...process.env, HOME: home, USERPROFILE: home };
	const project = join(workspace, "WatchGame");

	try {
		console.log("creating a project with the latest npm packages...");
		const init = run(process.execPath, [cli, "init", "WatchGame", "--path", workspace, "--install-rokit", "--no-git"], { cwd: workspace, env, shell: false });
		if (init.status !== 0) throw new Error(`rowork init failed:\n${init.output}`);

		for (const args of [
			["add:player-data", "--field", "coins:number=0", "--field", "level:number=1"],
			["add:leaderstats", "--stat", "coins", "--stat", "level"],
			["add:networking", "--event", "buyItem:server(itemId: string)", "--event", "bought:client(itemId: string)"],
			["add:ui", "--no-plugin"],
			["make:service", "Ledger"],
			["make:component", "Door", "--side", "client"],
		]) {
			const step = run(process.execPath, [cli, ...args], { cwd: project, env, shell: false });
			if (step.status !== 0) throw new Error(`rowork ${args.join(" ")} failed:\n${step.output}`);
		}

		console.log("compiling...");
		const build = run("npm", ["run", "build"], { cwd: project, env });
		if (build.status !== 0 || /error TS/.test(build.output)) throw new Error(`the generated project no longer compiles:\n${build.output}`);

		const format = run("npm", ["run", "format:check"], { cwd: project, env });
		if (format.status !== 0) throw new Error(`the latest Prettier formats the code Rowork generates differently:\n${format.output}`);
		const lint = run("npm", ["run", "lint"], { cwd: project, env });
		if (lint.status !== 0) throw new Error(`the latest ESLint or roblox-ts plugin rejects the code Rowork generates:\n${lint.output}`);

		// Point at the latest Rojo and build a place file with it.
		const rokitToml = join(project, "rokit.toml");
		writeFileSync(rokitToml, readFileSync(rokitToml, "utf8").replace(/(rojo-rbx\/rojo@)[^"]+/, `$1${latestRojo}`));
		const rokit = join(home, ".rokit", "bin", process.platform === "win32" ? "rokit.exe" : "rokit");
		for (const args of [["trust", "rojo-rbx/rojo"], ["install"]]) {
			const step = run(rokit, args, { cwd: project, env, shell: false });
			if (step.status !== 0) throw new Error(`rokit ${args.join(" ")} failed for Rojo ${latestRojo}:\n${step.output}`);
		}

		const rojo = join(home, ".rokit", "bin", process.platform === "win32" ? "rojo.exe" : "rojo");
		const place = join(workspace, "watch.rbxl");
		const built = run(rojo, ["build", "default.project.json", "--output", place], { cwd: project, env, shell: false });
		if (built.status !== 0 || !existsSync(place) || statSync(place).size === 0) {
			throw new Error(`rojo ${latestRojo} cannot build the generated project:\n${built.output}`);
		}
		report.push("", `Rojo ${latestRojo} built the generated project (${statSync(place).size} bytes).`);
	} catch (error) {
		failures.push(error.message);
	} finally {
		try {
			rmSync(workspace, { recursive: true, force: true });
		} catch {
			// The workspace lives in a temp directory: the runner cleans it up anyway.
		}
	}
}

// ---- outcome

if (failures.length > 0) report.push("", "## Failures", "", ...failures.map((failure) => `- ${failure.split("\n")[0]}`));
const text = report.join("\n");
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);

if (failures.length > 0) {
	console.error("\nupstream check failed:");
	for (const failure of failures) console.error(`\n- ${failure}`);
	process.exit(1);
}
console.log(reportOnly ? "\nreport only: nothing was installed." : "\nupstream check passed.");
