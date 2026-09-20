#!/usr/bin/env node
/**
 * End-to-end check that `rowork init` still produces a usable project.
 *
 * Written in Node rather than shell so the exact same test runs on Linux,
 * macOS and Windows: the CI matrix is the only place where the Windows-specific
 * branches of exec.ts and bin/rowork.js are ever exercised.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repositoryRoot, "bin", "rowork.js");

const EXPECTED_FILES = [
	".gitignore",
	"README.md",
	"default.project.json",
	"package.json",
	"rokit.toml",
	"rowork.json",
	"tsconfig.json",
	join("src", "client", "controllers", "ExampleController.ts"),
	join("src", "client", "runtime.client.ts"),
	join("src", "server", "runtime.server.ts"),
	join("src", "server", "services", "ExampleService.ts"),
	join("src", "shared", ".gitkeep"),
];

// Creating a project looks up the latest Rojo on GitHub, which allows only 60 anonymous
// requests an hour: this test creates many projects, so it fixes the version instead.
process.env["ROWORK_ROJO_VERSION"] = "7.7.0";

const failures = [];

function check(condition, message) {
	if (!condition) failures.push(message);
}

const workspace = mkdtempSync(join(tmpdir(), "rowork-smoke-"));

try {
	const result = spawnSync(
		process.execPath,
		[cli, "init", "SmokeGame", "--path", workspace, "--no-install"],
		{ encoding: "utf8" },
	);

	check(result.status === 0, `\`rowork init\` exited with ${result.status}\n${result.stderr}`);

	const project = join(workspace, "SmokeGame");

	for (const file of EXPECTED_FILES) {
		check(existsSync(join(project, file)), `missing generated file: ${file}`);
	}

	// Every template placeholder must have been substituted. A leftover `{{ ... }}`
	// means a variable was renamed in the command but not in the template.
	for (const file of EXPECTED_FILES) {
		const path = join(project, file);
		if (!existsSync(path)) continue;
		const contents = readFileSync(path, "utf8");
		check(!contents.includes("{{"), `unrendered template placeholder in ${file}`);
	}

	// Exercises core/exec.ts for real. Spawning external tools is where the
	// platform-specific traps live, and a build alone never touches that path.
	check(existsSync(join(project, ".git")), "git init did not run: no .git directory was created");

	const configPath = join(project, "rowork.json");
	if (existsSync(configPath)) {
		const config = JSON.parse(readFileSync(configPath, "utf8"));
		check(config.name === "SmokeGame", `rowork.json name is ${config.name}, expected SmokeGame`);
		check(config.language === "roblox-ts", "rowork.json language is not roblox-ts");
		check(typeof config.roworkApiVersion === "number", "rowork.json has no API version");
	}

	// A non-empty target directory must be refused without --force.
	const rerun = spawnSync(
		process.execPath,
		[cli, "init", "SmokeGame", "--path", workspace, "--no-install", "--no-git"],
		{ encoding: "utf8" },
	);
	check(rerun.status === 1, `re-running init on a non-empty directory exited with ${rerun.status}`);

	// An invalid project name must be refused.
	const invalid = spawnSync(
		process.execPath,
		[cli, "init", "9bad", "--path", workspace, "--no-install", "--no-git"],
		{ encoding: "utf8" },
	);
	check(invalid.status === 1, `an invalid project name exited with ${invalid.status}`);

	// `--no-examples` must drop the example files but keep the directories.
	const bare = spawnSync(
		process.execPath,
		[cli, "init", "BareGame", "--path", workspace, "--no-install", "--no-git", "--no-examples"],
		{ encoding: "utf8" },
	);
	check(bare.status === 0, `\`rowork init --no-examples\` exited with ${bare.status}\n${bare.stderr}`);
	const bareProject = join(workspace, "BareGame");
	check(
		!existsSync(join(bareProject, "src", "server", "services", "ExampleService.ts")),
		"--no-examples still generated ExampleService.ts",
	);
	check(
		existsSync(join(bareProject, "src", "server", "services", ".gitkeep")),
		"--no-examples left the services directory without a .gitkeep",
	);

	// Generators write the file, register component directories, and never overwrite.
	const makeRun = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: bareProject, encoding: "utf8" });
	check(makeRun("make:service", "player-stats").status === 0, "make:service failed");
	check(
		existsSync(join(bareProject, "src", "server", "services", "PlayerStatsService.ts")),
		"make:service did not create PlayerStatsService.ts",
	);
	check(makeRun("make:controller", "Camera").status === 0, "make:controller failed");
	check(
		existsSync(join(bareProject, "src", "client", "controllers", "CameraController.ts")),
		"make:controller did not create CameraController.ts",
	);
	check(makeRun("make:component", "Door", "--side", "client").status === 0, "make:component failed");
	const clientRuntime = readFileSync(join(bareProject, "src", "client", "runtime.client.ts"), "utf8");
	check(
		clientRuntime.includes('Flamework.addPaths("src/client/components")'),
		"make:component did not register its directory in runtime.client.ts",
	);
	makeRun("make:component", "Window", "--side", "client");
	check(
		clientRuntime.split("src/client/components").length === 2 &&
			readFileSync(join(bareProject, "src", "client", "runtime.client.ts"), "utf8").split("src/client/components").length === 2,
		"a second component registered the same directory twice",
	);
	check(makeRun("make:service", "PlayerStatsService").status === 1, "make:service overwrote an existing file");
	check(makeRun("make:component", "Door", "--side", "nowhere").status === 1, "an invalid --side was accepted");
	check(makeRun("make:component", "Door", "--tag", 'a"b', "--force").status === 1, "an unsafe --tag was accepted");



	// Modules: files written, recorded in rowork.json, never added twice, all-or-nothing.
	check(makeRun("add:player-data").status === 1, "add:player-data without a TTY or options did not refuse");
	check(makeRun("add").status === 1, "`rowork add` without a TTY did not refuse");
	const badModule = makeRun("add:player-data", "--field", "1bad", "--no-install");
	check(badModule.status === 1, "an invalid --field was accepted");
	check(!existsSync(join(bareProject, "src", "shared", "data")), "a failed module install left files behind");
	const added = makeRun("add:player-data", "--field", "coins:number=5", "--field", "nickname:string=Guest", "--no-install");
	check(added.status === 0, `add:player-data failed\n${added.stderr}`);
	const playerData = join(bareProject, "src", "shared", "data", "PlayerData.ts");
	check(existsSync(playerData), "add:player-data did not create PlayerData.ts");
	if (existsSync(playerData)) {
		const source = readFileSync(playerData, "utf8");
		check(source.includes("coins: number;") && source.includes("coins: 5,"), "PlayerData.ts ignores the coins field");
		check(source.includes('nickname: "Guest"'), "PlayerData.ts ignores the nickname field");
		check(!source.includes("{{"), "PlayerData.ts has an unrendered placeholder");
	}
	check(
		existsSync(join(bareProject, "src", "server", "services", "PlayerDataService.ts")),
		"add:player-data did not create PlayerDataService.ts",
	);
	check(
		JSON.parse(readFileSync(join(bareProject, "rowork.json"), "utf8")).modules?.includes("player-data"),
		"rowork.json does not record the installed module",
	);
	check(makeRun("add:player-data", "--field", "x:number=1", "--no-install").status === 1, "a module was installed twice");

	// A module that depends on another: refused until the prerequisite exists, then reads its fields.
	const leaderstatsFile = join(bareProject, "src", "server", "services", "LeaderstatsService.ts");
	check(makeRun("add:leaderstats", "--stat", "nope").status === 1 && !existsSync(leaderstatsFile), "leaderstats accepted an unknown field, or wrote before refusing");
	const stats = makeRun("add:leaderstats", "--stat", "coins");
	check(stats.status === 0, `add:leaderstats failed\n${stats.stderr}`);
	check(existsSync(leaderstatsFile) && readFileSync(leaderstatsFile, "utf8").includes('["coins"]'), "leaderstats does not show the requested field");
	check(JSON.parse(readFileSync(join(bareProject, "rowork.json"), "utf8")).modules?.includes("leaderstats"), "leaderstats is not recorded in rowork.json");

	// eject: previews without changing anything, then leaves a project that needs no Rowork.
	const ejectProject = join(workspace, "EjectGame");
	check(spawnSync(process.execPath, [cli, "init", "EjectGame", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" }).status === 0, "could not create the eject fixture");
	const ejectRun = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: ejectProject, encoding: "utf8" });
	check(ejectRun("eject").status === 1, "eject ran without confirmation and without a terminal");
	check(ejectRun("eject", "--dry-run").status === 0 && existsSync(join(ejectProject, "rowork.json")), "eject --dry-run changed something");
	const ejected = ejectRun("eject", "--yes", "--no-install");
	check(ejected.status === 0, `eject failed\n${ejected.stderr}`);
	check(!existsSync(join(ejectProject, "rowork.json")), "eject left rowork.json behind");
	const ejectedScripts = JSON.parse(readFileSync(join(ejectProject, "package.json"), "utf8")).scripts;
	check(/concurrently/.test(ejectedScripts.dev) && ejectedScripts.predev === "rbxtsc", "eject did not write the plain dev scripts");
	check(!/rowork/.test(readFileSync(join(ejectProject, "package.json"), "utf8").replace(/"generated by[^"]*"/, "")), "package.json still mentions rowork after eject");
	check(!/rowork dev/.test(readFileSync(join(ejectProject, "README.md"), "utf8")), "the README still says `rowork dev` after eject");
	check(ejectRun("dev").status === 1, "rowork dev still ran in an ejected project");

	// AI-friendly: AGENTS.md is generated, kept current by `add`, and removed on eject; info --json is machine-readable.
	const agentsProject = join(workspace, "AgentsGame");
	spawnSync(process.execPath, [cli, "init", "AgentsGame", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const agentsPath = join(agentsProject, "AGENTS.md");
	check(existsSync(agentsPath) && readFileSync(join(agentsProject, "CLAUDE.md"), "utf8").trim() === "@AGENTS.md", "init did not create AGENTS.md and a CLAUDE.md importing it");
	writeFileSync(agentsPath, readFileSync(agentsPath, "utf8") + "\n## My notes\n\nKeep shop prices.\n");
	const agentsRun = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: agentsProject, encoding: "utf8" });
	check(agentsRun("add:player-data", "--field", "coins:number=0", "--no-install").status === 0, "could not add a module to the agents project");
	const agentsAfter = readFileSync(agentsPath, "utf8");
	check(agentsAfter.includes("PlayerDataService"), "AGENTS.md was not refreshed with the installed module");
	check(agentsAfter.includes("Keep shop prices."), "AGENTS.md lost the user's own notes");
	check(agentsAfter.split("rowork:begin").length === 2, "AGENTS.md now holds the generated block more than once");
	const info = agentsRun("info", "--json");
	let parsed;
	try { parsed = JSON.parse(info.stdout); } catch { parsed = undefined; }
	check(parsed !== undefined, `info --json did not print valid JSON on stdout\n${info.stdout.slice(0, 200)}`);
	if (parsed !== undefined) {
		check(parsed.project?.modules?.includes("player-data"), "info --json does not list the installed module");
		check(parsed.modules.some((m) => m.name === "leaderstats" && m.installed === false && m.requires.includes("player-data")), "info --json lacks the module catalogue");
		check(parsed.commands.some((c) => c.name === "add:player-data" && c.guided === true && c.options.length > 0), "info --json lacks a command with its options");
	}
	const outside = spawnSync(process.execPath, [cli, "info", "--json"], { cwd: workspace, encoding: "utf8" });
	check(JSON.parse(outside.stdout).project === null, "info --json outside a project should give project: null");
	check(agentsRun("eject", "--yes", "--no-install").status === 0 && readFileSync(agentsPath, "utf8").includes("Keep shop prices.") && !readFileSync(agentsPath, "utf8").includes("rowork:begin"), "eject did not remove only the generated block of AGENTS.md");

	// Rojo is created at its newest version, not a number written in Rowork; update moves an old pin.
	const updateProject = join(workspace, "UpdateGame");
	spawnSync(process.execPath, [cli, "init", "UpdateGame", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const rokitPath = join(updateProject, "rokit.toml");
	const createdPin = /rojo@([0-9.]+)/.exec(readFileSync(rokitPath, "utf8"))?.[1];
	check(createdPin !== undefined && !readFileSync(rokitPath, "utf8").includes("{{"), "init did not write a Rojo version into rokit.toml");
	writeFileSync(rokitPath, readFileSync(rokitPath, "utf8").replace(/rojo@[0-9.]+/, "rojo@7.0.0"));
	// A throwaway home and a bare PATH: no Rokit is found, so nothing is downloaded.
	const isolated = { ...process.env, PATH: dirname(process.execPath), HOME: workspace, USERPROFILE: workspace };
	const updateRun = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: updateProject, encoding: "utf8", env: isolated });
	const preview = updateRun("update", "--dry-run", "--no-npm");
	check(preview.status === 0 && /7\.0\.0 -> /.test(preview.stderr.replace(/\x1b\[[0-9;]*m/g, "")), `update --dry-run did not report the old Rojo\n${preview.stderr}`);
	check(readFileSync(rokitPath, "utf8").includes("rojo@7.0.0"), "update --dry-run changed rokit.toml");
	check(updateRun("update", "--no-npm").status === 1, "update ran without confirmation and without a terminal");
	// All or nothing: if Rokit cannot install the new Rojo, the pin must go back,
	// otherwise `rowork dev` is left pointing at a Rojo that is not there.
	const fakeBin = join(workspace, "fake-bin");
	mkdirSync(fakeBin);
	writeFileSync(join(fakeBin, "rokit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
	writeFileSync(join(fakeBin, "rokit.cmd"), "@echo off\r\nexit /b 1\r\n");
	const failing = spawnSync(process.execPath, [cli, "update", "--yes", "--no-npm", "--no-build"], {
		cwd: updateProject,
		encoding: "utf8",
		env: { ...isolated, PATH: `${fakeBin}${process.platform === "win32" ? ";" : ":"}${dirname(process.execPath)}` },
	});
	check(failing.status === 1, `a failed Rojo install did not give a non-zero exit (got ${failing.status})`);
	check(readFileSync(rokitPath, "utf8").includes("rojo@7.0.0"), "update left a Rojo pin it could not install");
	check(/kept 7\.0\.0/.test(failing.stderr.replace(/\x1b\[[0-9;]*m/g, "")), "update did not say it kept the old Rojo");

	check(updateRun("update", "--yes", "--no-npm", "--no-build").status === 0, "update --yes failed");
	const movedPin = /rojo@([0-9.]+)/.exec(readFileSync(rokitPath, "utf8"))?.[1];
	check(movedPin !== undefined && movedPin !== "7.0.0", "update did not move the old Rojo pin");
	check(updateRun("update", "--no-npm").status === 0 && /up to date/.test(updateRun("update", "--no-npm").stderr), "a second update did not say everything is up to date");

	// A dev script the user wrote is theirs: eject must keep it.
	const ownProject = join(workspace, "OwnScriptGame");
	spawnSync(process.execPath, [cli, "init", "OwnScriptGame", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const ownManifestPath = join(ownProject, "package.json");
	const ownManifest = JSON.parse(readFileSync(ownManifestPath, "utf8"));
	ownManifest.scripts.dev = "node my-own-dev.js";
	writeFileSync(ownManifestPath, JSON.stringify(ownManifest, undefined, 2));
	const keptRun = spawnSync(process.execPath, [cli, "eject", "--yes", "--no-install"], { cwd: ownProject, encoding: "utf8" });
	check(keptRun.status === 0, `eject failed on a project with its own dev script\n${keptRun.stderr}`);
	check(JSON.parse(readFileSync(ownManifestPath, "utf8")).scripts.dev === "node my-own-dev.js", "eject overwrote the user's own dev script");

	// networking: typed events are validated before anything is written.
	for (const bad of ["a:server(player id: number)", "a:server(x)", "a:server(x: number); evil()", "nodirection", "1a:server"]) {
		check(makeRun("add:networking", "--event", bad, "--no-install").status === 1, `networking accepted an invalid event: ${bad}`);
	}
	check(!existsSync(join(bareProject, "src", "shared", "networking.ts")), "a refused networking event left files behind");
	const net = makeRun("add:networking", "--event", "buy item:server(itemId: string, amount: number)", "--event", "itemBought:client(itemId: string)", "--no-install");
	check(net.status === 0, `add:networking failed\n${net.stderr}`);
	const networkingFile = join(bareProject, "src", "shared", "networking.ts");
	const networking = existsSync(networkingFile) ? readFileSync(networkingFile, "utf8") : "";
	check(networking.includes("buyItem(itemId: string, amount: number): void;"), "networking.ts lacks the client-to-server event");
	check(networking.includes("itemBought(itemId: string): void;"), "networking.ts lacks the server-to-client event");
	check(existsSync(join(bareProject, "src", "server", "network.ts")) && existsSync(join(bareProject, "src", "client", "network.ts")), "networking did not create both network.ts files");

	// make:stat: a saved value is added to the player data, the leaderboard and a service, all or nothing.
	const statAt = (...a) => spawnSync(process.execPath, [cli, ...a], { cwd: bareProject, encoding: "utf8" });
	const dataFile = join(bareProject, "src", "shared", "data", "PlayerData.ts");
	// bareProject has player-data (coins, nickname), leaderstats (coins) and networking by now.
	const statOk = statAt("make:stat", "kills", "--type", "number", "--default", "0");
	check(statOk.status === 0, `make:stat failed\n${statOk.stderr}`);
	const dataAfter = readFileSync(dataFile, "utf8");
	check(dataAfter.includes("kills: number;") && dataAfter.includes("kills: 0,"), "make:stat did not add the value to PlayerData in both places");
	check(existsSync(join(bareProject, "src", "server", "services", "KillsService.ts")), "make:stat did not create the helper service for a number");
	check(readFileSync(leaderstatsFile, "utf8").includes('"kills"'), "make:stat did not add a number to the leaderboard");
	const beforeRefusals = readFileSync(dataFile, "utf8") + readFileSync(leaderstatsFile, "utf8");
	check(statAt("make:stat", "kills").status === 1, "make:stat added the same value twice");
	check(statAt("make:stat", "deaths", "--type", "date").status === 1, "make:stat accepted an unknown type");
	check(readFileSync(dataFile, "utf8") + readFileSync(leaderstatsFile, "utf8") === beforeRefusals, "a refused make:stat changed a file");
	check(statAt("make:stat", "title", "--type", "string", "--default", "Rookie").status === 0 && !existsSync(join(bareProject, "src", "server", "services", "TitleService.ts")), "a text stat should not get a service or a leaderboard entry by default");
	// A file the user restructured is never edited, and nothing else is written either.
	const restructured = readFileSync(dataFile, "utf8").replace("export interface PlayerData {", "export type PlayerData = {");
	writeFileSync(dataFile, restructured);
	check(statAt("make:stat", "assists").status === 1 && readFileSync(dataFile, "utf8") === restructured && !existsSync(join(bareProject, "src", "server", "services", "AssistsService.ts")), "make:stat edited a restructured file or wrote a service anyway");
	writeFileSync(dataFile, dataAfter);

	// make:event: a typed message added to the networking file, duplicates refused in either direction.
	const networkFile = join(bareProject, "src", "shared", "networking.ts");
	const eventOk = statAt("make:event", "cast spell", "--to", "server", "--args", "spellId: string");
	check(eventOk.status === 0 && readFileSync(networkFile, "utf8").includes("castSpell(spellId: string): void;"), `make:event did not add the message\n${eventOk.stderr}`);
	const networkBefore = readFileSync(networkFile, "utf8");
	check(statAt("make:event", "castSpell", "--to", "client").status === 1, "make:event accepted a name already used in the other direction");
	check(statAt("make:event", "bad", "--args", "x: number); evil(").status === 1, "make:event accepted an unsafe argument list");
	check(readFileSync(networkFile, "utf8") === networkBefore, "a refused make:event changed the networking file");
	// Links: "link it to..." generates the glue, and the server decides the amount, never the client.
	const servicesDir = join(bareProject, "src", "server", "services");
	const linked = statAt("make:event", "openGate", "--to", "server", "--link", "kills");
	check(linked.status === 0, `make:event --link failed\n${linked.stderr}`);
	const handlerPath = join(servicesDir, "OpenGateHandler.ts");
	const handler = existsSync(handlerPath) ? readFileSync(handlerPath, "utf8") : "";
	check(handler.includes("Events.openGate.connect") && handler.includes("this.kills.add(player, 1)"), "the linked handler does not react to the event and change the value");
	check(/decided HERE/.test(handler) && /forged/.test(handler), "the generated handler does not warn that client data cannot be trusted");
	check(!/amount|args\./.test(handler.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")), "the handler reads something the client sent");
	const dataBeforeLinks = readFileSync(dataFile, "utf8");
	const networkBeforeLinks = readFileSync(networkFile, "utf8");
	check(statAt("make:event", "ghost", "--link", "nope").status === 1 && readFileSync(networkFile, "utf8") === networkBeforeLinks, "make:event --link with an unknown value still wrote the event");
	check(statAt("make:event", "notice", "--to", "client", "--link", "kills").status === 1, "a link was accepted on an event the server sends");
	check(statAt("make:stat", "rank2", "--link", "openGate").status === 1 && readFileSync(dataFile, "utf8") === dataBeforeLinks, "make:stat linked to an event that already has a handler, or changed the data");
	check(statAt("make:stat", "rank3", "--link", "nothing").status === 1 && !readFileSync(dataFile, "utf8").includes("rank3"), "make:stat linked to an unknown event and still wrote");
	const fromStat = statAt("make:stat", "rank", "--link", "castSpell");
	check(fromStat.status === 0 && existsSync(join(servicesDir, "CastSpellHandler.ts")), `make:stat --link did not create the handler\n${fromStat.stderr}`);
	const vault = statAt("make:service", "vault", "--uses", "kills,coins");
	const vaultSource = existsSync(join(servicesDir, "VaultService.ts")) ? readFileSync(join(servicesDir, "VaultService.ts"), "utf8") : "";
	check(vault.status === 0 && vaultSource.includes("KillsService") && vaultSource.includes("PlayerDataService"), `make:service --uses did not inject the values\n${vault.stderr}`);
	check(statAt("make:service", "attic", "--uses", "nope").status === 1 && !existsSync(join(servicesDir, "AtticService.ts")), "make:service --uses an unknown value still wrote the service");

	// The linter: no questions, so it runs without a terminal; scripts are added, never overwritten.
	const lintProject = join(workspace, "LintGame");
	spawnSync(process.execPath, [cli, "init", "LintGame", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const lintManifestPath = join(lintProject, "package.json");
	const lintManifest = JSON.parse(readFileSync(lintManifestPath, "utf8"));
	lintManifest.scripts["lint:fix"] = "my own fixer";
	writeFileSync(lintManifestPath, JSON.stringify(lintManifest, undefined, 2));
	const lintRun = spawnSync(process.execPath, [cli, "add:lint", "--no-install"], { cwd: lintProject, encoding: "utf8" });
	check(lintRun.status === 0, `add:lint failed without a terminal\n${lintRun.stderr}`);
	check(existsSync(join(lintProject, "eslint.config.mjs")) && readFileSync(join(lintProject, "eslint.config.mjs"), "utf8").includes("roblox.configs.recommended"), "add:lint did not write the ESLint config");
	const lintScripts = JSON.parse(readFileSync(lintManifestPath, "utf8")).scripts;
	check(lintScripts.lint === "eslint src", "add:lint did not add the lint script");
	check(lintScripts["lint:fix"] === "my own fixer", "add:lint overwrote a script the user already had");
	check(JSON.parse(readFileSync(join(lintProject, "rowork.json"), "utf8")).modules?.includes("lint"), "the linter is not recorded in rowork.json");
	const lintInfo = JSON.parse(spawnSync(process.execPath, [cli, "info", "--json"], { cwd: lintProject, encoding: "utf8" }).stdout);
	check(lintInfo.commands.find((c) => c.name === "add:lint")?.guided === false, "add:lint should not be marked guided: it asks nothing");

	// The linter is part of every new project that installs npm packages; --no-install and --no-lint skip it.
	for (const [label, flags, expectLint] of [["LintDefault", ["--no-install"], false], ["LintOff", ["--no-lint", "--no-install"], false]]) {
		const made = spawnSync(process.execPath, [cli, "init", label, "--path", workspace, "--no-rokit", "--no-git", ...flags], { encoding: "utf8" });
		check(made.status === 0, `init ${flags.join(" ")} failed\n${made.stderr}`);
		check(existsSync(join(workspace, label, "eslint.config.mjs")) === expectLint, `${label}: the linter should ${expectLint ? "" : "not "}be there`);
	}
	check(/rowork add lint/.test(spawnSync(process.execPath, [cli, "init", "LintHint", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" }).stderr), "init --no-install did not say the linter is left for later");

	// The formatter: no questions, scripts added without overwriting, and it is skipped like the linter.
	const fmtProject = join(workspace, "FormatGame");
	spawnSync(process.execPath, [cli, "init", "FormatGame", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const fmtRun = spawnSync(process.execPath, [cli, "add:format", "--no-install"], { cwd: fmtProject, encoding: "utf8" });
	check(fmtRun.status === 0, `add:format failed without a terminal\n${fmtRun.stderr}`);
	const prettierConfig = existsSync(join(fmtProject, ".prettierrc.json")) ? JSON.parse(readFileSync(join(fmtProject, ".prettierrc.json"), "utf8")) : {};
	check(prettierConfig.useTabs === true && prettierConfig.printWidth === 100, "add:format did not write the Prettier settings that match generated code");
	check(readFileSync(join(fmtProject, ".prettierignore"), "utf8").includes("out"), "add:format does not ignore the build output");
	const fmtScripts = JSON.parse(readFileSync(join(fmtProject, "package.json"), "utf8")).scripts;
	check(fmtScripts.format === "prettier --write src" && fmtScripts["format:check"] === "prettier --check src", "add:format did not add the format scripts");
	check(!existsSync(join(workspace, "LintOff", ".prettierrc.json")), "--no-install should not include the formatter");

	// Anti-spam: every event the client sends is rate limited per player, and new ones join the list.
	const serverNetwork = join(bareProject, "src", "server", "network.ts");
	const limiterFile = join(bareProject, "src", "server", "rateLimit.ts");
	check(existsSync(limiterFile) && readFileSync(limiterFile, "utf8").includes("export function limit"), "networking did not generate the rate limiter");
	const networkSource = readFileSync(serverNetwork, "utf8");
	check(/buyItem: \[limit\(\)\]/.test(networkSource) && /castSpell: \[limit\(\)\]/.test(networkSource), "an event the client sends is not rate limited by default");
	check(!/itemBought: \[limit/.test(networkSource), "an event the SERVER sends was rate limited (only client events can be flooded)");
	check(statAt("make:event", "dash", "--to", "server").status === 0 && /dash: \[limit\(\)\]/.test(readFileSync(serverNetwork, "utf8")), "make:event did not rate limit a new client event");
	check(statAt("make:event", "toast", "--to", "client").status === 0 && !/toast: \[limit/.test(readFileSync(serverNetwork, "utf8")), "make:event rate limited an event the server sends");
	check(readFileSync(serverNetwork, "utf8").split("\n").every((line) => !/^\}/.test(line) || line === "});"), "the rate limit list lost the indentation of its closing brace");
	// If the user removed the list, the event is still added and the warning says it is unprotected.
	const withoutList = readFileSync(serverNetwork, "utf8").replace(/middleware: \{[\s\S]*?\n\t\},\n/, "");
	writeFileSync(serverNetwork, withoutList);
	const unprotectedRun = statAt("make:event", "sprint", "--to", "server");
	check(unprotectedRun.status === 0 && /NOT rate limited/.test(unprotectedRun.stderr.replace(/\x1b\[[0-9;]*m/g, "")), "make:event did not warn that an event is unprotected");
	check(readFileSync(networkFile, "utf8").includes("sprint(): void;") && readFileSync(serverNetwork, "utf8") === withoutList, "make:event failed or edited a network.ts without a rate limit list");

	// The UI module edits tsconfig.json as text: old Roact values are replaced, comments survive,
	// missing entries are inserted, and a value the user chose is never overwritten.
	const makeUiProject = (label, transform) => {
		const dir = join(workspace, label);
		spawnSync(process.execPath, [cli, "init", label, "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
		const tsconfigPath = join(dir, "tsconfig.json");
		writeFileSync(tsconfigPath, transform(readFileSync(tsconfigPath, "utf8")));
		return { dir, tsconfigPath, run: (...a) => spawnSync(process.execPath, [cli, ...a], { cwd: dir, encoding: "utf8" }) };
	};
	const oldRoact = makeUiProject("UiRoact", (source) => source.replace("React.createElement", "Roact.createElement").replace("React.Fragment", "Roact.Fragment").replace('"moduleDetection": "force",', '"moduleDetection": "force", // keep this comment'));
	const uiRun = oldRoact.run("add:ui", "--no-install", "--no-plugin");
	check(uiRun.status === 0, `add:ui failed\n${uiRun.stderr}`);
	const roactAfter = readFileSync(oldRoact.tsconfigPath, "utf8");
	check(roactAfter.includes('"jsxFactory": "React.createElement"') && roactAfter.includes('"jsxFragmentFactory": "React.Fragment"'), "add:ui did not replace the old Roact JSX settings");
	check(roactAfter.includes("// keep this comment"), "add:ui destroyed a comment in tsconfig.json");
	for (const file of ["App.tsx", "Button.tsx", "Button.story.tsx"]) check(existsSync(join(oldRoact.dir, "src", "client", "ui", file)), `add:ui did not create ${file}`);
	const controller = join(oldRoact.dir, "src", "client", "controllers", "UiController.tsx");
	check(existsSync(controller) && readFileSync(controller, "utf8").includes('from "../ui/App"'), "add:ui did not create UiController importing App");
	check(["Button.tsx", "App.tsx", "Button.story.tsx"].every((f) => !/\{\{\s*\w+\s*\}\}/.test(readFileSync(join(oldRoact.dir, "src", "client", "ui", f), "utf8"))), "a UI template kept an unrendered placeholder");
	const uiInfo = JSON.parse(oldRoact.run("info", "--json").stdout);
	check(uiInfo.commands.find((c) => c.name === "add:ui")?.guided === false, "add:ui asks nothing and must not be marked guided");

	const insertion = makeUiProject("UiInsert", (source) => source.replace(/^\s*"jsx[^\n]*\n/gm, ""));
	check(!/jsx/.test(readFileSync(insertion.tsconfigPath, "utf8")), "test setup: the jsx entries should be missing");
	check(insertion.run("add:ui", "--no-install", "--no-plugin").status === 0 && /"jsxFactory": "React.createElement"/.test(readFileSync(insertion.tsconfigPath, "utf8")), "add:ui did not insert the missing JSX settings");

	const conflict = makeUiProject("UiConflict", (source) => source.replace("React.createElement", "h"));
	const conflictBefore = readFileSync(conflict.tsconfigPath, "utf8");
	const conflictRun = conflict.run("add:ui", "--no-install", "--no-plugin");
	check(conflictRun.status === 1 && /jsxFactory/.test(conflictRun.stderr), "add:ui did not refuse a jsxFactory the user set");
	check(readFileSync(conflict.tsconfigPath, "utf8") === conflictBefore && !existsSync(join(conflict.dir, "src", "client", "ui")), "a refused add:ui still wrote something");

	// Without the module it points to the fix.
	const bareModules = join(workspace, "NoModules");
	spawnSync(process.execPath, [cli, "init", "NoModules", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const noStat = spawnSync(process.execPath, [cli, "make:stat", "kills"], { cwd: bareModules, encoding: "utf8" });
	check(noStat.status === 1, "make:stat ran in a project without player-data");

	// Integrations: two modules that work together are wired when the second arrives, in either order.
	const wireFiles = ["src/shared/data/dataEvents.ts", "src/server/services/DataReplicationService.ts", "src/client/controllers/PlayerDataController.ts"];
	const wired = {};
	for (const [label, order] of [["A", ["player-data", "networking"]], ["B", ["networking", "player-data"]]]) {
		const dir = join(workspace, `Wire${label}`);
		spawnSync(process.execPath, [cli, "init", `Wire${label}`, "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
		const at = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8" });
		const args = { "player-data": ["add:player-data", "--field", "coins:number=0", "--no-install"], networking: ["add:networking", "--event", "ping:server()", "--no-install"] };
		at(...args[order[0]]);
		check(!existsSync(join(dir, wireFiles[0])), `order ${label}: the integration was applied before both modules were installed`);
		check(at(...args[order[1]]).status === 0, `order ${label}: the second module failed`);
		wired[label] = wireFiles.map((file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : undefined));
		check(wired[label].every((source) => source !== undefined && !source.includes("{{")), `order ${label}: the integration files are missing or unrendered`);
		check(JSON.parse(readFileSync(join(dir, "rowork.json"), "utf8")).integrations?.includes("data-replication"), `order ${label}: the integration is not recorded`);
		check(/wired together already is/.test(at("wire").stderr), `order ${label}: wire is not idempotent`);
		check(/data-replication|Modules wired together/.test(readFileSync(join(dir, "AGENTS.md"), "utf8")), `order ${label}: AGENTS.md does not mention the wired modules`);
	}
	check(JSON.stringify(wired.A) === JSON.stringify(wired.B), "the two installation orders generated different files");

	// A file the user already has is never overwritten: the module still installs, the glue stays pending.
	const clashDir = join(workspace, "WireClash");
	spawnSync(process.execPath, [cli, "init", "WireClash", "--path", workspace, "--no-install", "--no-rokit", "--no-git"], { encoding: "utf8" });
	const clashAt = (...a) => spawnSync(process.execPath, [cli, ...a], { cwd: clashDir, encoding: "utf8" });
	clashAt("add:networking", "--event", "ping:server()", "--no-install");
	mkdirSync(join(clashDir, "src", "shared", "data"), { recursive: true });
	writeFileSync(join(clashDir, wireFiles[0]), "// mine\n");
	check(clashAt("add:player-data", "--field", "coins:number=0", "--no-install").status === 0, "a clashing integration file made the module install fail");
	check(readFileSync(join(clashDir, wireFiles[0]), "utf8") === "// mine\n", "an integration overwrote the user's file");
	check(!JSON.parse(readFileSync(join(clashDir, "rowork.json"), "utf8")).integrations?.includes("data-replication"), "a skipped integration was recorded as applied");
	check(clashAt("wire").status === 1, "wire did not report the integration it could not apply");

	// Guided versions need a terminal: without one they refuse and show the scripted form.
	for (const command of ["make", "make:stat", "make:event", "make:service", "make:controller", "make:component", "console"]) {
		const guided = makeRun(command);
		check(guided.status === 1, `\`rowork ${command}\` without a TTY exited with ${guided.status}`);
		check(/terminal/.test(guided.stderr), `\`rowork ${command}\` without a TTY did not explain why`);
	}
	const bareInit = spawnSync(process.execPath, [cli, "init"], { encoding: "utf8" });
	check(bareInit.status === 1, `\`rowork init\` without a name or a TTY exited with ${bareInit.status}`);

	// `rowork start` is interactive: without a terminal it must refuse and point to `init`.
	const wizard = spawnSync(process.execPath, [cli, "start"], { encoding: "utf8", stdio: "pipe" });
	check(wizard.status === 1, `\`rowork start\` without a TTY exited with ${wizard.status}`);
	check(wizard.stderr.includes("rowork init"), "`rowork start` without a TTY did not point to `rowork init`");

	// `rowork dev` must name the missing tools instead of dying on a bare ENOENT.
	// PATH is emptied and HOME is a throwaway, so the check is the same whether
	// or not the machine has Rojo, on PATH or under ~/.rokit.
	mkdirSync(join(bareProject, "node_modules"));
	const noTools = spawnSync(process.execPath, [cli, "dev"], {
		cwd: bareProject,
		encoding: "utf8",
		env: { ...process.env, PATH: dirname(process.execPath), HOME: workspace, USERPROFILE: workspace },
	});
	check(noTools.status === 1, `\`rowork dev\` without tools exited with ${noTools.status}`);
	check(/Missing tools?: .*rojo/.test(noTools.stderr), "`rowork dev` did not name the missing rojo");
} finally {
	rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error(`smoke test failed (${failures.length}):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log("smoke test passed");
