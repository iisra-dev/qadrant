// Local calendar helpers. Days are always counted on the local calendar,
// never by adding 24 h, so daylight saving changes do not shift them (docs/03).

/** 'YYYY-MM-DD' of the local calendar day. */
export function dateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Local midnight of the day given as 'YYYY-MM-DD'. */
export function fromDateKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, m - 1, d);
}

export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: Date): number {
	return date.getDay() || 7;
}

/** Local date at 'HH:MM' on the same calendar day. */
export function atTime(date: Date, time: string): Date {
	const [h, m] = time.split(':').map(Number);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
}

export function sameDay(a: Date, b: Date): boolean {
	return dateKey(a) === dateKey(b);
}
