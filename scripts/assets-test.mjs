#!/usr/bin/env node
/**
 * Checks `rowork assets` against a FAKE Open Cloud server running on this computer.
 *
 * Nothing here talks to Roblox: the real service needs a real key and a real account.
 * What this proves is everything on Rowork's side: the lock file that stops a file from
 * being uploaded twice, the generated `Assets` module, moderation states, the refusal of
 * a key that git would commit, and above all that the key never appears in any output,
 * any file, or any address other than this computer.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repositoryRoot, "bin", "rowork.js");

process.env["ROWORK_ROJO_VERSION"] = "7.7.0";

const KEY = "test-key-SECRET-9f3a1c";
const failures = [];
const check = (condition, message) => {
	if (!condition) failures.push(message);
};

// ---- the fake service -------------------------------------------------------------

const requests = [];
const operations = new Map();
/** Set by a scenario to change what the fake answers. */
const behaviour = { moderation: "MODERATION_STATE_APPROVED", pendingReads: 1 };
let nextAsset = 1000;

const server = createServer((request, response) => {
	const chunks = [];
	request.on("data", (chunk) => chunks.push(chunk));
	request.on("end", () => {
		const body = Buffer.concat(chunks);
		requests.push({ method: request.method, url: request.url, key: request.headers["x-api-key"], body });
		const send = (status, json) => {
			response.writeHead(status, { "content-type": "application/json" });
			response.end(JSON.stringify(json));
		};

		if (request.headers["x-api-key"] !== KEY) return send(401, { message: "invalid key" });

		if (request.method === "POST" && request.url === "/assets/v1/assets") {
			const text = body.toString("latin1");
			const meta = /name="request"\r\n\r\n([^\r]*)/.exec(text);
			const id = `op${operations.size + 1}`;
			operations.set(id, { reads: 0, assetId: String(nextAsset++), request: meta === null ? null : JSON.parse(meta[1]) });
			return send(200, { path: `operations/${id}` });
		}

		const read = /^\/assets\/v1\/operations\/(.+)$/.exec(request.url ?? "");
		if (request.method === "GET" && read !== null) {
			const operation = operations.get(read[1]);
			if (operation === undefined) return send(404, { message: "no such operation" });
			operation.reads += 1;
			if (operation.reads <= behaviour.pendingReads) return send(200, { path: `operations/${read[1]}`, done: false });
			return send(200, {
				path: `operations/${read[1]}`,
				done: true,
				response: { assetId: operation.assetId, moderationResult: { moderationState: behaviour.moderation } },
			});
		}
		send(404, { message: "not found" });
	});
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const fakeUrl = `http://127.0.0.1:${server.address().port}`;

// ---- helpers ----------------------------------------------------------------------

function run(cwd, args, env = {}) {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [cli, ...args], {
			cwd,
			env: { ...process.env, ROWORK_OPEN_CLOUD_URL: fakeUrl, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		child.stdout.on("data", (chunk) => (output += chunk));
		child.stderr.on("data", (chunk) => (output += chunk));
		child.on("close", (status) => resolve({ status, output }));
	});
}

// A few bytes are enough: the fake service never decodes an image.
const png = (seed) => Buffer.from([0x89, 0x50, 0x4e, 0x47, seed]);

const workspace = mkdtempSync(join(tmpdir(), "rowork-assets-"));

try {
	const created = spawnSync(
		process.execPath,
		[cli, "init", "AssetGame", "--path", workspace, "--no-install", "--no-lint", "--no-format"],
		{ encoding: "utf8" },
	);
	check(created.status === 0, `init failed\n${created.stderr}`);
	const project = join(workspace, "AssetGame");

	const assets = join(project, "assets");
	mkdirSync(join(assets, "icons"), { recursive: true });
	writeFileSync(join(assets, "icons", "sword.png"), png(1));
	writeFileSync(join(assets, "logo.png"), png(2));
	writeFileSync(join(assets, "notes.txt"), "not an asset");

	const lockPath = join(project, "assets.lock.json");
	const modulePath = join(project, "src", "shared", "assets.ts");
	const configPath = join(project, "rowork.json");

	// 1. No key: refuses, explains how to get one, sends nothing.
	let before = requests.length;
	let result = await run(project, ["assets", "--creator", "user:42", "--yes"], { ROWORK_ROBLOX_API_KEY: "" });
	check(result.status === 1, `no key: expected exit 1, got ${result.status}`);
	check(/API key/i.test(result.output) && /assets:setup/.test(result.output), "no key: the message does not point to `rowork assets:setup`");
	check(requests.length === before, "no key: something was sent anyway");
	check(!existsSync(lockPath), "no key: a lock file was written");

	// 2. Dry run: shows the plan, sends nothing, writes nothing.
	result = await run(project, ["assets", "--dry-run"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(result.status === 0, `dry run: exit ${result.status}\n${result.output}`);
	check(/sword\.png/.test(result.output) && /notes\.txt/.test(result.output), "dry run: the plan or the skipped file is not shown");
	check(requests.length === before, "dry run: something was sent");
	check(!existsSync(lockPath) && !existsSync(modulePath), "dry run: files were written");

	// 3. Outside a terminal, without --yes: refuses to upload.
	result = await run(project, ["assets", "--creator", "user:42"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(result.status === 1 && /--yes/.test(result.output), "no --yes: it should refuse and name the flag");
	check(requests.length === before, "no --yes: something was sent");

	// 4. Real upload.
	result = await run(project, ["assets", "--creator", "user:42", "--yes"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(result.status === 0, `upload: exit ${result.status}\n${result.output}`);
	check(!result.output.includes(KEY), "upload: the API key was printed");
	const posts = requests.filter((r) => r.method === "POST");
	check(posts.length === 2, `upload: expected 2 uploads, got ${posts.length}`);
	check([...operations.values()].every((o) => o.request?.creationContext?.creator?.userId === "42"), "upload: the creator was not sent as userId");
	check([...operations.values()].every((o) => o.request?.assetType === "Decal"), "upload: a png was not sent as a Decal");
	check(existsSync(lockPath), "upload: no lock file");
	check(existsSync(modulePath), "upload: no shared/assets.ts");
	if (existsSync(modulePath)) {
		const source = readFileSync(modulePath, "utf8");
		check(/icons: \{/.test(source) && /sword: "rbxassetid:\/\/\d+"/.test(source) && /logo: "rbxassetid:\/\/\d+"/.test(source), `upload: unexpected assets.ts\n${source}`);
		check(!source.includes("notes"), "upload: an unsupported file reached assets.ts");
		check(!source.includes(KEY), "upload: the key is in assets.ts");
	}
	check(!readFileSync(lockPath, "utf8").includes(KEY), "upload: the key is in the lock file");
	check(JSON.parse(readFileSync(configPath, "utf8")).assets?.creator?.id === "42", "upload: the creator was not remembered in rowork.json");
	check(!readFileSync(configPath, "utf8").includes(KEY), "upload: the key is in rowork.json");

	// 5. Running again: nothing changed, nothing sent, the creator is no longer needed.
	before = requests.length;
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(result.status === 0, `rerun: exit ${result.status}\n${result.output}`);
	check(requests.length === before, "rerun: an unchanged file was sent again");

	// 6. Changing one file uploads only that one.
	writeFileSync(join(assets, "logo.png"), png(3));
	before = requests.length;
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(requests.filter((r, i) => i >= before && r.method === "POST").length === 1, "changed file: expected exactly one upload");

	// 7. Moderation: a refused asset must not reach the code.
	behaviour.moderation = "MODERATION_STATE_REJECTED";
	writeFileSync(join(assets, "bad.png"), png(4));
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(!readFileSync(modulePath, "utf8").includes("bad:"), "moderation: a rejected asset was added to assets.ts");
	check(/REJECTED|waiting|refused/i.test(result.output), "moderation: the rejection was not reported");
	behaviour.moderation = "MODERATION_STATE_APPROVED";

	// 8. A file removed from the folder disappears from the generated module.
	rmSync(join(assets, "bad.png"));
	rmSync(join(assets, "logo.png"));
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(!/logo:/.test(readFileSync(modulePath, "utf8")), "removed file: still listed in assets.ts");

	// 9. A wrong key: fails with a clear message and never echoes either key.
	writeFileSync(join(assets, "new.png"), png(9));
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: "wrong-key-VISIBLE?" });
	check(result.status === 1 && /refused the API key/.test(result.output), "wrong key: no clear refusal");
	check(!result.output.includes("wrong-key-VISIBLE?"), "wrong key: the key was printed");

	// 10. The key in `.env` is refused when git would commit it, and accepted when ignored.
	rmSync(join(assets, "new.png"));
	writeFileSync(join(assets, "env.png"), png(7));
	writeFileSync(join(project, ".env"), `ROWORK_ROBLOX_API_KEY=${KEY}\n`);
	const ignore = readFileSync(join(project, ".gitignore"), "utf8");
	const withoutEnv = ignore.split(/\r?\n/).filter((line) => line.trim() !== ".env").join("\n");
	writeFileSync(join(project, ".gitignore"), withoutEnv);
	before = requests.length;
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: "" });
	check(result.status === 1 && /gitignore/i.test(result.output), `.env not ignored: expected a refusal\n${result.output}`);
	check(requests.length === before, ".env not ignored: the key was used anyway");
	check(!result.output.includes(KEY), ".env not ignored: the key was printed");
	writeFileSync(join(project, ".gitignore"), `${withoutEnv}\n.env\n`);
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: "" });
	check(result.status === 0, `.env ignored: exit ${result.status}\n${result.output}`);

	// 11. The service address can only be this computer: the key must never travel elsewhere.
	writeFileSync(join(assets, "far.png"), png(8));
	result = await run(project, ["assets", "--yes"], { ROWORK_ROBLOX_API_KEY: KEY, ROWORK_OPEN_CLOUD_URL: "https://evil.example.com" });
	check(result.status === 1 && /this computer/.test(result.output), "foreign address: not refused");

	// 12. `assets:setup --check` asks the service, never prints the key, and needs no terminal.
	before = requests.length;
	result = await run(project, ["assets:setup", "--check"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(result.status === 0 && /accepted/.test(result.output), `setup --check: a good key was not accepted\n${result.output}`);
	check(!result.output.includes(KEY), "setup --check: the key was printed");
	check(requests.length === before + 1 && requests.at(-1).method === "GET", "setup --check: it should make exactly one read, and create nothing");
	result = await run(project, ["assets:setup", "--check"], { ROWORK_ROBLOX_API_KEY: "some-other-key-0123456789" });
	check(result.status === 1 && /refused/.test(result.output), "setup --check: a bad key was not refused");
	check(!result.output.includes("some-other-key-0123456789"), "setup --check: a bad key was printed");
	result = await run(project, ["assets:setup"], { ROWORK_ROBLOX_API_KEY: KEY });
	check(result.status === 1 && /terminal/.test(result.output) && /--check/.test(result.output), "setup without a terminal: it should refuse and give the scripted form");

	// 13. Storing the key: git must ignore `.env` before the key is written, other lines survive.
	{
		const { saveApiKey, looksLikeApiKey } = await import(pathToFileURL(join(repositoryRoot, "dist", "core", "assets.js")).href);
		const folder = mkdtempSync(join(workspace, "keys-"));
		writeFileSync(join(folder, ".env"), "OTHER=1\n\n");
		saveApiKey(folder, KEY);
		check(/^\.env$/m.test(readFileSync(join(folder, ".gitignore"), "utf8")), "saveApiKey: .env was not added to .gitignore");
		check(readFileSync(join(folder, ".env"), "utf8") === `OTHER=1\nROWORK_ROBLOX_API_KEY=${KEY}\n`, "saveApiKey: the other lines were not kept, or the key was misplaced");
		saveApiKey(folder, "replaced-key-0123456789");
		const text = readFileSync(join(folder, ".env"), "utf8");
		check(text.match(/ROWORK_ROBLOX_API_KEY/g)?.length === 1 && text.includes("replaced-key-0123456789") && !text.includes(KEY), "saveApiKey: a second key should replace the first");
		if (process.platform !== "win32") check((statSync(join(folder, ".env")).mode & 0o077) === 0, "saveApiKey: .env is readable by other users");
		check(!looksLikeApiKey("has space 0123456789abc") && !looksLikeApiKey('"quoted-0123456789abcdef"') && !looksLikeApiKey("short") && looksLikeApiKey(KEY), "looksLikeApiKey: wrong verdict");
	}
} finally {
	server.close();
	rmSync(workspace, { recursive: true, force: true });
}

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed:`);
	for (const message of failures) console.error(` - ${message}`);
	process.exit(1);
}
console.log("assets test: all checks passed");
