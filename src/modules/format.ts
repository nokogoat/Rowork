import type { ModuleDefinition, ModulePlan } from "./types.js";

export const formatModule: ModuleDefinition = {
	name: "format",
	title: "Formatter",
	description: "Format the code the same way for everyone, automatically, with Prettier.",
	dependencies: ["prettier"],
	agentGuide: [
		"Run `npm run format` after editing code: Prettier rewrites `src/` in the project's style (tabs, 100 columns). `npm run format:check` only reports. Do not argue with the formatter or hand-format around it.",
		"Settings live in `.prettierrc.json`; what is never formatted (build output) is in `.prettierignore`.",
	],
	plan(): ModulePlan {
		return {
			files: [
				{ template: "format/prettierrc.json", directory: ".", fileName: ".prettierrc.json", variables: {} },
				{ template: "format/prettierignore", directory: ".", fileName: ".prettierignore", variables: {} },
			],
			register: [],
			scripts: {
				format: "prettier --write src",
				"format:check": "prettier --check src",
			},
			notes: [
				"Format your code:  npm run format      Only check:  npm run format:check",
				"Tabs and 100 columns, to match the code Rowork generates. Change it in .prettierrc.json.",
			],
		};
	},
};
