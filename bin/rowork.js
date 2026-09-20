#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "dist", "main.js");

if (!existsSync(entry)) {
	console.error("Rowork n'est pas compile. Lance `npm run build` a la racine du depot.");
	process.exit(1);
}

// pathToFileURL est obligatoire : `import("G:\...\main.js")` echoue sous Windows,
// un chemin absolu Windows n'etant pas une URL valide.
const { run } = await import(pathToFileURL(entry).href);

await run(process.argv);
