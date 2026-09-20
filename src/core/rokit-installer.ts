import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { unzipSync } from "fflate";

import { RoworkError } from "../cli/errors.js";
import type { Logger } from "../plugins/api.js";
import { run as runBinary } from "./exec.js";

const RELEASE_API = "https://api.github.com/repos/rojo-rbx/rokit/releases/latest";

interface ReleaseAsset {
	name: string;
	browser_download_url: string;
	/** `sha256:<hex>`, published by GitHub for every release asset. */
	digest?: string;
}

/** Where `rokit self-install` puts the `rokit` binary and the tool shims. */
export function rokitBinDirectory(): string {
	return join(homedir(), ".rokit", "bin");
}

/** Release asset suffix for this machine, or undefined where Rokit has no build. */
function platformTarget(): string | undefined {
	const systems: Partial<Record<NodeJS.Platform, string>> = {
		linux: "linux",
		darwin: "macos",
		win32: "windows",
	};
	const architectures: Partial<Record<NodeJS.Architecture, string>> = {
		x64: "x86_64",
		arm64: "aarch64",
	};
	const os = systems[process.platform];
	const arch = architectures[process.arch];
	return os !== undefined && arch !== undefined ? `${os}-${arch}` : undefined;
}

async function download(url: string): Promise<Buffer> {
	const response = await fetch(url, { headers: { "User-Agent": "rowork" } });
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	return Buffer.from(await response.arrayBuffer());
}

/**
 * Downloads Rokit from its official GitHub release and runs its own installer.
 *
 * Nothing is executed before the archive matches the SHA-256 GitHub publishes
 * for it, and a release without a published digest is refused rather than
 * trusted. The version is whatever is latest: like every other tool version in
 * Rowork, it is never hardcoded. Returns the path of the installed binary,
 * which is usable immediately even though the current shell's PATH is not
 * refreshed until the terminal is reopened.
 */
export async function installRokit(logger: Logger): Promise<string> {
	const target = platformTarget();
	if (target === undefined) {
		throw new RoworkError(`Rokit publishes no build for ${process.platform}/${process.arch}.`, {
			hint: "Install it manually: https://github.com/rojo-rbx/rokit",
		});
	}

	logger.step("downloading Rokit from github.com/rojo-rbx/rokit");

	let workspace: string | undefined;
	try {
		const release = (await (await fetch(RELEASE_API, { headers: { "User-Agent": "rowork" } })).json()) as {
			assets?: ReleaseAsset[];
		};
		const asset = release.assets?.find((candidate) => candidate.name.endsWith(`-${target}.zip`));
		if (asset === undefined) throw new Error(`no release asset for ${target}`);

		const expected = asset.digest?.replace(/^sha256:/, "");
		if (expected === undefined) throw new Error(`${asset.name} has no published checksum`);

		const archive = await download(asset.browser_download_url);
		const actual = createHash("sha256").update(archive).digest("hex");
		if (actual !== expected) {
			throw new Error(`checksum mismatch for ${asset.name} (expected ${expected}, got ${actual})`);
		}

		const files = unzipSync(new Uint8Array(archive));
		const binaryName = process.platform === "win32" ? "rokit.exe" : "rokit";
		const binary = files[binaryName];
		if (binary === undefined) throw new Error(`${binaryName} is missing from ${asset.name}`);

		workspace = mkdtempSync(join(tmpdir(), "rowork-rokit-"));
		const extracted = join(workspace, binaryName);
		writeFileSync(extracted, binary);
		chmodSync(extracted, 0o755);

		logger.step("running `rokit self-install`");
		await runBinary(extracted, ["self-install"], { cwd: workspace, stdio: "ignore" });
	} catch (cause) {
		throw new RoworkError("Could not install Rokit automatically.", {
			hint: "Install it manually: https://github.com/rojo-rbx/rokit",
			cause,
		});
	} finally {
		if (workspace !== undefined) rmSync(workspace, { recursive: true, force: true });
	}

	return join(rokitBinDirectory(), process.platform === "win32" ? "rokit.exe" : "rokit");
}
