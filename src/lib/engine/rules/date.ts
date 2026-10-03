import * as chrono from 'chrono-node';
import type { Settings } from '$lib/domain/types';

export interface DateMatch {
	dueAt: string;
	/** Ranges of the input to remove from the title. */
	ranges: [number, number][];
}

type Hours = Settings['workHours'];

// Time-of-day phrases chrono does not understand, or reads as "tomorrow" (docs/03, step 2).
const TIME_PHRASES: { pattern: RegExp; time: (hours: Hours) => string }[] = [
	{ pattern: /\ba primera hora\b/i, time: (h) => h.start },
	{ pattern: /\ba [uú]ltima hora\b/i, time: (h) => h.end },
	{ pattern: /\bpor la tarde\b/i, time: (h) => h.end },
	{ pattern: /\bpor la mañana\b/i, time: () => '12:00' },
	{ pattern: /\b(?:a|al) mediod[ií]a\b/i, time: () => '12:00' }
];

const DAY_AFTER_TOMORROW = /\bpasado mañana\b/i;

// Words that introduce a date and go away with it: "para el martes", "antes del jueves", "venció ayer".
const INTRODUCER =
	/(?:^|\s)(?:(?:vence|venci[oó])(?: el| la)?|para el|para la|para|antes del|antes de la|antes de|hasta el|hasta la|hasta|el|la|los)\s*$/i;

function mask(text: string, start: number, end: number): string {
	return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

function withTime(day: Date, time: string): Date {
	const [h, m] = time.split(':').map(Number);
	return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

function introducerStart(text: string, index: number): number {
	const match = INTRODUCER.exec(text.slice(0, index));
	if (!match) return index;
	const leading = match[0].match(/^\s*/)?.[0].length ?? 0;
	return match.index + leading;
}

/** Step 2 of docs/03: due date from chrono.es plus our own expressions. */
export function extractDate(text: string, now: Date, hours: Hours): DateMatch | null {
	let masked = text;
	const ranges: [number, number][] = [];
	let timeOverride: string | undefined;

	for (const phrase of TIME_PHRASES) {
		const match = phrase.pattern.exec(masked);
		if (!match) continue;
		timeOverride ??= phrase.time(hours);
		ranges.push([match.index, match.index + match[0].length]);
		masked = mask(masked, match.index, match.index + match[0].length);
	}

	const dayAfter = DAY_AFTER_TOMORROW.exec(masked);
	if (dayAfter) {
		const start = introducerStart(masked, dayAfter.index);
		ranges.push([start, dayAfter.index + dayAfter[0].length]);
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
		return { dueAt: withTime(day, timeOverride ?? hours.end).toISOString(), ranges };
	}

	const result = chrono.es.parse(masked, now, { forwardDate: true })[0];
	if (!result) {
		if (!timeOverride) return null;
		// Only a time of day ("a primera hora llamar"): today, or tomorrow if it has passed.
		let due = withTime(now, timeOverride);
		if (due.getTime() < now.getTime()) due = withTime(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), timeOverride);
		return { dueAt: due.toISOString(), ranges };
	}

	const start = introducerStart(masked, result.index);
	ranges.push([start, result.index + result.text.length]);

	const parsed = result.start.date();
	const due = result.start.isCertain('hour') ? parsed : withTime(parsed, timeOverride ?? hours.end);
	return { dueAt: due.toISOString(), ranges };
}
