import * as chrono from 'chrono-node';
import type { Settings } from '$lib/domain/types';
import type { Lang } from '$lib/i18n/lang';

export interface DateMatch {
	dueAt: string;
	/** Ranges of the input to remove from the title. */
	ranges: [number, number][];
}

type Hours = Settings['workHours'];

interface DateRules {
	parser: { parse: typeof chrono.es.parse };
	/** Time-of-day phrases chrono does not understand, or reads in its own way (docs/03, step 2). */
	timePhrases: { pattern: RegExp; time: (hours: Hours) => string }[];
	dayAfterTomorrow: RegExp;
	/** Words that introduce a date and go away with it. Also right after "(". */
	introducer: RegExp;
	/** Words that introduce only a time ("a las 5", "around 5pm"); before a day they stay. */
	timeIntroducer: RegExp;
	/** chrono's text starts with a time of day, not a day. */
	timeFirst: RegExp;
	/** "el viernes pasado" (after the date) / "last Friday" (in chrono's own text). */
	pastAfter?: RegExp;
	pastInText?: RegExp;
	/** "el jueves de la semana que viene" / "Thursday next week". */
	nextWeekAfter: RegExp;
	nextWeekInText?: RegExp;
}

const RULES: Record<Lang, DateRules> = {
	es: {
		parser: chrono.es,
		timePhrases: [
			{ pattern: /\ba primera hora\b/i, time: (h) => h.start },
			{ pattern: /\ba [uú]ltima hora\b/i, time: (h) => h.end },
			{ pattern: /\bpor la tarde\b/i, time: (h) => h.end },
			{ pattern: /\bpor la mañana\b/i, time: () => '12:00' },
			{ pattern: /\b(?:a|al) mediod[ií]a\b/i, time: () => '12:00' }
		],
		dayAfterTomorrow: /\bpasado mañana\b/i,
		// "para el martes", "antes del jueves", "venció ayer", "el cine del sábado", "la clase de mañana".
		introducer:
			/(?:^|[\s(])(?:(?:vence|venci[oó])(?: el| la)?|para el|para la|para|antes del|antes de la|antes de|hasta el|hasta la|hasta|del|de|el|la|los)\s*$/i,
		// "a las 17:30", "sobre las 6", "a eso de las 7"; "hablar sobre mañana" keeps its "sobre".
		timeIntroducer: /(?:^|[\s(])(?:a eso de|alrededor de|sobre|hacia|a)\s*$/i,
		timeFirst: /^(?:las?\s+)?\d/i,
		pastAfter: /^\s+pasad[oa]\b/i,
		nextWeekAfter: /^\s+(?:de\s+)?la\s+(?:semana\s+que\s+viene|pr[oó]xima\s+semana)\b/i
	},
	en: {
		parser: chrono.en,
		timePhrases: [
			{ pattern: /\bfirst thing(?: in the morning)?\b/i, time: (h) => h.start },
			{ pattern: /\b(?:by |at )?(?:the )?end of (?:the )?(?:work(?:ing)? )?day\b/i, time: (h) => h.end },
			{ pattern: /\b(?:late |in the |this )?afternoon\b/i, time: (h) => h.end },
			{ pattern: /\b(?:in the |this )?morning\b/i, time: () => '12:00' },
			{ pattern: /\b(?:at )?(?:noon|midday)\b/i, time: () => '12:00' }
		],
		dayAfterTomorrow: /\b(?:the )?day after tomorrow\b/i,
		// "by Wednesday", "before Thursday", "for Tuesday", "on October 20", "it was due yesterday".
		introducer: /(?:^|[\s(])(?:it was due|was due|is due|due on|due by|due|by|before|until|till|for|on|the)\s*$/i,
		// "around 5pm", "at about 5"; "talk about Monday" keeps its "about".
		timeIntroducer: /(?:^|[\s(])(?:at around|at about|around|about|towards|toward|at)\s*$/i,
		timeFirst: /^(?:at\s+)?\d/i,
		pastInText: /^last\s/i,
		nextWeekAfter: /^\s+(?:of\s+)?next\s+week\b/i,
		nextWeekInText: /\bnext\s+week\b/i
	}
};

function mask(text: string, start: number, end: number): string {
	return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

function withTime(day: Date, time: string): Date {
	const [h, m] = time.split(':').map(Number);
	return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

function shiftDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
}

function introducerStart(text: string, index: number, introducer: RegExp): number {
	const match = introducer.exec(text.slice(0, index));
	if (!match) return index;
	const leading = match[0].match(/^[\s(]*/)?.[0].length ?? 0;
	return match.index + leading;
}

/**
 * Step 2 of docs/03: due date from chrono plus our own expressions, in one
 * language. `text` may have parts blanked out with spaces (same length).
 */
export function extractDate(text: string, now: Date, hours: Hours, lang: Lang = 'es'): DateMatch | null {
	const rules = RULES[lang];
	let masked = text;
	const ranges: [number, number][] = [];
	let timeOverride: string | undefined;

	for (const phrase of rules.timePhrases) {
		const match = phrase.pattern.exec(masked);
		if (!match) continue;
		timeOverride ??= phrase.time(hours);
		ranges.push([match.index, match.index + match[0].length]);
		masked = mask(masked, match.index, match.index + match[0].length);
	}

	const dayAfter = rules.dayAfterTomorrow.exec(masked);
	if (dayAfter) {
		const start = introducerStart(masked, dayAfter.index, rules.introducer);
		ranges.push([start, dayAfter.index + dayAfter[0].length]);
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
		return { dueAt: withTime(day, timeOverride ?? hours.end).toISOString(), ranges };
	}

	const result = rules.parser.parse(masked, now, { forwardDate: true })[0];
	if (!result) {
		if (!timeOverride) return null;
		// Only a time of day ("a primera hora llamar", "end of day close the till"): today, or tomorrow if it has passed.
		let due = withTime(now, timeOverride);
		if (due.getTime() < now.getTime()) due = withTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), timeOverride);
		return { dueAt: due.toISOString(), ranges };
	}

	// A time looks first for its own words: "a eso de" ends in "de", which also introduces days.
	const timeStart = rules.timeFirst.test(result.text) ? introducerStart(masked, result.index, rules.timeIntroducer) : result.index;
	const start = timeStart < result.index ? timeStart : introducerStart(masked, result.index, rules.introducer);
	let end = result.index + result.text.length;
	let parsed = result.start.date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const weekday = now.getDay() || 7;
	const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8 - weekday).getTime();

	const pastAfter = rules.pastAfter?.exec(masked.slice(end));
	const nextWeekAfter = rules.nextWeekAfter.exec(masked.slice(end));
	const isPast = Boolean(pastAfter) || Boolean(rules.pastInText?.test(result.text));
	const isNextWeek = Boolean(nextWeekAfter) || Boolean(rules.nextWeekInText?.test(result.text));
	if (pastAfter) end += pastAfter[0].length;
	else if (nextWeekAfter) end += nextWeekAfter[0].length;

	if (isPast) {
		// The previous one, not the next ("el viernes pasado", "last Friday").
		while (parsed.getTime() >= today) parsed = shiftDays(parsed, -7);
	} else if (isNextWeek) {
		while (parsed.getTime() < nextMonday) parsed = shiftDays(parsed, 7);
	}
	ranges.push([start, end]);

	const due = result.start.isCertain('hour') ? parsed : withTime(parsed, timeOverride ?? hours.end);
	return { dueAt: due.toISOString(), ranges };
}
