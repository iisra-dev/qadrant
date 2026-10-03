import { describe, expect, it } from 'vitest';
import { formatLongDate, formatPercent, formatShortDate, formatShortDateTime, relativeDay } from './format';

const friday = new Date(2026, 9, 2, 10, 0);

describe('format', () => {
	it('Spanish', () => {
		expect(formatShortDateTime(new Date(2026, 9, 5, 9, 0), 'es')).toBe('lun 5 oct, 09:00');
		expect(formatLongDate(friday, 'es')).toBe('viernes, 2 de octubre');
		expect(formatPercent(0.87, 'es')).toBe('87 %');
		expect(relativeDay(new Date(2026, 9, 6), friday, 'es')).toBe('el martes');
		expect(relativeDay(new Date(2026, 9, 20), friday, 'es')).toBe('el 20 de octubre');
	});

	it('English', () => {
		expect(formatShortDateTime(new Date(2026, 9, 5, 9, 0), 'en')).toBe('Mon, Oct 5, 09:00');
		expect(formatShortDate(new Date(2026, 8, 30), 'en')).toBe('Wed, Sep 30');
		expect(formatLongDate(friday, 'en')).toBe('Friday, October 2');
		expect(formatPercent(0.87, 'en')).toBe('87%');
		expect(relativeDay(friday, friday, 'en')).toBe('today');
		expect(relativeDay(new Date(2026, 9, 3), friday, 'en')).toBe('tomorrow');
		expect(relativeDay(new Date(2026, 9, 1), friday, 'en')).toBe('yesterday');
		expect(relativeDay(new Date(2026, 9, 6), friday, 'en')).toBe('on Tuesday');
		expect(relativeDay(new Date(2026, 9, 20), friday, 'en')).toBe('on October 20');
	});
});
