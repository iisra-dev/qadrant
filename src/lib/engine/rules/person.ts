import type { Person } from '$lib/domain/types';
import { escapeRegExp, fold } from './text';

/**
 * Step 4 of docs/03: a person only counts as an assignment with an
 * assignment marker. "Llamar a Ana" mentions Ana; "Que Ana llame" assigns it.
 * Returns the id of the assigned person.
 */
export function extractAssignee(text: string, people: Person[]): string | undefined {
	const folded = fold(text);
	for (const person of people) {
		const names = [person.name, ...person.aliases].map(fold).filter(Boolean).map(escapeRegExp);
		if (!names.length) continue;
		const name = `(?:${names.join('|')})`;
		const patterns = [
			new RegExp(`^que ${name}\\b`),
			new RegExp(`^${name},? que\\b`),
			new RegExp(`\\b(?:pedir|pedirle|pidele|pide|decir|decirle|dile|di|encargar|encargarle|encargale|encarga)\\s+a\\s+${name}\\b`),
			new RegExp(`\\bdelegar(?:lo|la)?\\s+en\\s+${name}\\b`),
			new RegExp(`\\bque\\s+(?:lo|la)\\s+haga\\s+${name}\\b`)
		];
		if (patterns.some((pattern) => pattern.test(folded))) return person.id;
	}
	return undefined;
}
