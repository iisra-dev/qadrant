import { describe, expect, it } from 'vitest';
import { easterSunday, isHoliday, nationalHolidays } from './holidays';

describe('easterSunday', () => {
	it.each([
		[2024, '2024-03-31'],
		[2025, '2025-04-20'],
		[2026, '2026-04-05'],
		[2027, '2027-03-28'],
		[2038, '2038-04-25']
	])('%i', (year, expected) => {
		expect(easterSunday(year)).toBe(expected);
	});
});

describe('nationalHolidays', () => {
	it('includes Good Friday: 3 Apr 2026 and 26 Mar 2027', () => {
		expect(nationalHolidays(2026)).toContain('2026-04-03');
		expect(nationalHolidays(2027)).toContain('2027-03-26');
	});

	it('lists the ten national holidays', () => {
		expect(nationalHolidays(2026)).toEqual([
			'2026-01-01',
			'2026-01-06',
			'2026-04-03',
			'2026-05-01',
			'2026-08-15',
			'2026-10-12',
			'2026-11-01',
			'2026-12-06',
			'2026-12-08',
			'2026-12-25'
		]);
	});
});

describe('isHoliday', () => {
	const monday12Oct = new Date(2026, 9, 12, 10);

	it('knows national holidays when enabled', () => {
		expect(isHoliday(monday12Oct, { national: true, extra: [] })).toBe(true);
		expect(isHoliday(monday12Oct, { national: false, extra: [] })).toBe(false);
	});

	it('adds the user dates', () => {
		const tuesday13 = new Date(2026, 9, 13, 23, 30);
		expect(isHoliday(tuesday13, { national: true, extra: ['2026-10-13'] })).toBe(true);
		expect(isHoliday(tuesday13, { national: true, extra: [] })).toBe(false);
	});
});
