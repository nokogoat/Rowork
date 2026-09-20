import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { CONFIG_FILENAME, defaultConfig } from "../core/config.js";
import { run as runBinary } from "../core/exec.js";
import { assertValidProjectName, toKebabCase, toPascalCase } from "../core/naming.js";
import { defineCommand } from "../plugins/api.js";
import { renderTree, templatesRoot } from "../templates/engine.js";

/** Types et outils de compilation : versions resolues par npm, jamais ecrites en dur. */
const DEV_DEPENDENCIES = [
	"typescript",
	"roblox-ts",
	"@rbxts/types",
	"@rbxts/compiler-types",
	"rbxts-transformer-flamework",
];

const DEPENDENCIES = ["@flamework/core", "@flamework/components"];

export const initCommand = defineCommand({
	name: "init",
	description: "Cree un projet Roblox pret a l'emploi (roblox-ts + Flamework + Rojo).",
	arguments: [{ name: "name", description: "Nom du projet, qui sert aussi de nom de dossier" }],
	options: [
		{ flags: "--path <dir>", description: "dossier parent dans lequel creer le projet" },
		{ flags: "--no-install", description: "ne pas installer les dependances npm" },
		{ flags: "--no-git", description: "ne pas initialiser de depot git" },
		{ flags: "-f, --force", description: "autoriser un dossier cible deja non vide" },
	],
	async run(context) {
		const rawName = context.args["name"];
		if (typeof rawName !== "string") {
			throw new RoworkError("Nom de projet manquant.", { hint: "Usage : rowork init <nom>" });
		}

		assertValidProjectName(rawName);

		const displayName = toPascalCase(rawName);
		const packageName = toKebabCase(rawName);
		const parent = typeof context.options["path"] === "string"
			? resolve(context.cwd, context.options["path"])
			: context.cwd;
		const target = join(parent, rawName);

		if (existsSync(target) && readdirSync(target).length > 0 && context.options["force"] !== true) {
			throw new RoworkError(`Le dossier ${target} existe deja et n'est pas vide.`, {
				hint: "Relance avec --force pour ecrire dedans malgre tout.",
			});
		}

		context.logger.info(`Creation de ${pc.bold(displayName)} dans ${target}`);

		mkdirSync(target, { recursive: true });

		context.logger.step("generation de la structure du projet");
		renderTree(join(templatesRoot(), "init"), target, {
			name: displayName,
			packageName,
			roworkVersion: context.roworkVersion,
		});

		context.logger.step(`ecriture de ${CONFIG_FILENAME}`);
		writeFileSync(
			join(target, CONFIG_FILENAME),
			`${JSON.stringify(defaultConfig(displayName), undefined, 2)}\n`,
			"utf8",
		);

		if (context.options["git"] !== false) {
			context.logger.step("initialisation du depot git");
			try {
				await runBinary("git", ["init", "--quiet"], { cwd: target, stdio: "ignore" });
			} catch {
				// git absent ou en echec : ce n'est pas bloquant pour un projet utilisable.
				context.logger.warn("git init a echoue, etape ignoree.");
			}
		}

		if (context.options["install"] !== false) {
			context.logger.step("installation des dependances (npm)");
			context.logger.blank();
			await runBinary("npm", ["install", "--save-dev", ...DEV_DEPENDENCIES], { cwd: target });
			await runBinary("npm", ["install", ...DEPENDENCIES], { cwd: target });
		}

		context.logger.blank();
		context.logger.success(`${displayName} est pret.`);
		context.logger.blank();
		context.logger.info("Etapes suivantes :");
		context.logger.info(`  cd ${rawName}`);
		if (context.options["install"] === false) context.logger.info("  npm install");
		context.logger.info("  rokit install        # installe Rojo a la version epinglee");
		context.logger.info("  npm run watch        # compile le TypeScript en continu");
		context.logger.info("  rojo serve           # puis connecte le plugin Rojo dans Studio");
		context.logger.blank();
	},
});
