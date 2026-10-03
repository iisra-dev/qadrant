import type { Person, Settings } from '$lib/domain/types';
import { extractDate } from './date';
import { extractDuration } from './duration';
import { extractAssignee } from './person';
import { normalize, removeRanges, tidyTitle } from './text';

export interface Extraction {
	title: string;
	dueAt?: string;
	durationMin?: number;
	/** Set only for an assignment (person plus marker). */
	personId?: string;
}

/** Steps 1-4 of docs/03, deterministic and without the model. */
export function extract(
	text: string,
	ctx: { now: Date; people: Person[]; settings: Pick<Settings, 'workHours'> }
): Extraction {
	const input = normalize(text);
	const date = extractDate(input, ctx.now, ctx.settings.workHours);
	const withoutDate = date ? removeRanges(input, date.ranges) : input;
	const duration = extractDuration(withoutDate);
	const rest = duration ? removeRanges(withoutDate, [duration.range]) : withoutDate;
	const personId = extractAssignee(input, ctx.people);

	return {
		title: tidyTitle(rest) || tidyTitle(input),
		...(date && { dueAt: date.dueAt }),
		...(duration && { durationMin: duration.minutes }),
		...(personId && { personId })
	};
}
