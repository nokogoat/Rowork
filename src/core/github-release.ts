import { createHash } from "node:crypto";

export interface ReleaseAsset {
	name: string;
	browser_download_url: string;
	/** `sha256:<hex>`, published by GitHub for recent release assets only. */
	digest?: string | null;
}

export interface Release {
	tag_name: string;
	assets?: ReleaseAsset[];
}

const HEADERS = { "User-Agent": "rowork" };

/** Fetches a release of `owner/repo`: the latest one, or the one tagged `tag`. */
export async function getRelease(repository: string, tag?: string): Promise<Release> {
	const path = tag === undefined ? "latest" : `tags/${tag}`;
	const url = `https://api.github.com/repos/${repository}/releases/${path}`;
	// A stalled connection must not hang the CLI: the API answers in well under a second.
	const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	return (await response.json()) as Release;
}

export interface DownloadedAsset {
	data: Buffer;
	/** False when GitHub published no checksum, so nothing could be verified. */
	verified: boolean;
}

/**
 * Downloads a release asset and checks it against the SHA-256 GitHub publishes.
 *
 * A published checksum that does not match always fails. A missing checksum
 * fails too unless `allowUnverified` is set: older releases predate checksums,
 * and the caller decides whether the artifact is worth the risk.
 */
export async function downloadAsset(
	asset: ReleaseAsset,
	options: { allowUnverified?: boolean } = {},
): Promise<DownloadedAsset> {
	const response = await fetch(asset.browser_download_url, { headers: HEADERS });
	if (!response.ok) throw new Error(`${asset.browser_download_url} answered ${response.status}`);
	const data = Buffer.from(await response.arrayBuffer());

	const expected = asset.digest?.replace(/^sha256:/, "");
	if (expected === undefined) {
		if (options.allowUnverified !== true) {
			throw new Error(`${asset.name} has no published checksum`);
		}
		return { data, verified: false };
	}

	const actual = createHash("sha256").update(data).digest("hex");
	if (actual !== expected) {
		throw new Error(`checksum mismatch for ${asset.name} (expected ${expected}, got ${actual})`);
	}
	return { data, verified: true };
}
