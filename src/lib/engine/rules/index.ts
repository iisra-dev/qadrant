import type { Person, Settings } from '$lib/domain/types';
import type { Lang } from '$lib/i18n/lang';
import { extractDate } from './date';
import { extractDuration } from './duration';
import { extractAssignee } from './person';
import { normalize, removeRanges, tidyTitle, widenToParentheses } from './text';

export interface Extraction {
	title: string;
	dueAt?: string;
	durationMin?: number;
	/** Set only for an assignment (person plus marker). */
	personId?: string;
}

type Ctx = { now: Date; people: Person[]; settings: Pick<Settings, 'workHours'> & Partial<Pick<Settings, 'language'>> };

function blank(text: string, [start, end]: [number, number]): string {
	return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

/** Date and duration in one language. English finds durations first: chrono.en reads "2 h" as a time. */
function readIn(lang: Lang, input: string, ctx: Ctx): { extraction: Omit<Extraction, 'personId'>; score: number } {
	const hours = ctx.settings.workHours;
	let date;
	let duration;
	let title: string;
	if (lang === 'en') {
		duration = extractDuration(input, 'en');
		const durationRange = duration && widenToParentheses(input, duration.range);
		date = extractDate(durationRange ? blank(input, durationRange) : input, ctx.now, hours, 'en');
		const ranges = [...(date?.ranges.map((r) => widenToParentheses(input, r)) ?? []), ...(durationRange ? [durationRange] : [])];
		title = tidyTitle(removeRanges(input, ranges));
	} else {
		date = extractDate(input, ctx.now, hours, 'es');
		const withoutDate = date ? removeRanges(input, date.ranges.map((r) => widenToParentheses(input, r))) : input;
		duration = extractDuration(withoutDate, 'es');
		const rest = duration ? removeRanges(withoutDate, [widenToParentheses(withoutDate, duration.range)]) : withoutDate;
		title = tidyTitle(rest);
	}
	return {
		extraction: {
			title: title || tidyTitle(input),
			...(date && { dueAt: date.dueAt }),
			...(duration && { durationMin: duration.minutes })
		},
		// A date says more about the language than a duration ("2 h" reads the same in both);
		// on a tie, the reading that understood more of the text wins ("el viernes a las 17:30" over "17:30").
		score: (date ? 2 : 0) + (duration ? 1 : 0) + (input.length - title.length) / 1000
	};
}

/**
 * Steps 1-4 of docs/03, deterministic and without the model. Reads the task in
 * both languages and keeps the reading that recognises more; on a tie, the
 * interface language wins.
 */
export function extract(text: string, ctx: Ctx): Extraction {
	const input = normalize(text);
	const primary: Lang = ctx.settings.language ?? 'es';
	const other: Lang = primary === 'en' ? 'es' : 'en';

	const first = readIn(primary, input, ctx);
	const second = readIn(other, input, ctx);
	const read = second.score > first.score ? second : first;
	const personId = extractAssignee(input, ctx.people, primary) ?? extractAssignee(input, ctx.people, other);
	return { ...read.extraction, ...(personId && { personId }) };
}
