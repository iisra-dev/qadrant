import { dateKey } from './dates';
import type { Settings } from './types';

/**
 * Easter Sunday as 'YYYY-MM-DD' (anonymous Gregorian algorithm by
 * Meeus/Jones/Butcher).
 */
export function easterSunday(year: number): string {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return dateKey(new Date(year, month - 1, day));
}

const FIXED_NATIONAL = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];

const cache = new Map<number, string[]>();

/** Spanish national holidays of a year, sorted, as 'YYYY-MM-DD'. */
export function nationalHolidays(year: number): string[] {
	let list = cache.get(year);
	if (!list) {
		const [y, m, d] = easterSunday(year).split('-').map(Number);
		const goodFriday = dateKey(new Date(y, m - 1, d - 2));
		list = [...FIXED_NATIONAL.map((md) => `${year}-${md}`), goodFriday].sort();
		cache.set(year, list);
	}
	return list;
}

export function isHoliday(date: Date, holidays: Settings['holidays']): boolean {
	const key = dateKey(date);
	if (holidays.extra.includes(key)) return true;
	return holidays.national && nationalHolidays(date.getFullYear()).includes(key);
}
