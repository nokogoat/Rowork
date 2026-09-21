import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

import { RoworkError } from "../cli/errors.js";
import { toFieldName } from "../modules/player-data.js";
import type { AssetType } from "./open-cloud.js";

export const LOCK_FILE = "assets.lock.json";
export const KEY_NAME = "ROWORK_ROBLOX_API_KEY";
export const DEFAULT_FOLDER = "assets";

/** What each file extension is uploaded as, from Roblox's list of supported formats. */
const KINDS: Record<string, { type: AssetType; contentType: string }> = {
	".png": { type: "Decal", contentType: "image/png" },
	".jpg": { type: "Decal", contentType: "image/jpeg" },
	".jpeg": { type: "Decal", contentType: "image/jpeg" },
	".bmp": { type: "Decal", contentType: "image/bmp" },
	".tga": { type: "Decal", contentType: "image/x-tga" },
	".mp3": { type: "Audio", contentType: "audio/mpeg" },
	".ogg": { type: "Audio", contentType: "audio/ogg" },
	".wav": { type: "Audio", contentType: "audio/wav" },
	".flac": { type: "Audio", contentType: "audio/flac" },
	".fbx": { type: "Model", contentType: "model/fbx" },
	".gltf": { type: "Model", contentType: "model/gltf+json" },
	".glb": { type: "Model", contentType: "model/gltf-binary" },
	".rbxm": { type: "Model", contentType: "model/x-rbxm" },
	".rbxmx": { type: "Model", contentType: "model/x-rbxmx" },
};

/** Roblox's documented ceiling for a model upload. */
export const MAX_MODEL_BYTES = 20 * 1024 * 1024;

export interface AssetFile {
	/** Path inside the assets folder, with `/` on every system. */
	relative: string;
	absolute: string;
	type: AssetType;
	contentType: string;
	sha256: string;
	size: number;
}

export interface SkippedFile {
	relative: string;
	reason: string;
}

export interface LockEntry {
	sha256: string;
	type: AssetType;
	assetId?: string;
	/** An upload that had not finished: followed again on the next run. */
	operation?: string;
	moderation?: string;
	uploadedAt?: string;
}

export interface Lock {
	version: 1;
	assets: Record<string, LockEntry>;
}

/** Walks the assets folder. Hidden files are ignored, unsupported ones are reported. */
export function scanAssets(projectRoot: string, folder: string): { files: AssetFile[]; skipped: SkippedFile[] } {
	const base = join(projectRoot, folder);
	const files: AssetFile[] = [];
	const skipped: SkippedFile[] = [];

	const walk = (directory: string, prefix: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name.startsWith(".")) continue;
			const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
			const absolute = join(directory, entry.name);

			if (entry.isDirectory()) {
				walk(absolute, relative);
				continue;
			}
			const kind = KINDS[extname(entry.name).toLowerCase()];
			if (kind === undefined) {
				skipped.push({ relative, reason: `${extname(entry.name) || "no extension"} is not a format Rowork uploads yet` });
				continue;
			}
			const content = readFileSync(absolute);
			files.push({
				relative,
				absolute,
				type: kind.type,
				contentType: kind.contentType,
				sha256: createHash("sha256").update(content).digest("hex"),
				size: content.length,
			});
		}
	};

	if (existsSync(base)) walk(base, "");
	return { files, skipped };
}

export function readLock(projectRoot: string): Lock {
	try {
		const parsed = JSON.parse(readFileSync(join(projectRoot, LOCK_FILE), "utf8")) as Partial<Lock>;
		return { version: 1, assets: parsed.assets ?? {} };
	} catch {
		return { version: 1, assets: {} };
	}
}

/** Sorted keys, so the file only changes when an asset does and diffs stay readable. */
export function writeLock(projectRoot: string, lock: Lock): void {
	const assets = Object.fromEntries(Object.entries(lock.assets).sort(([a], [b]) => a.localeCompare(b)));
	writeFileSync(join(projectRoot, LOCK_FILE), `${JSON.stringify({ version: 1, assets }, undefined, 2)}\n`, "utf8");
}

export type Action = "upload" | "resume" | "unchanged";

export interface PlannedAsset {
	file: AssetFile;
	action: Action;
}

/**
 * What a run has to do. A file is uploaded again only when its content changed: the
 * hash in the lock file is what makes `rowork assets` safe to run as often as you like.
 * (An image cannot be updated in place, so a changed image becomes a new asset.)
 */
export function planAssets(files: AssetFile[], lock: Lock): PlannedAsset[] {
	return files.map((file) => {
		const known = lock.assets[file.relative];
		if (known === undefined || known.sha256 !== file.sha256) return { file, action: "upload" };
		if (known.assetId === undefined && known.operation !== undefined) return { file, action: "resume" };
		return { file, action: known.assetId === undefined ? "upload" : "unchanged" };
	});
}

/** A moderation state that lets the asset be used. Unknown states are not assumed safe. */
function usable(entry: LockEntry): boolean {
	return entry.assetId !== undefined && (entry.moderation === undefined || /APPROVED/.test(entry.moderation));
}

interface Tree {
	[key: string]: Tree | string;
}

function keyFor(segment: string): string {
	return toFieldName(segment.replace(/\.[^.]+$/, "")) || segment;
}

/**
 * The TypeScript file that lets the code name an asset instead of a number.
 *
 * Only files that still exist and are approved are listed, so the code never points
 * at something that was deleted or refused. It is laid out the way Prettier writes it,
 * because generated code has to pass the project's formatter.
 */
export function renderAssetsModule(lock: Lock, present: Set<string>): { source: string; waiting: string[] } {
	const tree: Tree = {};
	const waiting: string[] = [];
	const owner = new Map<string, string>();

	for (const [relative, entry] of Object.entries(lock.assets)) {
		if (!present.has(relative)) continue;
		if (!usable(entry)) {
			waiting.push(`${relative} (${entry.moderation ?? "no asset id yet"})`);
			continue;
		}

		const segments = relative.split("/");
		let node = tree;
		segments.forEach((segment, index) => {
			const isFile = index === segments.length - 1;
			const key = keyFor(segment);
			const path = segments.slice(0, index + 1).join("/");
			const previous = owner.get(`${segments.slice(0, index).map(keyFor).join(".")}.${key}`);
			if (previous !== undefined && previous !== path) {
				throw new RoworkError(`\`${previous}\` and \`${path}\` would both be called \`${key}\`.`, {
					hint: "Rename one of them so each asset has its own name.",
				});
			}
			owner.set(`${segments.slice(0, index).map(keyFor).join(".")}.${key}`, path);

			if (isFile) node[key] = `rbxassetid://${entry.assetId as string}`;
			else node = (node[key] = (node[key] as Tree | undefined) ?? {}) as Tree;
		});
	}

	const quote = (name: string): string => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));
	const lines: string[] = [];
	const write = (node: Tree, depth: number): void => {
		for (const key of Object.keys(node).sort()) {
			const value = node[key] as Tree | string;
			const pad = "\t".repeat(depth);
			if (typeof value === "string") {
				lines.push(`${pad}${quote(key)}: ${JSON.stringify(value)},`);
			} else {
				lines.push(`${pad}${quote(key)}: {`);
				write(value, depth + 1);
				lines.push(`${pad}},`);
			}
		}
	};
	write(tree, 1);

	const body = lines.length === 0 ? "{}" : `{\n${lines.join("\n")}\n}`;
	return {
		source: [
			"// Generated by `rowork assets`. Do not edit: this file is rewritten every time.",
			"// Each name is a file in the assets folder; the value is what Roblox knows it as.",
			`export const Assets = ${body} as const;`,
			"",
		].join("\n"),
		waiting,
	};
}

/** Reads a `.env` file: `NAME=value`, optional quotes, `#` comments. */
function readDotenv(projectRoot: string): Record<string, string> {
	let source: string;
	try {
		source = readFileSync(join(projectRoot, ".env"), "utf8");
	} catch {
		return {};
	}
	const values: Record<string, string> = {};
	for (const line of source.split(/\r?\n/)) {
		const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
		if (match === null || line.trim().startsWith("#")) continue;
		values[match[1] as string] = (match[2] as string).replace(/^(['"])(.*)\1$/, "$2");
	}
	return values;
}

/**
 * Finds the Open Cloud API key: the environment first, then `.env`.
 *
 * A key that sits in `.env` is refused if git would commit that file. The history of
 * a repository outlives any key rotation, and this one is going to be public.
 */
export function readApiKey(projectRoot: string): { key: string; source: "environment" | ".env" } | undefined {
	const fromEnvironment = process.env[KEY_NAME];
	if (fromEnvironment !== undefined && fromEnvironment !== "") return { key: fromEnvironment, source: "environment" };

	const fromFile = readDotenv(projectRoot)[KEY_NAME];
	if (fromFile === undefined || fromFile === "") return undefined;

	if (existsSync(join(projectRoot, ".git"))) {
		const ignored = spawnSync("git", ["check-ignore", "-q", ".env"], { cwd: projectRoot });
		if (ignored.status === 1) {
			throw new RoworkError("`.env` holds your Roblox API key, but git does not ignore that file.", {
				hint: "Add a line `.env` to your .gitignore first: a key that gets committed must be considered leaked.",
			});
		}
	}
	return { key: fromFile, source: ".env" };
}

/** A pasted key is one token: no spaces, no quotes, nothing that could break a `.env` line. */
export function looksLikeApiKey(text: string): boolean {
	return /^[A-Za-z0-9+/=_-]{16,}$/.test(text);
}

/**
 * Stores the key in `.env`, in that order: first make sure git ignores `.env`, and only
 * then write the key. Other lines of the file are kept. The file is readable by its owner only.
 */
export function saveApiKey(projectRoot: string, key: string): void {
	const gitignore = join(projectRoot, ".gitignore");
	const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
	if (!current.split(/\r?\n/).some((line) => line.trim() === ".env")) {
		const separator = current === "" || current.endsWith("\n") ? "" : "\n";
		writeFileSync(gitignore, `${current}${separator}.env\n`, "utf8");
	}

	const file = join(projectRoot, ".env");
	const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
	const entry = `${KEY_NAME}=${key}`;
	const index = lines.findIndex((line) => new RegExp(`^\\s*(?:export\\s+)?${KEY_NAME}\\s*=`).test(line));
	if (index >= 0) {
		lines[index] = entry;
	} else {
		while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
		lines.push(entry);
	}
	writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
	try {
		chmodSync(file, 0o600);
	} catch {
		// Not every file system has permissions (Windows): the .gitignore entry is what protects it there.
	}
}

export function assetsFolder(config: { assets?: { folder?: string } }): string {
	return config.assets?.folder ?? DEFAULT_FOLDER;
}

/** Bytes as a short human string. */
export function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function statSize(path: string): number {
	return statSync(path).size;
}
