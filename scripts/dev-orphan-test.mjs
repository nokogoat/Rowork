#!/usr/bin/env node
/**
 * Verifies that `rowork dev` leaves nothing running behind it.
 *
 * The failure this guards against is the reason the sprint existed: killing the
 * direct child leaves the real worker, a grandchild behind a wrapper shim,
 * alive and holding the output directory or the Rojo port. Nothing in a build
 * or a type-check would ever catch that.
 *
 * The scenario uses stand-in tools rather than the real toolchain, so the test
 * stays fast and hermetic:
 *   - a fake compiler that spawns a grandchild appending to a heartbeat file
 *   - a fake Rojo that exits non-zero shortly after starting
 *
 * The supervisor must notice the second one dying, tear the first one down
 * including its grandchild, and exit non-zero.
 */
import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repositoryRoot, "bin", "rowork.js");

const BACKSLASH = String.fromCharCode(92);

const failures = [];
const check = (condition, message) => {
	if (!condition) failures.push(message);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Windows paths need forward slashes inside the generated POSIX shim. */
const toPosix = (value) => value.split(BACKSLASH).join("/");

const workspace = mkdtempSync(join(tmpdir(), "rowork-orphan-"));
const project = join(workspace, "project");
const binaries = join(project, "node_modules", ".bin");
const heartbeat = join(workspace, "heartbeat.log");

mkdirSync(binaries, { recursive: true });

writeFileSync(
	join(project, "rowork.json"),
	JSON.stringify({
		name: "OrphanTest",
		roworkApiVersion: 1,
		language: "roblox-ts",
		paths: {
			source: "src",
			out: "out",
			rojoProject: "default.project.json",
			services: "src/server/services",
			controllers: "src/client/controllers",
			shared: "src/shared",
		},
		plugins: [],
	}),
);
writeFileSync(join(project, "default.project.json"), "{}");
// Already built: this test is about supervision, not the first-run build.
mkdirSync(join(project, "out"), { recursive: true });
mkdirSync(join(project, "include"), { recursive: true });
writeFileSync(heartbeat, "");

const grandchildScript = join(workspace, "grandchild.mjs");
const compileScript = join(workspace, "fake-compile.mjs");
const rojoScript = join(workspace, "fake-rojo.mjs");

// The grandchild: the process that must not survive.
writeFileSync(
	grandchildScript,
	[
		'import { appendFileSync } from "node:fs";',
		`const target = ${JSON.stringify(heartbeat)};`,
		"setInterval(() => {",
		'	try { appendFileSync(target, "tick" + String.fromCharCode(10)); } catch {}',
		"}, 100);",
	].join("\n"),
);

writeFileSync(
	compileScript,
	[
		'import { spawn } from "node:child_process";',
		'console.log("fake compiler starting");',
		`spawn(process.execPath, [${JSON.stringify(grandchildScript)}], { stdio: "ignore" });`,
		'console.log("watching for changes");',
		"setInterval(() => {}, 1000);",
	].join("\n"),
);

writeFileSync(
	rojoScript,
	[
		'console.log("fake rojo starting");',
		'console.error("fake rojo: port already in use");',
		"setTimeout(() => process.exit(3), 1200);",
	].join("\n"),
);

/** Writes both shims npm would create, so the same test runs on every platform. */
function installShim(name, script) {
	const shim = join(binaries, name);
	writeFileSync(
		shim,
		`#!/bin/sh\nexec "${toPosix(process.execPath)}" "${toPosix(script)}" "$@"\n`,
	);
	chmodSync(shim, 0o755);
	writeFileSync(
		join(binaries, `${name}.cmd`),
		`@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
	);
}

installShim("rbxtsc", compileScript);
installShim("rojo", rojoScript);

let output = "";
let exitCode = null;

try {
	const child = spawn(process.execPath, [cli, "dev", "--no-sourcemap"], {
		cwd: project,
		stdio: ["ignore", "pipe", "pipe"],
	});

	child.stdout.on("data", (chunk) => (output += chunk.toString()));
	child.stderr.on("data", (chunk) => (output += chunk.toString()));

	const finished = new Promise((resolve) => child.on("close", resolve));
	const timeout = sleep(20000).then(() => "timeout");

	const result = await Promise.race([finished, timeout]);
	if (result === "timeout") {
		child.kill("SIGKILL");
		failures.push("`rowork dev` never exited after a task died");
	} else {
		exitCode = result;
	}

	check(exitCode !== 0, `expected a non-zero exit after a task failed, got ${exitCode}`);
	check(output.includes("compile"), "the compile task prefix never appeared in the unified log");
	check(output.includes("fake compiler starting"), "child stdout was not forwarded");
	check(output.includes("port already in use"), "child stderr was not forwarded");
	check(/stopped \(exit code 3\)/.test(output), "the failing task's exit code was not reported");

	// The grandchild must be gone. If the tree kill missed it, the heartbeat
	// file keeps growing after the CLI has exited.
	await sleep(800);
	const settled = statSync(heartbeat).size;
	await sleep(1500);
	const later = statSync(heartbeat).size;

	check(settled > 0, "the grandchild never started, the test would prove nothing");
	check(
		later === settled,
		`orphaned grandchild still running: heartbeat grew from ${settled} to ${later} bytes after exit`,
	);
} finally {
	// Cleanup must never mask the assertions. On Windows a surviving grandchild
	// holds a handle on the workspace, so rmSync throws EPERM: that failure is
	// itself the symptom, and swallowing it here lets the real message through.
	try {
		rmSync(workspace, { recursive: true, force: true });
	} catch (error) {
		failures.push(
			`could not clean up the workspace, a process is probably still holding it: ${error.code ?? error.message}`,
		);
	}
}

if (failures.length > 0) {
	console.error(`orphan test failed (${failures.length}):`);
	for (const failure of failures) console.error(`  - ${failure}`);
	console.error(`\n--- captured output ---\n${output}`);
	process.exit(1);
}

console.log("orphan test passed: no process survived `rowork dev`");
