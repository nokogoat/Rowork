import type { IntegrationDefinition, ModulePlan } from "./types.js";

/**
 * Glue between modules. Each entry applies once every module it lists is
 * installed, in whichever order they were added.
 */
export const dataReplication: IntegrationDefinition = {
	name: "data-replication",
	title: "player data on the client",
	description: "Sends each player's saved data to their client, for interfaces to read.",
	modules: ["player-data", "networking"],
	agentGuide: [
		"The server sends each player's data to that player's client when it loads and each time it changes (`DataReplicationService`, server). Do not send it by hand.",
		"On the client, inject `PlayerDataController` and use `get()` (undefined until the server has sent it) or `onChanged(cb)`. It is read-only: change data on the server with `PlayerDataService.update`.",
	],
	plan({ config }): ModulePlan {
		const eventsFile = `${config.paths.shared}/data/dataEvents`;
		const dataFile = `${config.paths.shared}/data/PlayerData`;
		return {
			files: [
				{
					template: "data-replication/dataEvents",
					directory: `${config.paths.shared}/data`,
					fileName: "dataEvents.ts",
					variables: { dataImport: `@import:${dataFile}` },
				},
				{
					template: "data-replication/DataReplicationService",
					directory: config.paths.services,
					fileName: "DataReplicationService.ts",
					variables: {
						eventsImport: `@import:${eventsFile}`,
						rateLimitImport: `@import:${config.paths.source}/server/rateLimit`,
					},
				},
				{
					template: "data-replication/PlayerDataController",
					directory: config.paths.controllers,
					fileName: "PlayerDataController.ts",
					variables: { dataImport: `@import:${dataFile}`, eventsImport: `@import:${eventsFile}` },
				},
			],
			register: [
				{ side: "server", directory: config.paths.services },
				{ side: "client", directory: config.paths.controllers },
			],
			notes: [
				"Player data now reaches the client. Client code reads it with PlayerDataController:",
				"  constructor(private readonly playerData: PlayerDataController) {}",
				"  this.playerData.onChanged((data) => { /* update the interface */ });",
			],
		};
	},
};

export const coreIntegrations: IntegrationDefinition[] = [dataReplication];
