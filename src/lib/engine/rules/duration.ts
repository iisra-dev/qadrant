export interface DurationMatch {
	minutes: number;
	range: [number, number];
}

const WORD_NUMBERS: Record<string, number> = {
	un: 1,
	una: 1,
	uno: 1,
	dos: 2,
	tres: 3,
	cuatro: 4,
	cinco: 5,
	seis: 6,
	siete: 7,
	ocho: 8,
	nueve: 9,
	diez: 10
};

const N = `(\\d+|${Object.keys(WORD_NUMBERS).join('|')})`;

function toNumber(value: string): number {
	return WORD_NUMBERS[value.toLowerCase()] ?? Number(value.replace(',', '.'));
}

// From the longest to the shortest, so "una hora y media" is not read as "una hora" (docs/03, step 3).
const PATTERNS: { pattern: RegExp; minutes: (m: RegExpExecArray) => number }[] = [
	{ pattern: new RegExp(`\\b${N} horas? y media\\b`, 'i'), minutes: (m) => toNumber(m[1]) * 60 + 30 },
	{ pattern: /\bhora y media\b/i, minutes: () => 90 },
	{ pattern: /\btres cuartos de hora\b/i, minutes: () => 45 },
	{ pattern: /\bmedia hora\b/i, minutes: () => 30 },
	{ pattern: /\b(?:un )?cuarto de hora\b/i, minutes: () => 15 },
	{ pattern: /\b(\d+) ?h ?(\d+)\b/i, minutes: (m) => Number(m[1]) * 60 + Number(m[2]) },
	{ pattern: /\b(\d+(?:[.,]5)?) ?(?:h|horas?)\b/i, minutes: (m) => toNumber(m[1]) * 60 },
	{ pattern: new RegExp(`\\b${N} horas?\\b`, 'i'), minutes: (m) => toNumber(m[1]) * 60 },
	{ pattern: new RegExp(`\\b${N} ?(?:min|minutos?)\\b`, 'i'), minutes: (m) => toNumber(m[1]) }
];

const DURATION_INTRODUCER =
	/(?:\b(?:durante|al\s+menos|(?:me\s+)?llevar[áa]|me\s+lleva|tardar[ée]|tardo)\s+)?(?:\b(?:unas?|como)\s+)?$/i;

/** Step 3 of docs/03: duration in minutes, on the text left after removing the date. */
export function extractDuration(text: string): DurationMatch | null {
	for (const { pattern, minutes } of PATTERNS) {
		const match = pattern.exec(text);
		if (!match) continue;
		const value = minutes(match);
		if (!Number.isFinite(value) || value <= 0) continue;
		let start = match.index;
		// "durante dos horas", "tardaré 2 h", "me llevará media hora", "al menos 1 hora", "unas 2 horas":
		// the words that introduce the duration go away too.
		const before = DURATION_INTRODUCER.exec(text.slice(0, start));
		if (before && before[0].length) start = before.index;
		return { minutes: Math.round(value), range: [start, match.index + match[0].length] };
	}
	return null;
}
