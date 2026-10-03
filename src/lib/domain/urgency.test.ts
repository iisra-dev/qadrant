import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import type { Settings } from './types';
import { evaluateUrgency, isWorkingDay, urgencyDeadline } from './urgency';

function settings(overrides: Partial<Settings> = {}): Settings {
	return { ...defaultSettings(), ...overrides };
}

const friday2Oct = new Date(2026, 9, 2, 10, 0);
const friday9Oct = new Date(2026, 9, 9, 10, 0);

describe('isWorkingDay', () => {
	it('uses workDays and holidays', () => {
		expect(isWorkingDay(new Date(2026, 9, 5), settings())).toBe(true); // Monday
		expect(isWorkingDay(new Date(2026, 9, 3), settings())).toBe(false); // Saturday
		expect(isWorkingDay(new Date(2026, 9, 12), settings())).toBe(false); // national holiday
	});
});

describe('urgencyDeadline', () => {
	it('Friday 2 Oct with N = 2 ends on Tuesday 6 Oct at 23:59', () => {
		const deadline = urgencyDeadline(friday2Oct, settings());
		expect(deadline.toString()).toContain('Tue Oct 06 2026 23:59:59');
	});

	it('skips the 12 Oct holiday: Friday 9 Oct ends on Wednesday 14', () => {
		expect(urgencyDeadline(friday9Oct, settings()).toString()).toContain('Wed Oct 14 2026 23:59:59');
	});

	it('without national holidays ends on Tuesday 13', () => {
		const s = settings({ holidays: { national: false, extra: [] } });
		expect(urgencyDeadline(friday9Oct, s).toString()).toContain('Tue Oct 13 2026 23:59:59');
	});

	it('with 13 Oct as an extra day off ends on Thursday 15', () => {
		const s = settings({ holidays: { national: true, extra: ['2026-10-13'] } });
		expect(urgencyDeadline(friday9Oct, s).toString()).toContain('Thu Oct 15 2026 23:59:59');
	});

	it('follows urgencyDays', () => {
		const s = settings({ urgencyDays: 1 });
		expect(urgencyDeadline(friday2Oct, s).toString()).toContain('Mon Oct 05 2026 23:59:59');
	});

	it('counts calendar days across the DST change (Sunday 25 Oct)', () => {
		const friday23Oct = new Date(2026, 9, 23, 10, 0);
		expect(urgencyDeadline(friday23Oct, settings()).toString()).toContain('Tue Oct 27 2026 23:59:59');
	});
});

describe('evaluateUrgency', () => {
	it('no date is not urgent', () => {
		expect(evaluateUrgency(undefined, friday2Oct, settings())).toEqual({ value: false, reason: 'no-date' });
	});

	it('due within the window is urgent', () => {
		const dueAt = new Date(2026, 9, 6, 18, 0).toISOString();
		expect(evaluateUrgency(dueAt, friday2Oct, settings())).toEqual({ value: true, dueAt, reason: 'due-soon' });
	});

	it('due at the very end of the window is urgent', () => {
		const dueAt = new Date(2026, 9, 6, 23, 59).toISOString();
		expect(evaluateUrgency(dueAt, friday2Oct, settings()).value).toBe(true);
	});

	it('due after the window is not urgent', () => {
		const dueAt = new Date(2026, 9, 7, 9, 0).toISOString();
		expect(evaluateUrgency(dueAt, friday2Oct, settings())).toEqual({ value: false, dueAt, reason: 'due-later' });
	});

	it('overdue is urgent', () => {
		const dueAt = new Date(2026, 9, 1, 18, 0).toISOString();
		expect(evaluateUrgency(dueAt, friday2Oct, settings())).toEqual({ value: true, dueAt, reason: 'overdue' });
	});

	it('due on a Saturday right after today is urgent', () => {
		const dueAt = new Date(2026, 9, 3, 18, 0).toISOString();
		expect(evaluateUrgency(dueAt, friday2Oct, settings()).value).toBe(true);
	});
});
