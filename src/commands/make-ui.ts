import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { RoworkError } from "../cli/errors.js";
import { resolveProjectPath } from "../core/config.js";
import { formatGenerated } from "../core/format-generated.js";
import { generateFile, toClassBase } from "../core/generate.js";
import { installModule } from "../core/modules.js";
import {
	ELEMENTS_MARKER,
	addElementToScreen,
	addScreenToApp,
	listScreens,
	screensDirectory,
	screensSupported,
	uiDirectory,
} from "../core/ui-edit.js";
import { uiModule } from "../modules/ui.js";
import { defineCommand, type CommandContext, type RoworkConfig } from "../plugins/api.js";
import { answered, prompts } from "../ui/prompt.js";
import { nameOrAsk, requireProject } from "./make.js";

const NAME_ARGUMENT = { name: "name", description: "the name, e.g. Shop (omit it for the guided version)", required: false };

function read(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/**
 * Makes sure the project has an interface that screens can be added to. Guided, a missing
 * `ui` module is offered and installed on the spot; scripted, the one command that fixes it
 * is printed. A project whose interface predates screens is told exactly what to change.
 */
async function ensureInterface(context: CommandContext, root: string, config: RoworkConfig, guided: boolean, command: string): Promise<void> {
	if (!(config.modules ?? []).includes("ui")) {
		if (!guided) {
			throw new RoworkError("There is no interface to add this to.", { hint: "Run `rowork add:ui` first, then try again." });
		}
		const proceed = answered(
			await prompts.confirm({ message: "Your project has no interface yet. Add the UI module (React) now?", initialValue: true }),
		);
		if (!proceed) {
			prompts.cancel("Nothing changed.");
			process.exit(0);
		}
		await installModule({ ...context, options: {} }, uiModule, root, false);
		return;
	}

	const state = screensSupported(root, config, read);
	if (!state.ok) {
		throw new RoworkError(`This project's interface predates screens: ${state.reason}.`, {
			hint: [
				`\`rowork ${command}\` adds to two files, and needs them to look like a new project's:`,
				"  - UiController.tsx draws with:  createRoot(new Instance(\"Folder\")).render(createPortal(<App />, playerGui));   (import createPortal from \"@rbxts/react-roblox\")",
				"  - App.tsx returns a fragment listing the screens, with a `{/* rowork:screens */}` line after them.",
				"See docs/modules.md, section \"User interface\", for the full example.",
			].join("\n      "),
		});
	}
}

export const makeScreenCommand = defineCommand({
	name: "make:screen",
	description: "Create a screen (a ScreenGui) and show it from App, ready to fill with elements.",
	guided: true,
	arguments: [NAME_ARGUMENT],
	async run(context) {
		const { root, config } = requireProject(context, "make:screen");
		const { name: typed, guided } = await nameOrAsk(context, "make:screen", "What is the screen called? (e.g. Shop, Inventory, Settings)", "Shop");

		const base = toClassBase(typed);
		const screenName = base.endsWith("Screen") && base.length > "Screen".length ? base.slice(0, -"Screen".length) : base;
		const className = `${screenName}Screen`;

		await ensureInterface(context, root, config, guided, "make:screen");

		const screenFile = `${screensDirectory(config)}/${className}.tsx`;
		if (existsSync(resolveProjectPath(root, screenFile))) {
			throw new RoworkError(`${screenFile} already exists.`, {
				hint: "Pick another name. To start this screen again, delete the file and its line in App.tsx.",
			});
		}

		// Computed before anything is written: a refusal leaves the project as it was.
		const appFile = `${uiDirectory(config)}/App.tsx`;
		const appPath = resolveProjectPath(root, appFile);
		const appSource = read(appPath);
		if (appSource === undefined) throw new RoworkError(`Cannot read ${appFile}.`, { hint: "It is created by `rowork add:ui`." });
		const newApp = addScreenToApp(appSource, appFile, className, `./screens/${className}`);

		const written = generateFile({
			projectRoot: root,
			directory: screensDirectory(config),
			fileName: `${className}.tsx`,
			template: "screen.tsx",
			variables: { name: screenName, className, elementsMarker: ELEMENTS_MARKER },
			force: false,
		});
		writeFileSync(appPath, newApp, "utf8");
		await formatGenerated(root, [appPath, resolveProjectPath(root, screenFile)], context.logger);

		context.logger.success(`Created the ${screenName} screen (${written ?? screenFile})`);
		context.logger.step(`${appFile}: shows <${className} />`);
		context.logger.blank();
		context.logger.info("Press Play in Studio: a placeholder title shows at the top of the screen, delete it when you add your own.");
		context.logger.info(`Add things to it:  rowork make:ui <name> --in ${screenName}`);
	},
});

type Kind = "button" | "label" | "panel" | "image";

const KINDS: Record<Kind, { label: string; hint: string; controls: string; binding: string }> = {
	button: { label: "Button", hint: "text and a click", controls: '{ text: "Click me" }', binding: "text={props.controls.text}" },
	label: { label: "Text", hint: "a piece of text", controls: '{ text: "Hello" }', binding: "text={props.controls.text}" },
	panel: { label: "Panel", hint: "a rounded box with a title, that holds other elements", controls: '{ title: "Panel" }', binding: "title={props.controls.title}" },
	image: { label: "Image", hint: "a picture (upload files with `rowork assets`)", controls: '{ image: "" }', binding: "image={props.controls.image}" },
};

export const makeUiCommand = defineCommand({
	name: "make:ui",
	description: "Create a reusable interface element (button, text, panel, image) with its Studio preview, and place it in a screen.",
	guided: true,
	arguments: [NAME_ARGUMENT],
	options: [
		{ flags: "--kind <kind>", description: "button (default), label, panel or image" },
		{ flags: "--in <screen>", description: "place it in this screen, e.g. Home (see the screens in the ui folder)" },
	],
	async run(context) {
		const { root, config } = requireProject(context, "make:ui");
		const { name: typed, guided } = await nameOrAsk(context, "make:ui", "What is the element called? (e.g. HealthBar, ShopButton)", "ShopButton");
		const name = toClassBase(typed);

		let kind: Kind = "button";
		const askedKind = context.options["kind"];
		if (typeof askedKind === "string") {
			if (!(askedKind in KINDS)) {
				throw new RoworkError(`Unknown kind \`${askedKind}\`.`, { hint: "Use button, label, panel or image." });
			}
			kind = askedKind as Kind;
		} else if (guided) {
			kind = answered(
				await prompts.select({
					message: "What kind of element is it?",
					options: (Object.keys(KINDS) as Kind[]).map((value) => ({ value, label: KINDS[value].label, hint: KINDS[value].hint })),
				}),
			) as Kind;
		}

		await ensureInterface(context, root, config, guided, "make:ui");

		// "Place it in...?": a screen to put it in, so it shows up without editing anything.
		const screens = listScreens(root, config);
		let placeIn: string | undefined;
		if (typeof context.options["in"] === "string") {
			const wanted = context.options["in"];
			placeIn = screens.find((screen) => screen.toLowerCase() === wanted.replace(/Screen$/i, "").toLowerCase());
			if (placeIn === undefined) {
				throw new RoworkError(`There is no screen called \`${wanted}\`.`, {
					hint: screens.length === 0 ? "Create one with `rowork make:screen <name>`." : `Screens: ${screens.join(", ")}.`,
				});
			}
		} else if (guided && screens.length > 0) {
			const chosen = answered(
				await prompts.select({
					message: "Put it in a screen now?",
					options: [
						...screens.map((screen) => ({ value: screen, label: screen })),
						{ value: "", label: "Not yet", hint: "just create it, I will place it myself" },
					],
				}),
			);
			placeIn = chosen === "" ? undefined : chosen;
		}

		const uiDir = uiDirectory(config);
		const componentFile = `${uiDir}/${name}.tsx`;
		const storyFile = `${uiDir}/${name}.story.tsx`;
		for (const file of [componentFile, storyFile]) {
			if (existsSync(resolveProjectPath(root, file))) {
				throw new RoworkError(`${file} already exists.`, { hint: "Pick another name." });
			}
		}

		// The screen edit is computed first, so a refusal leaves the project as it was.
		let screenEdit: { path: string; file: string; source: string } | undefined;
		if (placeIn !== undefined) {
			const file = `${screensDirectory(config)}/${placeIn}Screen.tsx`;
			const path = resolveProjectPath(root, file);
			const source = read(path);
			if (source === undefined) throw new RoworkError(`Cannot read ${file}.`);
			screenEdit = { path, file, source: addElementToScreen(source, file, name, `../${name}`) };
		}

		const written = generateFile({
			projectRoot: root,
			directory: uiDir,
			fileName: `${name}.tsx`,
			template: `ui-${kind}.tsx`,
			variables: { name },
			force: false,
		});
		const story = generateFile({
			projectRoot: root,
			directory: uiDir,
			fileName: `${name}.story.tsx`,
			template: "ui-story.tsx",
			variables: { name, controls: KINDS[kind].controls, binding: KINDS[kind].binding },
			force: false,
		});
		if (screenEdit !== undefined) writeFileSync(screenEdit.path, screenEdit.source, "utf8");
		await formatGenerated(
			root,
			[resolveProjectPath(root, componentFile), resolveProjectPath(root, storyFile), ...(screenEdit === undefined ? [] : [screenEdit.path])],
			context.logger,
		);

		context.logger.success(`Created ${KINDS[kind].label.toLowerCase()} ${name} (${written ?? componentFile})`);
		context.logger.step(`${story ?? storyFile}: its preview for the UI Labs plugin in Studio`);
		if (screenEdit !== undefined) {
			context.logger.step(`${screenEdit.file}: places <${name} />`);
			context.logger.blank();
			context.logger.info("Press Play in Studio to see it.");
		} else {
			context.logger.blank();
			context.logger.info(`It is not shown anywhere yet. Place it in a screen with  rowork make:ui ${name} --in <screen>  (or write <${name} /> in a screen yourself).`);
		}
	},
});
