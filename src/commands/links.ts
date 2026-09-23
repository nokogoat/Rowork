import { RoworkError } from "../cli/errors.js";
import { generateFile, importPath } from "../core/generate.js";
import {
	listEvents,
	listStats,
	pascal,
	statServiceClass,
	type DependencyInfo,
	type EventInfo,
	type StatInfo,
} from "../core/project-index.js";
import { toFieldName } from "../modules/player-data.js";
import type { RoworkConfig } from "../plugins/api.js";
import { answered, prompts } from "../ui/prompt.js";

/**
 * "Link it to ...?" for the guided `make:` commands.
 *
 * The person types the name of something that already exists, or leaves it empty
 * for no link. Free text rather than a closed list, on purpose: it is faster for
 * someone who knows the name, and what is available is printed in the question.
 */
async function askName(message: string, available: string[]): Promise<string | undefined> {
	const raw = answered(
		await prompts.text({
			message: `${message} Available: ${available.join(", ")}. Leave empty for none.`,
			placeholder: available[0] ?? "",
			defaultValue: "",
			validate: (value) => {
				const typed = (value ?? "").trim();
				if (typed === "") return undefined;
				return typed.split(",").every((part) => available.includes(toFieldName(part))) ? undefined : `Pick from: ${available.join(", ")}`;
			},
		}),
	);
	return raw.trim() === "" ? undefined : raw;
}

/** Turns typed names into the matching stats, or explains what exists. */
export function resolveStats(stats: StatInfo[], typed: string, what: string): StatInfo[] {
	const wanted = typed.split(",").map((part) => toFieldName(part)).filter((part) => part !== "");
	const found = wanted.map((name) => stats.find((stat) => stat.name === name));
	const missing = wanted.filter((_, index) => found[index] === undefined);
	if (missing.length > 0) {
		throw new RoworkError(`No saved value called ${missing.map((name) => `\`${name}\``).join(", ")}.`, {
			hint: stats.length === 0 ? `There are no saved values yet: create one with \`rowork make:stat\`, then ${what}.` : `Saved values: ${stats.map((stat) => stat.name).join(", ")}.`,
		});
	}
	return found as StatInfo[];
}

export function resolveEvent(events: EventInfo[], typed: string): EventInfo {
	const name = toFieldName(typed);
	const event = events.find((candidate) => candidate.name === name && candidate.direction === "server");
	if (event === undefined) {
		const available = events.filter((candidate) => candidate.direction === "server").map((candidate) => candidate.name);
		throw new RoworkError(`No event from the client called \`${name}\`.`, {
			hint: available.length === 0 ? "There is none yet: create one with `rowork make:event`." : `Events the client sends: ${available.join(", ")}.`,
		});
	}
	return event;
}

export async function askStatLink(root: string, config: RoworkConfig, message: string, single: boolean): Promise<string | undefined> {
	const stats = listStats(root, config);
	if (stats.length === 0) return undefined;
	return askName(message, stats.map((stat) => stat.name)).then((typed) => (single && typed !== undefined ? typed.split(",")[0] : typed));
}

export async function askEventLink(root: string, config: RoworkConfig, message: string): Promise<string | undefined> {
	const events = listEvents(root, config).filter((event) => event.direction === "server");
	if (events.length === 0) return undefined;
	return askName(message, events.map((event) => event.name));
}

interface Access {
	imports: string[];
	ctor: string[];
	/** How to reach the value from the class body, for a number: an `add` call. */
	add: (stat: StatInfo) => string;
}

/**
 * How generated code reaches saved values: through a stat's own service when
 * `make:stat` created one, otherwise through PlayerDataService.
 */
function accessFor(root: string, config: RoworkConfig, stats: StatInfo[]): Access {
	const imports: string[] = [];
	const ctor: string[] = [];
	let usesData = false;

	for (const stat of stats) {
		const service = statServiceClass(root, config, stat.name);
		if (service !== undefined) {
			imports.push(`import { ${service} } from "./${service}";`);
			ctor.push(`private readonly ${stat.name}: ${service}`);
		} else usesData = true;
	}
	if (usesData) {
		imports.push('import { PlayerDataService } from "./PlayerDataService";');
		ctor.push("private readonly playerData: PlayerDataService");
	}

	return {
		imports,
		ctor,
		add: (stat) =>
			statServiceClass(root, config, stat.name) !== undefined
				? `this.${stat.name}.add(player, 1);`
				: `this.playerData.update(player, (data) => {\n\t\t\t\tdata.${stat.name} += 1;\n\t\t\t\treturn data;\n\t\t\t});`,
	};
}

/**
 * A server-side handler for an event the client sends, wired to a saved value.
 *
 * The amount is fixed here and never read from the event: a client that could
 * choose the amount could give itself anything. The comments say so, because the
 * next person to edit this file is exactly the one tempted to "just use the
 * amount the client sent".
 */
export function createEventHandler(options: {
	root: string;
	config: RoworkConfig;
	event: { name: string };
	stat: StatInfo;
}): { path: string; className: string } {
	const { root, config, event, stat } = options;
	const className = `${pascal(event.name)}Handler`;
	const access = accessFor(root, config, [stat]);

	const body =
		stat.type === "number"
			? [
					`\t\t\t// The amount is decided HERE, on the server. Do not use a number the client sent:`,
					`\t\t\t// a player could send any amount and give themselves anything.`,
					`\t\t\t${access.add(stat)}`,
				].join("\n")
			: `\t\t\t// TODO: change \`${stat.name}\` here, deciding the new value on the server. Never copy what the client sent.`;

	const services = config.paths.services;
	const written = generateFile({
		projectRoot: root,
		directory: services,
		fileName: `${className}.ts`,
		template: "event-handler",
		variables: {
			className,
			event: event.name,
			networkImport: importPath(root, services, `${config.paths.source}/server/network`),
			imports: stat.type === "number" ? access.imports.join("\n") : "",
			ctor: stat.type === "number" ? access.ctor.join(", ") : "",
			body,
		},
		force: false,
	});
	return { path: written ?? `${services}/${className}.ts`, className };
}

/**
 * A constructor, laid out the way Prettier does: one parameter property per line as soon as there
 * are several. `superCall` is needed for a class that extends another one (a component extends
 * `BaseComponent`): TypeScript refuses a constructor in a derived class with no `super()` call.
 */
function constructorSource(params: string[], superCall?: string): string {
	const opening = params.length <= 1 ? `\tconstructor(${params.join("")}) {` : `\tconstructor(\n${params.map((param) => `\t\t${param},`).join("\n")}\n\t) {`;
	if (superCall === undefined) return params.length <= 1 ? `${opening}}` : `${opening}\n\t}`;
	return `${opening}\n\t\t${superCall}\n\t}`;
}

/** Constructor injection for a service that uses saved values. */
export function serviceMembers(root: string, config: RoworkConfig, stats: StatInfo[]): { imports: string; members: string } {
	if (stats.length === 0) return { imports: "", members: "" };
	const access = accessFor(root, config, stats);

	// How to reach each value, written where the next reader will look.
	const howTo = stats.map((stat) => {
		const viaService = statServiceClass(root, config, stat.name) !== undefined;
		if (!viaService) return `\t//   ${stat.name}: this.playerData.get(player)?.${stat.name}, or this.playerData.update(player, (data) => { ...; return data; })`;
		return `\t//   ${stat.name}: this.${stat.name}.get(player), this.${stat.name}.set(player, value)${stat.type === "number" ? `, this.${stat.name}.add(player, amount)` : ""}`;
	});

	return {
		// A blank line after the imports, as in a file written by hand.
		imports: `${access.imports.join("\n")}\n`,
		members: `\t// Saved values this service works with:\n${howTo.join("\n")}\n${constructorSource(access.ctor)}\n\n`,
	};
}

/** Turns typed names into the matching services or controllers, or explains what exists. */
export function resolveDependencies(available: DependencyInfo[], typed: string, kind: "service" | "controller"): DependencyInfo[] {
	const wanted = typed.split(",").map((part) => toFieldName(part)).filter((part) => part !== "");
	const found = wanted.map((name) => available.find((dependency) => dependency.name === name));
	const missing = wanted.filter((_, index) => found[index] === undefined);
	if (missing.length > 0) {
		throw new RoworkError(`No ${kind} called ${missing.map((name) => `\`${name}\``).join(", ")}.`, {
			hint:
				available.length === 0
					? `There is no ${kind} yet: create one with \`rowork make:${kind}\`, then try again.`
					: `${kind === "service" ? "Services" : "Controllers"}: ${available.map((dependency) => dependency.name).join(", ")}.`,
		});
	}
	return found as DependencyInfo[];
}

export async function askDependencyLink(available: DependencyInfo[], message: string): Promise<string | undefined> {
	if (available.length === 0) return undefined;
	return askName(message, available.map((dependency) => dependency.name));
}

/**
 * Constructor injection for a component or controller that uses existing services or controllers,
 * the way `serviceMembers` does it for saved values: imported and injected, never wired by hand.
 */
export function dependencyMembers(
	root: string,
	fromDirectory: string,
	sourceDirectory: string,
	dependencies: DependencyInfo[],
	options: { superCall?: string } = {},
): { imports: string; members: string } {
	if (dependencies.length === 0) return { imports: "", members: "" };
	const imports = dependencies.map(
		(dependency) => `import { ${dependency.className} } from "${importPath(root, fromDirectory, `${sourceDirectory}/${dependency.className}`)}";`,
	);
	const ctor = dependencies.map((dependency) => `private readonly ${dependency.name}: ${dependency.className}`);
	return {
		imports: `${imports.join("\n")}\n`,
		members: `${constructorSource(ctor, options.superCall)}\n\n`,
	};
}
