import { addDays, endOfDay, isoWeekday, startOfDay } from './dates';
import { isHoliday } from './holidays';
import type { Decision, Settings } from './types';

type WorkCalendar = Pick<Settings, 'workDays' | 'holidays'>;

/** A working day is in workDays and is not a holiday (docs/03, step 5). */
export function isWorkingDay(date: Date, settings: WorkCalendar): boolean {
	return settings.workDays.includes(isoWeekday(date)) && !isHoliday(date, settings.holidays);
}

/** End (23:59:59.999 local) of the N-th working day after today; today does not count. */
export function urgencyDeadline(
	now: Date,
	settings: WorkCalendar & Pick<Settings, 'urgencyDays'>
): Date {
	let day = startOfDay(now);
	let counted = 0;
	// Guard against a calendar without working days.
	for (let i = 0; counted < settings.urgencyDays && i < 366; i++) {
		day = addDays(day, 1);
		if (isWorkingDay(day, settings)) counted++;
	}
	return endOfDay(day);
}

export function evaluateUrgency(
	dueAt: string | undefined,
	now: Date,
	settings: WorkCalendar & Pick<Settings, 'urgencyDays'>
): Decision['urgent'] {
	if (!dueAt) return { value: false, reason: 'no-date' };
	const due = new Date(dueAt);
	if (due.getTime() < now.getTime()) return { value: true, dueAt, reason: 'overdue' };
	if (due.getTime() <= urgencyDeadline(now, settings).getTime()) {
		return { value: true, dueAt, reason: 'due-soon' };
	}
	return { value: false, dueAt, reason: 'due-later' };
}
