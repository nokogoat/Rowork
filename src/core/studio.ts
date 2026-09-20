import { spawn as spawnDetached } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import spawn from "cross-spawn";

import { RoworkError } from "../cli/errors.js";
import type { Logger } from "../plugins/api.js";
import { loadConfig } from "./config.js";
import { run as runBinary } from "./exec.js";
import { downloadAsset, getRelease } from "./github-release.js";
import { findExecutable } from "./toolchain.js";

/**
 * Roblox publishes Studio for Windows and macOS only. On Linux the working
 * route is Vinegar, a Flatpak that runs the real Studio under Wine/Proton.
 */
export const VINEGAR_ID = "org.vinegarhq.Vinegar";
const FLATHUB_REPO = "https://dl.flathub.org/repo/flathub.flatpakrepo";

export function needsStudioSetup(): boolean {
	return process.platform === "linux";
}

export function hasFlatpak(): boolean {
	return findExecutable("flatpak", process.cwd()) !== undefined;
}

export function isVinegarInstalled(): boolean {
	if (!hasFlatpak()) return false;
	return spawn.sync("flatpak", ["info", VINEGAR_ID], { stdio: "ignore" }).status === 0;
}

/** Where Vinegar keeps Studio and its Wine prefix. */
export function vinegarDataDirectory(): string {
	return join(homedir(), ".var", "app", VINEGAR_ID, "data", "vinegar");
}

/**
 * Installs Vinegar for the current user only, so no root access is needed and
 * nothing outside the user's home is modified.
 */
export async function installVinegar(logger: Logger): Promise<void> {
	if (!hasFlatpak()) {
		throw new RoworkError("Flatpak is not installed.", {
			hint: "Install it with your package manager (e.g. `sudo pacman -S flatpak`, `sudo apt install flatpak`), then run this again. https://flatpak.org/setup/",
		});
	}

	logger.step("adding the Flathub remote for this user (if missing)");
	await runBinary("flatpak", ["remote-add", "--user", "--if-not-exists", "flathub", FLATHUB_REPO], {
		cwd: process.cwd(),
		stdio: "ignore",
	});

	logger.step(`installing ${VINEGAR_ID} (Roblox Studio for Linux), this downloads a few hundred MB`);
	await runBinary("flatpak", ["install", "--user", "-y", "flathub", VINEGAR_ID], {
		cwd: process.cwd(),
	});
}

/**
 * Finds the `Roblox` local-data directories of every Studio Wine prefix.
 *
 * They exist only after Studio has been launched once, because that is when
 * Vinegar creates the prefix. Explicit descent rather than a recursive search:
 * a Wine prefix holds a whole fake Windows tree.
 */
export function findStudioDataDirectories(dataDirectory = vinegarDataDirectory()): string[] {
	const found: string[] = [];
	const subdirectories = (path: string): string[] => {
		try {
			return readdirSync(path, { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => join(path, entry.name));
		} catch {
			return [];
		}
	};

	for (const prefix of subdirectories(join(dataDirectory, "prefixes"))) {
		for (const user of subdirectories(join(prefix, "drive_c", "users"))) {
			const roblox = join(user, "AppData", "Local", "Roblox");
			if (existsSync(roblox)) found.push(roblox);
		}
	}
	return found;
}

/** Reads the Rojo version pinned in the project's rokit.toml, if any. */
export function pinnedRojoVersion(projectRoot: string | undefined): string | undefined {
	if (projectRoot === undefined) return undefined;
	try {
		const toml = readFileSync(join(projectRoot, "rokit.toml"), "utf8");
		return /^\s*rojo\s*=\s*"rojo-rbx\/rojo@([^"]+)"/m.exec(toml)?.[1];
	} catch {
		return undefined;
	}
}

/**
 * Puts the Rojo plugin where Studio loads plugins from.
 *
 * `rojo plugin install` answers "platform not supported" on Linux, so Rowork
 * places the release's `Rojo.rbxm` itself. The plugin has to match the Rojo
 * server it talks to, hence the version pinned in rokit.toml. Older releases
 * publish no checksum: the file still comes from the official repository over
 * HTTPS, and the user is told it could not be verified.
 */
export async function installRojoPlugin(
	dataDirectories: readonly string[],
	projectRoot: string | undefined,
	logger: Logger,
): Promise<void> {
	const version = pinnedRojoVersion(projectRoot);
	logger.step(`downloading the Rojo plugin (${version === undefined ? "latest" : `v${version}`})`);

	const release = await getRelease("rojo-rbx/rojo", version === undefined ? undefined : `v${version}`);
	const asset = release.assets?.find((candidate) => candidate.name === "Rojo.rbxm");
	if (asset === undefined) throw new Error(`no Rojo.rbxm in Rojo ${release.tag_name}`);

	const { data, verified } = await downloadAsset(asset, { allowUnverified: true });
	if (!verified) {
		logger.warn(`GitHub publishes no checksum for Rojo ${release.tag_name}: the plugin could not be verified.`);
	}

	for (const dataDirectory of dataDirectories) {
		const plugins = join(dataDirectory, "Plugins");
		mkdirSync(plugins, { recursive: true });
		writeFileSync(join(plugins, "Rojo.rbxm"), data);
		logger.step(`installed ${join(plugins, "Rojo.rbxm")}`);
	}
}

/** Where a Studio plugin can be found, for the ones Rowork places itself. */
export const UI_LABS = {
	repository: "PepeElToro41/ui-labs",
	asset: "Plugin.rbxm",
	file: "UILabs.rbxm",
	store: "https://create.roblox.com/store/asset/14293316215/",
} as const;

/**
 * Places a plugin published as a GitHub release asset into Studio's plugins folder.
 *
 * Same reasoning as the Rojo plugin, and the same limit: on Linux the Wine prefix
 * only exists after Studio has been launched once. Unlike Rojo's older releases,
 * UI Labs publishes a SHA-256 for its plugin, so it is verified here.
 */
export async function installReleasePlugin(
	dataDirectories: readonly string[],
	plugin: { repository: string; asset: string; file: string },
	logger: Logger,
): Promise<void> {
	logger.step(`downloading the ${plugin.file.replace(/\.rbxm$/, "")} plugin`);
	const release = await getRelease(plugin.repository);
	const asset = release.assets?.find((candidate) => candidate.name === plugin.asset);
	if (asset === undefined) throw new Error(`no ${plugin.asset} in ${plugin.repository} ${release.tag_name}`);

	const { data, verified } = await downloadAsset(asset, { allowUnverified: true });
	if (!verified) logger.warn(`GitHub publishes no checksum for ${plugin.repository} ${release.tag_name}: the plugin could not be verified.`);

	for (const dataDirectory of dataDirectories) {
		const plugins = join(dataDirectory, "Plugins");
		mkdirSync(plugins, { recursive: true });
		writeFileSync(join(plugins, plugin.file), data);
		logger.step(`installed ${join(plugins, plugin.file)}`);
	}
}

/** The Rojo plugin in the Creator Store, as Studio names its folder for it. */
const STORE_ROJO_PLUGIN_ID = "13916111004";

/**
 * Finds the Creator Store copy of the Rojo plugin, if Studio installed one.
 *
 * Studio keeps store plugins under `Roblox/<user id>/InstalledPlugins/<asset id>`.
 * Rowork places its own copy, matching the Rojo it runs, in `Roblox/Plugins`: with
 * both, Studio shows two Rojo buttons, and the store one is usually older.
 */
export function findStoreRojoPlugin(dataDirectory = vinegarDataDirectory()): string | undefined {
	for (const roblox of findStudioDataDirectories(dataDirectory)) {
		let users: string[];
		try {
			users = readdirSync(roblox, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		} catch {
			continue;
		}
		for (const user of users) {
			const candidate = join(roblox, user, "InstalledPlugins", STORE_ROJO_PLUGIN_ID);
			if (existsSync(candidate)) return candidate;
		}
	}
	return undefined;
}

/**
 * Says why two Rojo plugins is a problem, and what to do about it.
 *
 * Rojo 7.7 replaced JSON by MessagePack for its whole API. A plugin older than the
 * server cannot read it and Studio reports "Can't parse JSON", which says nothing
 * about the real cause. The Creator Store copy lags behind Rojo's releases.
 */
export function warnAboutStorePlugin(logger: Logger): void {
	logger.warn("Studio has TWO Rojo plugins: the Creator Store one, and the one Rowork installed.");
	logger.info("  The Store copy is usually older than the Rojo Rowork runs. Since Rojo 7.7 it cannot talk to the server");
	logger.info("  and Studio only says \"Can't parse JSON\". Disable it: Plugins > Manage Plugins > Rojo (Creator Store).");
}

export interface StudioSetupResult {
	pluginInstalled: boolean;
}

/** Everything `rowork studio:setup` does, reusable from `rowork start`. */
export async function setupStudio(options: {
	logger: Logger;
	projectRoot: string | undefined;
	plugin: boolean;
}): Promise<StudioSetupResult> {
	const { logger } = options;

	if (isVinegarInstalled()) {
		logger.step("Vinegar is already installed");
	} else {
		await installVinegar(logger);
	}

	if (!options.plugin) return { pluginInstalled: false };

	const directories = findStudioDataDirectories();
	if (directories.length === 0) {
		logger.warn("Studio has not been launched yet, so there is nowhere to put the Rojo plugin.");
		logger.info("Run `rowork studio`, sign in to Roblox, close Studio, then `rowork studio:setup` again.");
		return { pluginInstalled: false };
	}

	await installRojoPlugin(directories, options.projectRoot, logger);
	if (findStoreRojoPlugin() !== undefined) warnAboutStorePlugin(logger);

	// The UI module previews components with the UI Labs plugin: place it too.
	if (options.projectRoot !== undefined) {
		try {
			if (loadConfig(options.projectRoot).modules?.includes("ui")) {
				await installReleasePlugin(directories, UI_LABS, logger);
			}
		} catch (error) {
			logger.warn(`Could not place the UI Labs plugin: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return { pluginInstalled: true };
}

/** Starts Studio through Vinegar and returns immediately. */
export function launchStudio(): void {
	const child = spawnDetached("flatpak", ["run", VINEGAR_ID], { detached: true, stdio: "ignore" });
	child.unref();
}
