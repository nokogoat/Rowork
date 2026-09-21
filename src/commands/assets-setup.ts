import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { KEY_NAME, looksLikeApiKey, readApiKey, saveApiKey } from "../core/assets.js";
import { CONFIG_FILENAME } from "../core/config.js";
import { OpenCloud, type Creator } from "../core/open-cloud.js";
import { openBrowser } from "../dashboard/open.js";
import { defineCommand, type CommandContext } from "../plugins/api.js";
import { answered, isInteractive, prompts } from "../ui/prompt.js";
import { requireProject } from "./make.js";

export const KEY_HELP_URL = "https://create.roblox.com/dashboard/credentials";

export function parseCreator(text: string): Creator {
	const match = /^(?:(user|group):)?(\d+)$/.exec(text.trim());
	if (match === null) {
		throw new RoworkError(`\`${text}\` is not a creator.`, { hint: "Write user:123456 or group:123456 (a bare number means a user)." });
	}
	return { type: (match[1] as "user" | "group" | undefined) ?? "user", id: match[2] as string };
}

/** The creator from the flag, the project, or a question. */
export async function resolveCreator(context: CommandContext, configured: Creator | undefined): Promise<Creator> {
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

/** Remembers the owner in rowork.json. Only the owner: the key never goes there. */
export function saveCreator(root: string, creator: Creator): void {
	const file = join(root, CONFIG_FILENAME);
	const config = JSON.parse(readFileSync(file, "utf8")) as { assets?: { creator?: Creator } };
	config.assets = { ...config.assets, creator };
	writeFileSync(file, `${JSON.stringify(config, undefined, 2)}\n`, "utf8");
}

const STEPS = [
	`1. Open ${KEY_HELP_URL}, click "Create API Key" and give it a name (for example Rowork).`,
	'2. Under "Access Permissions", open "Select API System" and pick "assets".',
	"3. Tick asset:read and asset:write. Nothing else: do not add legacy-assets or asset-permissions,",
	"   a key with fewer rights does less damage if it ever leaks.",
	'4. Under "Security", restrict it to your IP address and set an expiry date.',
	'5. Click "Save & Generate Key", then copy the key: Roblox shows it only once.',
	"",
	"Then paste it below. You will also be asked for your Roblox user id (the number in your profile address).",
].join("\n");

/**
 * Walks the user through getting a key and stores it, so nobody has to edit a file by hand.
 * The key is only kept once Roblox has accepted it, and only ever written to `.env`.
 */
export async function setUpApiKey(context: CommandContext, root: string): Promise<{ key: string; source: ".env" }> {
	prompts.note(STEPS, "Create a Roblox API key");

	const open = answered(await prompts.confirm({ message: "Open that page in your browser?", initialValue: true }));
	if (open) openBrowser(KEY_HELP_URL);

	for (;;) {
		const pasted = answered(
			await prompts.password({
				message: "Paste the key here (it is hidden, and never shown again)",
				validate: (value) => (looksLikeApiKey((value ?? "").trim()) ? undefined : "That does not look like an API key: paste it whole, without spaces or quotes."),
			}),
		).trim();

		const spinner = prompts.spinner();
		spinner.start("Asking Roblox whether it accepts this key");
		const verdict = await new OpenCloud(pasted).verifyKey();
		if (verdict === "accepted") {
			spinner.stop("Roblox accepts the key.");
			saveApiKey(root, pasted);
			context.logger.success(`Saved in ${pc.bold(".env")} (git ignores that file). Rowork never prints it.`);
			return { key: pasted, source: ".env" };
		}
		spinner.stop(pc.red(verdict === "refused" ? "Roblox refused the key." : "Could not reach Roblox."));

		if (verdict === "refused") {
			context.logger.info("Check that you ticked asset:read and asset:write, that the key has not expired, and that its IP restriction includes this computer.");
		}
		const again = answered(await prompts.confirm({ message: "Try another key?", initialValue: true }));
		if (!again) throw new RoworkError("No key was saved.", { hint: `Run \`rowork assets:setup\` again when you have one, or set ${KEY_NAME} yourself.` });
	}
}

export const assetsSetupCommand = defineCommand({
	name: "assets:setup",
	description: "Set up the Roblox API key and owner that `rowork assets` needs (guided, done once).",
	guided: true,
	options: [
		{ flags: "--creator <who>", description: "who owns the uploads: user:<id> or group:<id> (remembered in rowork.json)" },
		{ flags: "--check", description: "only check the key and owner already set up (works without a terminal)" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "assets:setup");
		const { logger } = context;
		const check = context.options["check"] === true;

		if (!check && !isInteractive()) {
			throw new RoworkError("`rowork assets:setup` needs a terminal to ask for the key (it is never taken from an argument).", {
				hint: `Outside a terminal, set ${KEY_NAME} in the environment and run \`rowork assets:setup --check --creator user:<id>\`.`,
			});
		}

		let found = readApiKey(root);
		if (!check) {
			const replace =
				found === undefined ||
				answered(await prompts.confirm({ message: `A key is already set up (${found.source}). Replace it?`, initialValue: false }));
			if (replace) found = await setUpApiKey(context, root);
		}
		if (found === undefined) {
			throw new RoworkError("No Roblox API key found.", { hint: `Run \`rowork assets:setup\` in a terminal, or set ${KEY_NAME}.` });
		}

		if (check) {
			const verdict = await new OpenCloud(found.key).verifyKey();
			if (verdict !== "accepted") {
				throw new RoworkError(verdict === "refused" ? "Roblox refused the key." : "Could not reach Roblox to check the key.", {
					hint: "Check its permissions (asset:read, asset:write), its expiry and its IP restriction.",
				});
			}
			logger.success(`The key (${found.source}) is accepted by Roblox.`);
		}

		const creator = await resolveCreator(context, config.assets?.creator);
		saveCreator(root, creator);
		logger.success(`Assets will be owned by ${creator.type === "user" ? "user" : "group"} ${creator.id}.`);
		logger.info(`Ready: drop files in ${pc.bold("assets/")} and run \`rowork assets\`.`);
	},
});
