import { RoworkError } from "../cli/errors.js";

/**
 * A small client for the Roblox Open Cloud Assets API.
 *
 * Written from Roblox's own usage guide, which documents the request and a
 * COMPLETED operation but not the pending state, the error bodies or the rate
 * limits. Everything undocumented is handled defensively (an operation that is not
 * `done` is pending; an unknown moderation state is reported as it came), and the
 * behaviour against the real service is still to be confirmed with a real key.
 *
 * The API key is a secret: it is only ever sent in the `x-api-key` header, never
 * logged, and removed from any text that ends up in an error message.
 */

const DEFAULT_BASE = "https://apis.roblox.com";

/**
 * What Roblox calls the kinds of asset this client can create. Images go up as `Image`,
 * not `Decal`: the id of a Decal does not reliably load in an `ImageLabel` in a running
 * game. `Decal` stays in the type only because older lock files recorded it.
 */
export type AssetType = "Image" | "Decal" | "Audio" | "Model";

export interface Creator {
	type: "user" | "group";
	id: string;
}

export interface OperationResult {
	/** Set once the upload finished. */
	assetId?: string;
	/** Roblox's moderation state as sent, e.g. `MODERATION_STATE_APPROVED`. */
	moderation?: string;
	/** The operation is still running: ask again later. */
	pending: boolean;
	/** Why the upload failed, when it did. */
	failure?: string;
}

/**
 * The service address. Tests point it at a fake server, but only on this very
 * computer: an address from an environment variable must never be able to make the
 * key travel to another machine.
 */
export function openCloudBase(env: NodeJS.ProcessEnv = process.env): string {
	const override = env["ROWORK_OPEN_CLOUD_URL"];
	if (override === undefined || override === "") return DEFAULT_BASE;

	try {
		const url = new URL(override);
		if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) {
			return url.origin;
		}
	} catch {
		// Falls through to the refusal below.
	}
	throw new RoworkError("ROWORK_OPEN_CLOUD_URL is only accepted for an address on this computer.", {
		hint: "It exists for tests. Unset it to use the real Roblox service.",
	});
}

export class OpenCloud {
	private readonly base: string;

	constructor(private readonly apiKey: string, base = openCloudBase()) {
		this.base = base;
	}

	/** Removes the key from a piece of text before it can be shown. */
	redact(text: string): string {
		return this.apiKey === "" ? text : text.split(this.apiKey).join("***");
	}

	private async request(path: string, init: RequestInit): Promise<Response> {
		for (let attempt = 0; ; attempt += 1) {
			let response: Response;
			try {
				response = await fetch(`${this.base}${path}`, {
					...init,
					headers: { ...(init.headers as Record<string, string>), "x-api-key": this.apiKey },
					signal: AbortSignal.timeout(120_000),
				});
			} catch (error) {
				throw new RoworkError("Could not reach Roblox Open Cloud.", {
					hint: "Check your connection and try again.",
					cause: error,
				});
			}

			if (response.status === 429 && attempt < 3) {
				const wait = Math.min(Number(response.headers.get("retry-after")) || 2 ** attempt * 2, 60);
				await new Promise((resolve) => setTimeout(resolve, wait * 1000));
				continue;
			}
			if (response.status === 401 || response.status === 403) {
				throw new RoworkError("Roblox refused the API key.", {
					hint: "Check that it is valid, has not expired, has the Assets API permission with read and write, and that its IP restrictions allow this computer.",
				});
			}
			if (!response.ok) {
				const body = this.redact((await response.text()).slice(0, 300));
				throw new RoworkError(`Roblox Open Cloud answered ${response.status}.`, { hint: body === "" ? undefined : body });
			}
			return response;
		}
	}

	/**
	 * Asks whether Roblox accepts the key, without creating anything: it reads an operation
	 * that cannot exist. A valid key with the Assets permission gets "not found"; a bad key,
	 * an expired one, a missing permission or a wrong IP address gets 401 or 403.
	 * (Which answer a real key gets is still to be confirmed against the real service.)
	 */
	async verifyKey(): Promise<"accepted" | "refused" | "unreachable"> {
		try {
			const response = await fetch(`${this.base}/assets/v1/operations/rowork-key-check`, {
				headers: { "x-api-key": this.apiKey },
				signal: AbortSignal.timeout(20_000),
			});
			return response.status === 401 || response.status === 403 ? "refused" : "accepted";
		} catch {
			return "unreachable";
		}
	}

	/** Starts an upload. Returns the operation to follow, e.g. `operations/abc`. */
	async createAsset(input: {
		file: Uint8Array;
		fileName: string;
		contentType: string;
		assetType: AssetType;
		displayName: string;
		description: string;
		creator: Creator;
	}): Promise<string> {
		const form = new FormData();
		form.append(
			"request",
			JSON.stringify({
				assetType: input.assetType,
				displayName: input.displayName,
				description: input.description,
				creationContext: {
					creator: input.creator.type === "user" ? { userId: input.creator.id } : { groupId: input.creator.id },
				},
			}),
		);
		form.append("fileContent", new Blob([input.file], { type: input.contentType }), input.fileName);

		const response = await this.request("/assets/v1/assets", { method: "POST", body: form });
		const body = (await response.json()) as { path?: string };
		if (typeof body.path !== "string") {
			throw new RoworkError("Roblox Open Cloud did not return an operation to follow.");
		}
		return body.path;
	}

	/** Reads an operation once. Anything that is not `done` is treated as still running. */
	async readOperation(operation: string): Promise<OperationResult> {
		const id = operation.replace(/^operations\//, "");
		const response = await this.request(`/assets/v1/operations/${encodeURIComponent(id)}`, { method: "GET" });
		const body = (await response.json()) as {
			done?: boolean;
			error?: { message?: string };
			response?: { assetId?: string; moderationResult?: { moderationState?: string } };
		};

		if (body.error !== undefined) return { pending: false, failure: this.redact(body.error.message ?? "the upload failed") };
		if (body.done !== true) return { pending: true };

		const assetId = body.response?.assetId;
		if (assetId === undefined) return { pending: false, failure: "Roblox finished the upload without an asset id." };
		const result: OperationResult = { pending: false, assetId };
		const moderation = body.response?.moderationResult?.moderationState;
		if (moderation !== undefined) result.moderation = moderation;
		return result;
	}

	/** Follows an operation until it finishes, or gives up after `seconds`. */
	async waitForOperation(operation: string, seconds = 90): Promise<OperationResult> {
		const started = Date.now();
		let delay = 500;
		for (;;) {
			const result = await this.readOperation(operation);
			if (!result.pending || Date.now() - started > seconds * 1000) return result;
			await new Promise((resolve) => setTimeout(resolve, delay));
			delay = Math.min(delay * 1.6, 4000);
		}
	}
}
