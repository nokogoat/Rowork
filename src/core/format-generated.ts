import { RoworkError } from "../cli/errors.js";
import type { Logger } from "../plugins/api.js";
import { run } from "./exec.js";
import { findExecutable, pathWithLocalBinaries } from "./toolchain.js";

/**
 * Runs the project's own Prettier over files Rowork just wrote or edited.
 *
 * A generator cannot know where a formatter will wrap a line: a long name pushes an import
 * or a tag past the line width and the project's `format:check` then fails on code the
 * user never touched. Asking the formatter itself is the only answer that stays right when
 * its settings change. Nothing to do (and nothing said) when the project has no Prettier:
 * the code is still correct, only laid out a little differently.
 */
export async function formatGenerated(projectRoot: string, files: string[], logger: Logger): Promise<void> {
	if (files.length === 0 || findExecutable("prettier", projectRoot) === undefined) return;
	try {
		await run("prettier", ["--write", ...files], {
			cwd: projectRoot,
			stdio: "ignore",
			env: { PATH: pathWithLocalBinaries(projectRoot) },
		});
	} catch (error) {
		const detail = error instanceof RoworkError ? error.message : String(error);
		logger.warn(`Could not format the new files with Prettier (${detail}). Run \`npm run format\` if your formatter complains.`);
	}
}
