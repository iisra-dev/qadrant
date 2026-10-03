import type { Person } from '$lib/domain/types';
import type { Lang } from '$lib/i18n/lang';
import { escapeRegExp, fold } from './text';

// Assignment markers (docs/03, step 4), on lowercase text without accents.
const MARKERS: Record<Lang, (name: string) => RegExp[]> = {
	es: (name) => [
		new RegExp(`^que ${name}\\b`),
		new RegExp(`^${name},? que\\b`),
		new RegExp(`\\b(?:pedir|pedirle|pidele|pide|decir|decirle|dile|di|encargar|encargarle|encargale|encarga)\\s+a\\s+${name}\\b`),
		new RegExp(`\\bdelegar(?:lo|la)?\\s+en\\s+${name}\\b`),
		new RegExp(`\\bque\\s+(?:lo|la)\\s+haga\\s+${name}\\b`)
	],
	en: (name) => [
		new RegExp(`^have ${name}\\b`),
		new RegExp(`^get ${name} to\\b`),
		new RegExp(`\\b(?:ask|asking|tell|get|remind)\\s+${name}\\s+to\\b`),
		new RegExp(`\\b(?:delegate|assign|hand)(?:\\s+[\\w']+){0,4}?\\s+(?:to|over to)\\s+${name}\\b`),
		new RegExp(`\\b(?:have|let)\\s+${name}\\s+(?:do|handle)\\b`)
	]
};

/**
 * Step 4 of docs/03: a person only counts as an assignment with an
 * assignment marker. "Llamar a Ana" / "Call Ana" mentions Ana; "Que Ana llame"
 * / "Have Ana call" assigns it. Returns the id of the assigned person.
 */
export function extractAssignee(text: string, people: Person[], lang: Lang = 'es'): string | undefined {
	const folded = fold(text);
	for (const person of people) {
		const names = [person.name, ...person.aliases].map(fold).filter(Boolean).map(escapeRegExp);
		if (!names.length) continue;
		const name = `(?:${names.join('|')})`;
		if (MARKERS[lang](name).some((pattern) => pattern.test(folded))) return person.id;
	}
	return undefined;
}
