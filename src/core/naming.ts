import { RoworkError } from "../cli/errors.js";

const VALID_NAME = /^[A-Za-z][A-Za-z0-9._-]*$/;

export function assertValidProjectName(name: string): void {
	if (!VALID_NAME.test(name)) {
		throw new RoworkError(`\`${name}\` n'est pas un nom de projet valide.`, {
			hint: "Commence par une lettre, puis lettres, chiffres, `.`, `-` ou `_`.",
		});
	}
}

/** `Mon Super Jeu` / `mon-super-jeu` -> `MonSuperJeu` */
export function toPascalCase(value: string): string {
	return value
		.split(/[^A-Za-z0-9]+/)
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

/** `MonSuperJeu` -> `mon-super-jeu` (nom de paquet npm valide) */
export function toKebabCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[^A-Za-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.toLowerCase();
}
