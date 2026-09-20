import { resolve } from "node:path";

import pc from "picocolors";

import { RoworkError } from "../cli/errors.js";
import { findExecutable } from "../core/toolchain.js";
import { assertValidProjectName, toPascalCase } from "../core/naming.js";
import { resolveTarget, scaffoldProject } from "../core/scaffold.js";
import { isVinegarInstalled, needsStudioSetup, setupStudio } from "../core/studio.js";
import { installModulesByName } from "../core/modules.js";
import { coreModules } from "../modules/index.js";
import { defineCommand } from "../plugins/api.js";
import { answered, isInteractive, prompts } from "../ui/prompt.js";
import { printNextSteps } from "./next-steps.js";

export const startCommand = defineCommand({
	name: "start",
	guided: true,
	description: "Guided setup: answer a few questions and get a ready-to-run project.",
	options: [{ flags: "--path <dir>", description: "parent directory to create the project in" }],
	async run(context) {
		if (!isInteractive()) {
			throw new RoworkError("`rowork start` is interactive and needs a terminal.", {
				hint: "In scripts and CI use `rowork init <name>` with its flags instead.",
			});
		}

		prompts.intro(pc.bgCyan(pc.black(" rowork ")) + pc.dim(`  v${context.roworkVersion}`));

		const name = answered(
			await prompts.text({
				message: "What is your game called?",
				placeholder: "MyGame",
				validate(value) {
					try {
						assertValidProjectName((value ?? "").trim());
					} catch (error) {
						return error instanceof RoworkError ? error.message : String(error);
					}
					return undefined;
				},
			}),
		).trim();

		const parent = resolve(
			context.cwd,
			typeof context.options["path"] === "string"
				? context.options["path"]
				: answered(
						await prompts.text({
							message: "Where should it be created?",
							initialValue: ".",
							defaultValue: ".",
						}),
					),
		);

		// Fail on an existing directory now, not after five more questions.
		try {
			resolveTarget({ name, parent, force: false });
		} catch (error) {
			prompts.cancel(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}

		const examples = answered(
			await prompts.confirm({
				message: "Include an example service and controller?",
				initialValue: true,
			}),
		);

		const git = answered(
			await prompts.confirm({ message: "Initialise a git repository?", initialValue: true }),
		);

		const install = answered(
			await prompts.confirm({
				message: "Install npm dependencies now? (roblox-ts, Flamework)",
				initialValue: true,
			}),
		);

		// Ready-made features, chosen up front. They install npm packages, so they need npm.
		let features: string[] = [];
		if (install) {
			features = answered(
				await prompts.multiselect({
					message: "Which ready-made features do you want from the start? (space to tick, enter to confirm. You can add more later with `rowork add`)",
					options: coreModules.map((module) => ({ value: module.name, label: module.title, hint: module.description })),
					initialValues: ["lint"],
					required: false,
				}),
			);
		}

		const rokitFound = findExecutable("rokit", context.cwd) !== undefined;
		let rokit = true;
		let installRokit = false;
		if (rokitFound) {
			rokit = answered(
				await prompts.confirm({
					message: "Install the pinned Roblox toolchain with Rokit? (Rojo)",
					initialValue: true,
				}),
			);
		} else {
			installRokit = answered(
				await prompts.confirm({
					message:
						"Rokit (the Roblox toolchain manager, provides Rojo) is not installed. Download and install it for you? (from github.com/rojo-rbx/rokit into ~/.rokit)",
					initialValue: true,
				}),
			);
			rokit = installRokit;
		}

		// Studio has no Linux build: offer Vinegar, which runs the real one.
		const studio =
			needsStudioSetup() && !isVinegarInstalled()
				? answered(
						await prompts.confirm({
							message:
								"Roblox Studio has no Linux version. Install Vinegar, which runs it through Wine? (Flatpak, current user only)",
							initialValue: true,
						}),
					)
				: false;

		prompts.note(
			[
				`Name       ${toPascalCase(name)}`,
				`Location   ${resolve(parent, name)}`,
				`Examples   ${examples ? "yes" : "no"}`,
				`Git        ${git ? "yes" : "no"}`,
				`npm        ${install ? "install" : "skip"}`,
				`Features   ${features.length > 0 ? features.join(", ") : install ? "none" : "skipped (needs npm)"}`,
				...(studio ? ["Studio     install Vinegar"] : []),
				`Rokit      ${installRokit ? "install Rokit, then the toolchain" : rokit ? "install the toolchain" : "skip"}`,
			].join("\n"),
			"Summary",
		);

		if (!answered(await prompts.confirm({ message: "Create it?", initialValue: true }))) {
			prompts.cancel("Cancelled, nothing was created.");
			return;
		}

		prompts.log.step("Scaffolding");
		const result = await scaffoldProject(
			{
				name,
				parent,
				install,
				rokit,
				installRokit,
				git,
				examples,
				force: false,
				roworkVersion: context.roworkVersion,
			},
			context.logger,
		);

		if (features.length > 0 && result.installed) {
			prompts.log.step("Adding features");
			await installModulesByName(context, result.target, features);
		}

		if (studio) {
			try {
				await setupStudio({ logger: context.logger, projectRoot: result.target, plugin: true });
			} catch (error) {
				// The project is already created: a Studio problem must not undo that.
				context.logger.warn(`Studio setup did not finish: ${error instanceof Error ? error.message : String(error)}`);
				context.logger.info("Retry with `rowork studio:setup`.");
			}
		}

		printNextSteps(context.logger, name, result);
		prompts.outro("Happy building.");
	},
});
