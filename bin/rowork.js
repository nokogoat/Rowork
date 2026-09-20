#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "dist", "main.js");

if (!existsSync(entry)) {
	console.error("Rowork is not built. Run `npm run build` at the repository root.");
	process.exit(1);
}

// pathToFileURL is mandatory: `import("G:\...\main.js")` fails on Windows,
// because an absolute Windows path is not a valid URL.
const { run } = await import(pathToFileURL(entry).href);

await run(process.argv);
