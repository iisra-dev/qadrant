import type { Lang } from '$lib/i18n/lang';

export interface DurationMatch {
	minutes: number;
	range: [number, number];
}

type Pattern = { pattern: RegExp; minutes: (m: RegExpExecArray) => number };

const WORDS: Record<Lang, Record<string, number>> = {
	es: { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 },
	en: { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
};

function numberIn(lang: Lang) {
	return (value: string) => WORDS[lang][value.toLowerCase()] ?? Number(value.replace(',', '.'));
}

const N_ES = `(\\d+|${Object.keys(WORDS.es).join('|')})`;
const N_EN = `(\\d+|${Object.keys(WORDS.en).join('|')})`;
const es = numberIn('es');
const en = numberIn('en');

// From the longest to the shortest, so "una hora y media" is not read as "una hora" (docs/03, step 3).
const PATTERNS: Record<Lang, Pattern[]> = {
	es: [
		{ pattern: new RegExp(`\\b${N_ES} horas? y media\\b`, 'i'), minutes: (m) => es(m[1]) * 60 + 30 },
		{ pattern: /\bhora y media\b/i, minutes: () => 90 },
		{ pattern: /\btres cuartos de hora\b/i, minutes: () => 45 },
		{ pattern: /\bmedia hora\b/i, minutes: () => 30 },
		{ pattern: /\b(?:un )?cuarto de hora\b/i, minutes: () => 15 },
		{ pattern: /\b(\d+) ?h ?(\d+)\b/i, minutes: (m) => Number(m[1]) * 60 + Number(m[2]) },
		{ pattern: /\b(\d+(?:[.,]5)?) ?(?:h|horas?)\b/i, minutes: (m) => es(m[1]) * 60 },
		{ pattern: new RegExp(`\\b${N_ES} horas?\\b`, 'i'), minutes: (m) => es(m[1]) * 60 },
		{ pattern: new RegExp(`\\b${N_ES} ?(?:min|minutos?)\\b`, 'i'), minutes: (m) => es(m[1]) }
	],
	en: [
		{ pattern: new RegExp(`\\b${N_EN} and a half hours?\\b`, 'i'), minutes: (m) => en(m[1]) * 60 + 30 },
		{ pattern: /\ban? hour and a half\b/i, minutes: () => 90 },
		{ pattern: /\bthree quarters of an hour\b/i, minutes: () => 45 },
		{ pattern: /\bhalf an hour\b|\bhalf hour\b/i, minutes: () => 30 },
		{ pattern: /\b(?:a )?quarter (?:of an )?hour\b/i, minutes: () => 15 },
		{ pattern: /\b(\d+) ?h ?(\d+)\b/i, minutes: (m) => Number(m[1]) * 60 + Number(m[2]) },
		{ pattern: /\b(\d+(?:\.5)?) ?(?:h|hrs?|hours?)\b/i, minutes: (m) => en(m[1]) * 60 },
		{ pattern: new RegExp(`\\b${N_EN} hours?\\b`, 'i'), minutes: (m) => en(m[1]) * 60 },
		{ pattern: new RegExp(`\\b${N_EN} ?(?:min|mins|minutes?)\\b`, 'i'), minutes: (m) => en(m[1]) }
	]
};

// Words that introduce the duration and go away with it:
// "durante dos horas", "tardaré 2 h", "me llevará media hora", "al menos 1 hora", "unas 2 horas";
// "for about 2 hours", "it will take 20 minutes", "at least an hour".
const INTRODUCER: Record<Lang, RegExp> = {
	es: /(?:\b(?:durante|al\s+menos|(?:me\s+)?llevar[áa]|me\s+lleva|tardar[ée]|tardo)\s+)?(?:\b(?:unas?|como)\s+)?$/i,
	en: /(?:\b(?:for|takes?|it(?:'ll|\s+will)\s+take|will\s+take|at\s+least)\s+)?(?:\b(?:about|around|roughly|approximately|some)\s+)?$/i
};

/** Step 3 of docs/03: duration in minutes. */
export function extractDuration(text: string, lang: Lang = 'es'): DurationMatch | null {
	for (const { pattern, minutes } of PATTERNS[lang]) {
		const match = pattern.exec(text);
		if (!match) continue;
		const value = minutes(match);
		if (!Number.isFinite(value) || value <= 0) continue;
		let start = match.index;
		const before = INTRODUCER[lang].exec(text.slice(0, start));
		if (before && before[0].length) start = before.index;
		return { minutes: Math.round(value), range: [start, match.index + match[0].length] };
	}
	return null;
}
