#!/usr/bin/env node
/**
 * Scaffolds a project for real, installs its dependencies, and compiles it.
 *
 * This is the test that was missing. The smoke test runs with --no-install, so
 * it proves that files are written but never that the result compiles. A
 * generated `tsconfig.json` listing only `node_modules/@rbxts` under typeRoots
 * passed every check in the suite and still produced a project where the very
 * first import of `@flamework/core` failed.
 *
 * It needs the network and takes a minute, so CI runs it as a single job
 * rather than across the whole matrix.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import spawn from "cross-spawn";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repositoryRoot, "bin", "rowork.js");

const failures = [];
const check = (condition, message) => {
	if (!condition) failures.push(message);
};

function run(command, args, cwd, env = process.env) {
	const result = spawn.sync(command, args, { cwd, encoding: "utf8", env });
	return {
		status: result.status,
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

const workspace = mkdtempSync(join(tmpdir(), "rowork-integration-"));
const project = join(workspace, "IntegrationGame");
// A throwaway home: `rokit self-install` edits shell profiles and creates ~/.rokit,
// which must never touch the machine running the test.
const home = join(workspace, "home");
mkdirSync(home);
const isolated = { ...process.env, HOME: home, USERPROFILE: home };

try {
	console.log("scaffolding and installing, this takes a minute...");

	const init = run(
		process.execPath,
		[cli, "init", "IntegrationGame", "--path", workspace, "--install-rokit", "--no-git"],
		workspace,
		isolated,
	);
	check(init.status === 0, `\`rowork init\` exited with ${init.status}\n${init.output}`);

	if (init.status !== 0) throw new Error("init failed, nothing further can be checked");

	check(existsSync(join(project, "node_modules")), "dependencies were not installed");

	// Rokit itself must have been downloaded and must have installed Rojo.
	const shims = join(home, ".rokit", "bin");
	const exe = process.platform === "win32" ? ".exe" : "";
	check(existsSync(join(shims, `rokit${exe}`)), "Rokit was not installed");
	check(existsSync(join(shims, `rojo${exe}`)), "Rojo was not installed by Rokit");

	// roblox-ts patches one exact TypeScript version. Any other version makes
	// Flamework warn on every compile, and can break the transformer outright.
	const robloxTs = JSON.parse(
		readFileSync(join(project, "node_modules", "roblox-ts", "package.json"), "utf8"),
	);
	const installed = JSON.parse(
		readFileSync(join(project, "node_modules", "typescript", "package.json"), "utf8"),
	).version;
	const expected = (robloxTs.dependencies?.typescript ?? "").replace(/^=/, "");

	check(
		installed === expected,
		`typescript ${installed} is installed but roblox-ts pins ${expected}`,
	);

	// The generators must produce code that really compiles, and Flamework must
	// see the generated classes.
	for (const args of [
		["make:service", "Inventory"],
		["make:controller", "Camera"],
		["make:component", "Door", "--side", "client", "--tag", "Openable"],
		["make:component", "Spawner"],
	]) {
		const made = run(process.execPath, [cli, ...args], project);
		check(made.status === 0, `\`rowork ${args.join(" ")}\` failed\n${made.output}`);
	}

	// The Rojo plugin download and placement, against the real GitHub release,
	// in a fake Wine prefix (the real one only exists after Studio's first launch).
	const studio = await import(pathToFileURL(join(repositoryRoot, "dist", "core", "studio.js")).href);
	const { logger } = await import(pathToFileURL(join(repositoryRoot, "dist", "ui", "logger.js")).href);
	const fakeData = join(workspace, "vinegar-data");
	const robloxData = join(fakeData, "prefixes", "studio", "drive_c", "users", "tester", "AppData", "Local", "Roblox");
	mkdirSync(robloxData, { recursive: true });
	mkdirSync(join(fakeData, "prefixes", "studio", "drive_c", "users", "Public"), { recursive: true });

	const found = studio.findStudioDataDirectories(fakeData);
	check(found.length === 1 && found[0] === robloxData, `Studio data directories: ${JSON.stringify(found)}`);
	// The Creator Store copy of Rojo is found (and its absence too), so the two-plugins warning can fire.
	check(studio.findStoreRojoPlugin(fakeData) === undefined, "a store plugin was reported where there is none");
	mkdirSync(join(robloxData, "12345", "InstalledPlugins", "13916111004"), { recursive: true });
	check(studio.findStoreRojoPlugin(fakeData)?.endsWith(join("InstalledPlugins", "13916111004")), "the Creator Store Rojo plugin was not detected");
	await studio.installRojoPlugin(found, project, logger);
	// The UI Labs preview plugin: from its GitHub release, checked against the published SHA-256.
	await studio.installReleasePlugin(found, studio.UI_LABS, logger);
	const uiLabsPlugin = join(robloxData, "Plugins", "UILabs.rbxm");
	check(existsSync(uiLabsPlugin) && readFileSync(uiLabsPlugin).subarray(0, 8).toString() === "<roblox!", "the UI Labs plugin was not placed as a Roblox model file");
	const plugin = join(robloxData, "Plugins", "Rojo.rbxm");
	check(existsSync(plugin), "the Rojo plugin was not written");
	check(existsSync(plugin) && readFileSync(plugin).subarray(0, 8).toString() === "<roblox!", "Rojo.rbxm is not a Roblox model file");

	// A module, with the real npm install of its dependencies (Lapis).
	const added = run(process.execPath, [cli, "add:player-data", "--field", "coins:number=0", "--field", "level:number=1"], project);
	check(added.status === 0, `\`rowork add:player-data\` failed\n${added.output}`);
	check(existsSync(join(project, "node_modules", "@rbxts", "lapis")), "the module's dependencies were not installed");
	const ui = run(process.execPath, [cli, "add:ui"], project, isolated);
	check(ui.status === 0, `\`rowork add:ui\` failed\n${ui.output}`);
	check(existsSync(join(project, "node_modules", "@rbxts", "react-roblox")), "the React packages were not installed");
	const net = run(process.execPath, [cli, "add:networking", "--event", "buyItem:server(itemId: string)", "--event", "bought:client(itemId: string)"], project);
	check(net.status === 0, `\`rowork add:networking\` failed\n${net.output}`);
	check(existsSync(join(project, "node_modules", "@flamework", "networking")), "@flamework/networking was not installed");
	const stats = run(process.execPath, [cli, "add:leaderstats", "--stat", "coins", "--stat", "level"], project);
	check(stats.status === 0, `\`rowork add:leaderstats\` failed\n${stats.output}`);
	for (const args of [
		["make:stat", "kills", "--type", "number", "--default", "0"],
		["make:stat", "nickname", "--type", "string", "--default", "Guest"],
		["make:event", "cast spell", "--to", "server", "--args", "spellId: string"],
		["make:event", "spellCast", "--to", "client", "--args", "spellId: string, caster: number"],
		["make:event", "openChest", "--to", "server", "--link", "kills"],
		["make:service", "vault", "--uses", "kills,coins"],
	]) {
		const made = run(process.execPath, [cli, ...args], project);
		check(made.status === 0, `\`rowork ${args.join(" ")}\` failed\n${made.output}`);
	}

	// The linter comes with every new project: nobody has to go and add it.
	check(existsSync(join(project, "eslint.config.mjs")), "a new project does not include the linter");
	check(JSON.parse(readFileSync(join(project, "rowork.json"), "utf8")).modules?.includes("lint"), "the linter is not recorded in rowork.json");
	check(existsSync(join(project, ".prettierrc.json")) && JSON.parse(readFileSync(join(project, "rowork.json"), "utf8")).modules?.includes("format"), "a new project does not include the formatter");

	console.log("compiling...");
	const compile = run(process.execPath, [join(project, "node_modules", "roblox-ts", "out", "CLI", "cli.js")], project);

	// Fall back to the shim if roblox-ts moves its entry point.
	const build = compile.status === null ? run("npm", ["run", "build"], project) : compile;

	check(build.status === 0, `compilation failed with status ${build.status}\n${build.output}`);
	check(!/error TS/.test(build.output), `the generated project does not compile:\n${build.output}`);
	check(
		!/TypeScript version differs/.test(build.output),
		`Flamework reports a TypeScript version mismatch:\n${build.output}`,
	);

	const buildFile = join(project, "flamework.build");
	if (existsSync(buildFile)) {
		const identifiers = readFileSync(buildFile, "utf8");
		for (const name of ["InventoryService", "CameraController", "DoorComponent", "SpawnerComponent", "PlayerDataService", "LeaderstatsService", "DataReplicationService", "PlayerDataController", "KillsService", "OpenChestHandler", "VaultService", "UiController"]) {
			check(identifiers.includes(name), `Flamework did not register ${name}`);
		}
	} else {
		check(false, "no flamework.build was produced");
	}

	const formatted = run("npm", ["run", "format:check"], project);
	check(formatted.status === 0, `the code Rowork generated is not formatted the way Rowork formats it:\n${formatted.output}`);
	const linted = run("npm", ["run", "lint"], project);
	check(linted.status === 0 && !/error/.test(linted.output.replace(/^npm .*$/gm, "")), `the code Rowork generated does not pass its own linter:\n${linted.output}`);

	// Leaving Rowork must leave a project that still builds with the plain tools.
	const eject = run(process.execPath, [cli, "eject", "--yes"], project);
	check(eject.status === 0, `\`rowork eject\` failed\n${eject.output}`);
	check(!existsSync(join(project, "rowork.json")), "eject left rowork.json behind");
	check(existsSync(join(project, "node_modules", "concurrently")), "eject did not install concurrently");
	const rebuilt = run("npm", ["run", "build"], project);
	check(rebuilt.status === 0 && !/error TS/.test(rebuilt.output), `the ejected project does not build with plain tools:\n${rebuilt.output}`);

	check(existsSync(join(project, "out", "shared", "networking.luau")), "the networking module did not compile to Luau");

	const outDirectory = join(project, "out");
	check(existsSync(outDirectory), "no out/ directory was produced");

	if (existsSync(outDirectory)) {
		const emitted = readdirSync(outDirectory, { recursive: true }).filter((entry) =>
			String(entry).endsWith(".luau"),
		);
		check(emitted.length > 0, "the compiler produced no .luau files");
	}
} finally {
	try {
		rmSync(workspace, { recursive: true, force: true });
	} catch (error) {
		console.error(`could not clean up ${workspace}: ${error.code ?? error.message}`);
	}
}

if (failures.length > 0) {
	console.error(`integration test failed (${failures.length}):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log("integration test passed: the generated project installs and compiles");
