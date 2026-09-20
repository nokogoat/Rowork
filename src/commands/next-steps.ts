import pc from "picocolors";

import type { ScaffoldResult } from "../core/scaffold.js";
import type { Logger } from "../plugins/api.js";

/** Same closing message for `init` and `start`, so they can never drift apart. */
export function printNextSteps(logger: Logger, directory: string, result: ScaffoldResult): void {
	logger.blank();
	logger.success(`${result.displayName} is ready.`);
	logger.blank();
	logger.info("Next steps:");
	logger.info(`  cd ${directory}`);
	if (!result.installed) logger.info("  npm install");
	if (result.lintPending) logger.info("  rowork add lint, rowork add format   (they need npm: run them after npm install)");
	if (!result.toolchainReady) logger.info("  rokit install");
	logger.info(`  ${pc.bold("rowork dev")}`);
	logger.blank();
}
