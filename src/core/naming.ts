import { RoworkError } from "../cli/errors.js";

const VALID_NAME = /^[A-Za-z][A-Za-z0-9._-]*$/;

export function assertValidProjectName(name: string): void {
	if (!VALID_NAME.test(name)) {
		throw new RoworkError(`\`${name}\` is not a valid project name.`, {
			hint: "Start with a letter, then letters, digits, `.`, `-` or `_`.",
		});
	}
}

/** `My Cool Game` / `my-cool-game` -> `MyCoolGame` */
export function toPascalCase(value: string): string {
	return value
		.split(/[^A-Za-z0-9]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

/** `MyCoolGame` -> `my-cool-game` (a valid npm package name) */
export function toKebabCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[^A-Za-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}
