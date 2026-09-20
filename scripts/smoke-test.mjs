#!/usr/bin/env node
/**
 * End-to-end check that `rowork init` still produces a usable project.
 *
 * Written in Node rather than shell so the exact same test runs on Linux,
 * macOS and Windows: the CI matrix is the only place where the Windows-specific
 * branches of exec.ts and bin/rowork.js are ever exercised.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
} finally {
	rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error(`smoke test failed (${failures.length}):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}

console.log("smoke test passed");
