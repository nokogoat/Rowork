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

	// make:tool writes config + component, plus shared infrastructure created once.
	check(makeRun("make:tool", "pickaxe").status === 0, "make:tool failed");
	for (const file of [
		join("src", "shared", "tools", "ToolDefinition.ts"),
		join("src", "shared", "tools", "PickaxeTool.ts"),
		join("src", "server", "components", "PickaxeToolComponent.ts"),
		join("src", "server", "services", "ToolService.ts"),
	]) {
		check(existsSync(join(bareProject, file)), `make:tool did not create ${file}`);
	}
	const serviceFile = join(bareProject, "src", "server", "services", "ToolService.ts");
	writeFileSync(serviceFile, "// edited by the user\n" + readFileSync(serviceFile, "utf8"));
	check(makeRun("make:tool", "PickaxeTool").status === 1, "make:tool overwrote an existing tool");
	check(makeRun("make:tool", "Shovel", "--cooldown", "2", "--droppable", "--no-give-on-spawn").status === 0, "a second make:tool failed");
	const shovel = readFileSync(join(bareProject, "src", "shared", "tools", "ShovelTool.ts"), "utf8");
	check(shovel.includes("cooldown: 2,") && shovel.includes("canBeDropped: true") && shovel.includes("giveOnSpawn: false"), "make:tool ignored its settings flags");
	const registry = readFileSync(join(bareProject, "src", "shared", "tools", "index.ts"), "utf8");
	check(registry.includes("PickaxeTool") && registry.includes("ShovelTool"), "the tool registry does not list every tool");
	check(makeRun("make:tool", "Bad", "--cooldown", "soon").status === 1, "an invalid --cooldown was accepted");
	check(
		readFileSync(serviceFile, "utf8").startsWith("// edited by the user"),
		"a second make:tool overwrote the shared ToolService",
	);

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

	// Guided versions need a terminal: without one they refuse and show the scripted form.
	for (const command of ["make", "make:tool", "make:service", "make:controller", "make:component", "console"]) {
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
