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
import { fileURLToPath } from "node:url";

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
		for (const name of ["InventoryService", "CameraController", "DoorComponent", "SpawnerComponent"]) {
			check(identifiers.includes(name), `Flamework did not register ${name}`);
		}
	} else {
		check(false, "no flamework.build was produced");
	}

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
