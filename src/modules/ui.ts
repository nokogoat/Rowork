import { RoworkError } from "../cli/errors.js";
import { findStudioDataDirectories, installReleasePlugin, needsStudioSetup, UI_LABS } from "../core/studio.js";
import type { ModuleDefinition, ModulePlan, PlanInput } from "./types.js";

export const uiModule: ModuleDefinition = {
	name: "ui",
	title: "User interface (React)",
	description: "Build your interface with React, and preview each component in Studio without running the game.",
	dependencies: ["@rbxts/react", "@rbxts/react-roblox", "@rbxts/ui-labs"],
	asksQuestions: false,
	options: [{ flags: "--no-plugin", description: "do not install the UI Labs preview plugin in Studio" }],
	agentGuide: [
		"The interface is React (`@rbxts/react`), in `src/client/ui/`. One component per file: a function that returns JSX. Lowercase tags (`frame`, `textbutton`, `textlabel`...) are Roblox instances; your own components start with a capital. Use hooks (`useState`, `useEffect`); do not create or change Instances by hand inside a component.",
		"Roblox events in JSX use `Event={{ Activated: () => ... }}`; properties are the Roblox property names (`Size`, `Position`, `BackgroundColor3`...).",
		"For each component add a `Name.story.tsx` next to it (see `Button.story.tsx`): it shows the component alone in Studio through the UI Labs plugin. `UiController` mounts `App` on the player's screen; new screens are components used by `App`.",
		"The interface reads data from the server: with the `player-data` and `networking` modules, use `PlayerDataController` (`get()`, `onChanged`) rather than asking again. Never trust the client for game rules: a button sends an event, the server decides.",
	],
	plan({ config }: PlanInput): ModulePlan {
		const ui = `${config.paths.source}/client/ui`;
		return {
			files: [
				{ template: "ui/App.tsx", directory: ui, fileName: "App.tsx", variables: {} },
				{ template: "ui/Button.tsx", directory: ui, fileName: "Button.tsx", variables: {} },
				{ template: "ui/Button.story.tsx", directory: ui, fileName: "Button.story.tsx", variables: {} },
				{
					template: "ui/UiController.tsx",
					directory: config.paths.controllers,
					fileName: "UiController.tsx",
					variables: { appImport: `@import:${ui}/App` },
				},
			],
			register: [{ side: "client", directory: config.paths.controllers }],
			// roblox-ts turns JSX into calls to this factory: it must be React's.
			compilerOptions: { jsx: "react", jsxFactory: "React.createElement", jsxFragmentFactory: "React.Fragment" },
			// React is built on the @rbxts-js packages: if the game does not contain them, the interface never starts.
			nodeModuleScopes: ["@rbxts-js"],
			notes: [
				`Your interface starts in ${ui}/App.tsx. \`npm run build\` compiles it; UiController puts it on screen.`,
				"To see a component without running the game, open the UI Labs plugin in Studio: it lists every *.story.tsx.",
			],
		};
	},

	async postInstall({ logger, options }): Promise<void> {
		if (options["plugin"] === false) return;

		if (!needsStudioSetup()) {
			logger.info(`Install the UI Labs plugin in Studio to preview components: ${UI_LABS.store}`);
			return;
		}

		const directories = findStudioDataDirectories();
		if (directories.length === 0) {
			logger.warn("Studio has not been launched yet, so the UI Labs plugin was not installed.");
			logger.info("Run `rowork studio`, sign in, close Studio, then `rowork studio:setup`: it places the plugin.");
			return;
		}
		try {
			await installReleasePlugin(directories, UI_LABS, logger);
			logger.info("Restart Studio to load the UI Labs plugin.");
		} catch (error) {
			throw new RoworkError(error instanceof Error ? error.message : String(error), {
				hint: `Install it from the Creator Store instead: ${UI_LABS.store}`,
			});
		}
	},
};
