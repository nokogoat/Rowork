import { RoworkError } from "../cli/errors.js";
import type { ModuleDefinition, ModulePlan } from "./types.js";

/** ESLint 10 runs on Node 20.19+, 22.13+ or 24+. Rowork itself accepts any Node 20. */
export function nodeSupportsEslint(version = process.versions.node): boolean {
	const [major = 0, minor = 0] = version.split(".").map(Number);
	return (major === 20 && minor >= 19) || (major === 22 && minor >= 13) || major >= 24;
}

export const lintModule: ModuleDefinition = {
	name: "lint",
	title: "Linter",
	description: "Catch roblox-ts mistakes (any, null, unsupported code) early, with ESLint and the official roblox-ts rules.",
	dependencies: ["eslint", "@typescript-eslint/parser", "eslint-plugin-roblox-ts"],
	agentGuide: [
		"Run `npm run lint` (and `npm run lint:fix` for what can be fixed automatically) before considering a change done, in addition to `npm run build`.",
		"The rules are the official roblox-ts ones: no `any`, no `null` (use `undefined`), and code Luau cannot express. Fix the code rather than disabling a rule. Settings live in `eslint.config.mjs`.",
	],
	plan(): ModulePlan {
		if (!nodeSupportsEslint()) {
			throw new RoworkError(`The linter needs a newer Node than ${process.versions.node}.`, {
				hint: "ESLint 10 runs on Node 20.19+, 22.13+ or 24+. Update Node, then run `rowork add lint`.",
			});
		}
		return {
			files: [
				{
					template: "lint/eslint.config.mjs",
					directory: ".",
					fileName: "eslint.config.mjs",
					variables: {},
				},
			],
			register: [],
			scripts: {
				lint: "eslint src",
				"lint:fix": "eslint src --fix",
			},
			notes: [
				"Check your code:  npm run lint      Fix what can be fixed:  npm run lint:fix",
				"The rules are the official roblox-ts ones (no `any`, no `null`...). Change them in eslint.config.mjs.",
			],
		};
	},
};
