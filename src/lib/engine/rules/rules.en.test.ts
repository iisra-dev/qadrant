import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import { evaluateUrgency } from '$lib/domain/urgency';
import type { Person, Settings } from '$lib/domain/types';
import { extractDuration } from './duration';
import { extract } from './index';
import { extractAssignee } from './person';

const ana: Person = { id: 'p-ana', createdAt: '', updatedAt: '', name: 'Ana', aliases: [] };
const luis: Person = { id: 'p-luis', createdAt: '', updatedAt: '', name: 'Luis', aliases: [] };
const people = [ana, luis];
const settings: Settings = { ...defaultSettings(), language: 'en' };
const friday2Oct = new Date(2026, 9, 2, 10, 0);

function local(y: number, m: number, d: number, h: number, min = 0): string {
	return new Date(y, m - 1, d, h, min).toISOString();
}

function run(text: string, now = friday2Oct, s: Settings = settings) {
	const result = extract(text, { now, people, settings: s });
	return { ...result, urgent: evaluateUrgency(result.dueAt, now, s).value };
}

// English equivalent of the docs/03 table. Today = Friday 2 Oct 2026, 10:00.
describe('docs/03 cases in English', () => {
	it.each([
		['First thing Monday send the offer to [CLIENT]', 'Send the offer to [CLIENT]', local(2026, 10, 5, 9), true, undefined, undefined],
		['Look at English courses', 'Look at English courses', undefined, false, undefined, undefined],
		['Have Ana book the room for Tuesday', 'Have Ana book the room', local(2026, 10, 6, 18), true, undefined, 'p-ana'],
		['Call the garage today, half an hour', 'Call the garage', local(2026, 10, 2, 18), true, 30, undefined],
		['Yearly medical check-up', 'Yearly medical check-up', undefined, false, undefined, undefined],
		['Present the Q4 plan on October 20, 2 h', 'Present the Q4 plan', local(2026, 10, 20, 18), false, 120, undefined],
		['Call Ana tomorrow', 'Call Ana', local(2026, 10, 3, 18), true, undefined, undefined],
		['Ask Luis to buy office supplies', 'Ask Luis to buy office supplies', undefined, false, undefined, 'p-luis'],
		['Study topic 4', 'Study topic 4', undefined, false, undefined, undefined],
		['Review the report, an hour and a half', 'Review the report', undefined, false, 90, undefined]
	])('%s', (text, title, dueAt, urgent, durationMin, personId) => {
		const result = run(text);
		expect(result.title).toBe(title);
		expect(result.dueAt).toBe(dueAt);
		expect(result.urgent).toBe(urgent);
		expect(result.durationMin).toBe(durationMin);
		expect(result.personId).toBe(personId);
	});

	it('Pay the bill, it was due yesterday', () => {
		const result = run('Pay the bill, it was due yesterday');
		expect(result.dueAt).toBe(local(2026, 10, 1, 18));
		expect(result.urgent).toBe(true);
		expect(result.title).toBe('Pay the bill');
	});

	it('across the DST change: Monday 26 Oct at 09:00 is 08:00Z', () => {
		expect(run('First thing Monday review the contract', new Date(2026, 9, 23, 10, 0)).dueAt).toBe('2026-10-26T08:00:00.000Z');
	});

	it('By Wednesday review the contract, with and without the 12 Oct holiday', () => {
		const friday9 = new Date(2026, 9, 9, 10, 0);
		expect(run('By Wednesday review the contract', friday9)).toMatchObject({ title: 'Review the contract', dueAt: local(2026, 10, 14, 18), urgent: true });
		const noHolidays = { ...settings, holidays: { national: false, extra: [] } };
		expect(run('By Wednesday review the contract', friday9, noHolidays).urgent).toBe(false);
	});
});

describe('own English expressions', () => {
	it.each([
		['tomorrow morning call mum', local(2026, 10, 3, 12), 'Call mum'],
		['Monday afternoon send the report', local(2026, 10, 5, 18), 'Send the report'],
		['this afternoon read chapter 2', local(2026, 10, 2, 18), 'Read chapter 2'],
		['end of day close the till', local(2026, 10, 2, 18), 'Close the till'],
		['tomorrow at noon lunch with Ana', local(2026, 10, 3, 12), 'Lunch with Ana'],
		['day after tomorrow buy a gift', local(2026, 10, 4, 18), 'Buy a gift'],
		['send the invoice Friday at 17:30', local(2026, 10, 2, 17, 30), 'Send the invoice'],
		['review the contract before Thursday', local(2026, 10, 8, 18), 'Review the contract'],
		['tomorrow at 9 dentist', local(2026, 10, 3, 9), 'Dentist'],
		['last Friday I said I would call grandma', local(2026, 9, 25, 18), 'I said I would call grandma'],
		['finish the exercises on Thursday next week', local(2026, 10, 8, 18), 'Finish the exercises'],
		['pay the electricity bill (it was due yesterday)', local(2026, 10, 1, 18), 'Pay the electricity bill'],
		// Words that introduce a time go with it; before a day they stay.
		['call Aldo at 5:30pm', local(2026, 10, 2, 17, 30), 'Call Aldo'],
		['call Aldo around 5pm', local(2026, 10, 2, 17), 'Call Aldo'],
		['call Aldo at around 5pm', local(2026, 10, 2, 17), 'Call Aldo'],
		['call Aldo at about 5pm', local(2026, 10, 2, 17), 'Call Aldo'],
		['meet Ana towards 7pm', local(2026, 10, 2, 19), 'Meet Ana'],
		['talk about Monday with Ana', local(2026, 10, 5, 18), 'Talk about with Ana'],
		// An hour without am/pm: 1-7 is the afternoon, 8-11 the morning.
		['call Aldo at 5', local(2026, 10, 2, 17), 'Call Aldo'],
		['call Aldo at 9', local(2026, 10, 3, 9), 'Call Aldo'],
		['gym at 5am', local(2026, 10, 3, 5), 'Gym']
	])('%s', (text, dueAt, title) => {
		const result = run(text);
		expect(result.dueAt).toBe(dueAt);
		expect(result.title).toBe(title);
	});

	it('next week moves a weekday of this week to the next one', () => {
		expect(run('hand in the report Thursday next week', new Date(2026, 9, 5, 10)).dueAt).toBe(local(2026, 10, 15, 18));
	});
});

describe('English durations', () => {
	it.each([
		['an hour and a half', 90],
		['one and a half hours', 90],
		['two and a half hours', 150],
		['three quarters of an hour', 45],
		['half an hour', 30],
		['a quarter of an hour', 15],
		['1h30', 90],
		['2 h', 120],
		['1.5 hours', 90],
		['two hours', 120],
		['an hour', 60],
		['45 min', 45],
		['ten minutes', 10],
		['it will take 20 minutes', 20],
		['for about 2 hours', 120]
	])('%s = %i min', (text, minutes) => {
		const found = extractDuration(`Task ${text}`, 'en');
		expect(found?.minutes).toBe(minutes);
		expect(`Task ${text}`.slice(0, found!.range[0]).trim()).toBe('Task');
	});

	it('ignores numbers without a unit', () => {
		expect(extractDuration('Read 2 chapters', 'en')).toBeNull();
		expect(extractDuration('Study topic 4', 'en')).toBeNull();
	});
});

describe('English assignments', () => {
	it.each([
		['Have Ana book the room', 'p-ana'],
		['Get Luis to call the bank', 'p-luis'],
		['Ask Luis to buy office supplies', 'p-luis'],
		['Tell Ana to send the slides', 'p-ana'],
		['Delegate the booking to Ana', 'p-ana'],
		['Review the report, have Ana do it', 'p-ana']
	])('%s', (text, id) => {
		expect(extractAssignee(text, people, 'en')).toBe(id);
	});

	it.each(['Call Ana', 'Gift for Luis', 'Anabel should come'])('mention only: %s', (text) => {
		expect(extractAssignee(text, people, 'en')).toBeUndefined();
	});
});

describe('language fallback', () => {
	it('English settings still read a Spanish task', () => {
		const result = run('Llamar al taller mañana, media hora');
		expect(result).toMatchObject({ title: 'Llamar al taller', dueAt: local(2026, 10, 3, 18), durationMin: 30 });
	});

	it('Spanish settings still read an English task', () => {
		const result = run('Call the garage tomorrow, half an hour', friday2Oct, { ...settings, language: 'es' });
		expect(result).toMatchObject({ title: 'Call the garage', dueAt: local(2026, 10, 3, 18), durationMin: 30 });
	});

	it('assignments are recognised in either language', () => {
		expect(run('Que Ana reserve la sala').personId).toBe('p-ana');
		expect(run('Have Ana book the room', friday2Oct, { ...settings, language: 'es' }).personId).toBe('p-ana');
	});
});
