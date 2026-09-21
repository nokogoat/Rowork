import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import {
	DEFAULT_FOLDER,
	KEY_NAME,
	LOCK_FILE,
	MAX_MODEL_BYTES,
	assetsFolder,
	humanSize,
	planAssets,
	readApiKey,
	readLock,
	renderAssetsModule,
	scanAssets,
	writeLock,
	type PlannedAsset,
} from "../core/assets.js";
import { CONFIG_FILENAME } from "../core/config.js";
import { OpenCloud, type Creator } from "../core/open-cloud.js";
import { defineCommand, type CommandContext } from "../plugins/api.js";
import { answered, isInteractive, prompts } from "../ui/prompt.js";
import { requireProject } from "./make.js";

const HOW_TO_GET_A_KEY = [
	"Rowork needs a Roblox Open Cloud API key to upload. Create one in the Creator Hub (Open Cloud, API keys):",
	"  - give it the Assets API permission, with read and write, and nothing else;",
	"  - restrict it to your IP address if you can, and set an expiry date.",
	"Then keep it out of your code, either in your environment:",
	`  export ${KEY_NAME}=<your key>`,
	"or in a `.env` file at the project root (git ignores it in a project created by Rowork):",
	`  ${KEY_NAME}=<your key>`,
	"Rowork never prints the key and never writes it anywhere else. Details: https://create.roblox.com/docs/cloud/guides/usage-assets",
];

function parseCreator(text: string): Creator {
	const match = /^(?:(user|group):)?(\d+)$/.exec(text.trim());
	if (match === null) {
		throw new RoworkError(`\`${text}\` is not a creator.`, { hint: "Write user:123456 or group:123456 (a bare number means a user)." });
	}
	return { type: (match[1] as "user" | "group" | undefined) ?? "user", id: match[2] as string };
}

/** The creator from the flag, the project, or a question. The choice is saved for next time. */
async function resolveCreator(context: CommandContext, root: string, configured: Creator | undefined): Promise<Creator> {
	const flag = context.options["creator"];
	if (typeof flag === "string") return parseCreator(flag);
	if (configured !== undefined) return configured;

	if (!isInteractive()) {
		throw new RoworkError("Roblox needs to know who owns the assets.", {
			hint: "Run once with --creator user:<your user id> (or group:<group id>). It is remembered in rowork.json.",
		});
	}
	const type = answered(
		await prompts.select({
			message: "Who owns the assets you upload?",
			options: [
				{ value: "user", label: "Me (my Roblox account)" },
				{ value: "group", label: "A group" },
			],
		}),
	) as "user" | "group";
	const id = answered(
		await prompts.text({
			message: type === "user" ? "Your Roblox user id (the number in your profile address)" : "The group id (the number in the group address)",
			validate: (value) => (/^\d+$/.test((value ?? "").trim()) ? undefined : "Digits only."),
		}),
	).trim();
	return { type, id };
}

function saveCreator(root: string, creator: Creator): void {
	const file = join(root, CONFIG_FILENAME);
	const config = JSON.parse(readFileSync(file, "utf8")) as { assets?: { creator?: Creator } };
	config.assets = { ...config.assets, creator };
	writeFileSync(file, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}

const LABEL: Record<PlannedAsset["action"], string> = { upload: "upload   ", resume: "resume   ", unchanged: "unchanged" };

export const assetsCommand = defineCommand({
	name: "assets",
	description: "Upload the files of your assets folder to Roblox, and use their ids by name in your code.",
	guided: true,
	options: [
		{ flags: "--creator <who>", description: "who owns the uploads: user:<id> or group:<id> (remembered in rowork.json)" },
		{ flags: "--dry-run", description: "show what would be uploaded and change nothing" },
		{ flags: "--yes", description: "do not ask for confirmation" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "assets");
		const { logger } = context;
		const folder = assetsFolder(config);

		const folderPath = join(root, folder);
		const { files, skipped } = scanAssets(root, folder);
		if (files.length === 0 && Object.keys(readLock(root).assets).length === 0) {
			mkdirSync(folderPath, { recursive: true });
			writeFileSync(join(folderPath, ".gitkeep"), "", { flag: "a" });
			logger.info(`Nothing to upload yet. Drop images (png, jpg), sounds (mp3, ogg, wav, flac) or models (fbx, glb, rbxm) in ${pc.bold(`${folder}/`)}, then run \`rowork assets\` again.`);
			return;
		}

		for (const file of skipped) logger.warn(`${file.relative}: ${file.reason}, skipped.`);

		const lock = readLock(root);
		const plan = planAssets(files, lock);
		const todo = plan.filter((entry) => entry.action !== "unchanged");

		logger.info(pc.bold(`${folder}/`));
		for (const entry of plan) {
			logger.step(`${LABEL[entry.action]} ${entry.file.relative} ${pc.dim(`(${entry.file.type}, ${humanSize(entry.file.size)})`)}`);
		}
		logger.blank();

		const present = new Set(files.map((file) => file.relative));
		const writeModule = (): { waiting: string[] } => {
			const rendered = renderAssetsModule(readLock(root), present);
			const target = join(root, config.paths.shared);
			mkdirSync(target, { recursive: true });
			writeFileSync(join(target, "assets.ts"), rendered.source, "utf8");
			return { waiting: rendered.waiting };
		};

		if (todo.length === 0) {
			writeModule();
			logger.success("Everything is already uploaded. Your code uses it as `Assets` from shared/assets.");
			return;
		}

		if (context.options["dryRun"] === true) {
			logger.info(`Dry run: ${todo.length} file(s) would be uploaded, nothing was changed.`);
			return;
		}

		// The key and the owner are needed before any question about confirming: fail early.
		const found = readApiKey(root);
		if (found === undefined) {
			throw new RoworkError("No Roblox API key found.", { hint: HOW_TO_GET_A_KEY.join("\n      ") });
		}
		const creator = await resolveCreator(context, root, config.assets?.creator);

		if (context.options["yes"] !== true) {
			if (!isInteractive()) {
				throw new RoworkError("`rowork assets` asks for confirmation before uploading.", { hint: "Outside a terminal, add --yes (and --dry-run first to preview)." });
			}
			const owner = `${creator.type === "user" ? "your account" : "group"} ${creator.id}`;
			const confirmed = answered(
				await prompts.confirm({ message: `Upload ${todo.length} file(s) to Roblox, owned by ${owner}?`, initialValue: true }),
			);
			if (!confirmed) {
				prompts.cancel("Nothing was uploaded.");
				return;
			}
		}

		saveCreator(root, creator);
		const cloud = new OpenCloud(found.key);
		let failures = 0;

		for (const { file, action } of todo) {
			try {
				if (action === "upload" && file.type === "Model" && file.size > MAX_MODEL_BYTES) {
					throw new RoworkError(`${file.relative} is ${humanSize(file.size)}: Roblox accepts models up to 20 MB.`);
				}

				let operation = lock.assets[file.relative]?.operation;
				if (action === "upload") {
					operation = await cloud.createAsset({
						file: readFileSync(file.absolute),
						fileName: file.relative.split("/").pop() ?? file.relative,
						contentType: file.contentType,
						assetType: file.type,
						displayName: (file.relative.split("/").pop() ?? file.relative).replace(/\.[^.]+$/, "").slice(0, 50),
						description: "Uploaded with Rowork",
						creator,
					});
					// Written at once: if the run is interrupted, the next one resumes instead of uploading twice.
					lock.assets[file.relative] = { sha256: file.sha256, type: file.type, operation };
					writeLock(root, lock);
				}

				const result = await cloud.waitForOperation(operation as string);
				if (result.failure !== undefined) throw new RoworkError(result.failure);

				const entry = { ...(lock.assets[file.relative] ?? { sha256: file.sha256, type: file.type }) };
				if (result.pending) {
					lock.assets[file.relative] = entry;
					writeLock(root, lock);
					logger.warn(`${file.relative}: Roblox is still processing it. Run \`rowork assets\` again in a moment.`);
					continue;
				}
				delete entry.operation;
				lock.assets[file.relative] = {
					...entry,
					...(result.assetId === undefined ? {} : { assetId: result.assetId }),
					...(result.moderation === undefined ? {} : { moderation: result.moderation }),
					uploadedAt: new Date().toISOString(),
				};
				writeLock(root, lock);
				logger.success(`${file.relative} -> rbxassetid://${result.assetId ?? "?"}${result.moderation === undefined ? "" : pc.dim(`  (${result.moderation})`)}`);
			} catch (error) {
				const message = error instanceof Error ? cloud.redact(error.message) : "unknown error";
				// A refused key fails every file the same way: stop instead of trying them all.
				if (error instanceof RoworkError && /refused the API key/.test(error.message)) throw error;
				failures += 1;
				logger.error(`${file.relative}: ${message}`);
			}
		}

		const { waiting } = writeModule();
		logger.blank();
		logger.info(`Written ${join(config.paths.shared, "assets.ts")}. In your code: ${pc.bold("Assets.<folder>.<name>")}, e.g. \`image.Image = Assets.icons.sword\`.`);
		if (waiting.length > 0) {
			logger.warn("Not in Assets yet (waiting for Roblox, or refused):");
			for (const line of waiting) logger.info(`  ${line}`);
			logger.info("Run `rowork assets` again later to pick them up.");
		}
		logger.info(pc.dim(`Commit ${LOCK_FILE}: it is what stops files from being uploaded twice. Never commit your API key.`));
		if (failures > 0) process.exitCode = 1;
	},
});
