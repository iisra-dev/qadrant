import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import { captureLines, doubtText, quadrantName, whyText, type ExplainContext } from './explain';
import type { Decision, Goal, Person } from './types';

const now = new Date(2026, 9, 2, 10, 0); // Friday 2 Oct
const goal: Goal = {
	id: 'g1',
	createdAt: '',
	updatedAt: '',
	title: 'Ventas Q4',
	summary: 'Ventas Q4',
	active: true,
	order: 0
};
const luis: Person = { id: 'p-luis', createdAt: '', updatedAt: '', name: 'Luis', aliases: [] };
const ctx: ExplainContext = { now, settings: defaultSettings(), goals: [goal], people: [luis] };

const monday9 = new Date(2026, 9, 5, 9, 0).toISOString();

function decision(overrides: Partial<Decision> = {}): Decision {
	return {
		quadrant: 'do',
		title: 'Mandar la oferta',
		urgent: { value: true, dueAt: monday9, reason: 'due-soon' },
		importance: { p: 0.87, matchedGoalId: 'g1' },
		delegable: { p: null },
		engine: 'model-webgpu',
		...overrides
	};
}

function why(d: Decision, extra: Partial<Parameters<typeof whyText>[0]> = {}) {
	return whyText({ quadrant: d.quadrant ?? 'do', quadrantSource: 'ai', decision: d, ...extra }, ctx);
}

describe('quadrantName', () => {
	it('uses the interface names', () => {
		expect(['do', 'schedule', 'delegate', 'eliminate'].map((q) => quadrantName(q as never))).toEqual([
			'Hacer',
			'Programar',
			'Delegar',
			'Eliminar'
		]);
	});
});

describe('whyText', () => {
	it('urgent and important with a goal', () => {
		expect(why(decision())).toBe('Vence en los próximos 2 días laborables. Importancia 87 % por tu objetivo «Ventas Q4».');
	});

	it('no date and low importance', () => {
		const d = decision({ quadrant: 'eliminate', urgent: { value: false, reason: 'no-date' }, importance: { p: 0.22 } });
		expect(why(d)).toBe('No tiene fecha, así que no es urgente. Importancia 22 %.');
	});

	it('rules-only mode', () => {
		const d = decision({ importance: { p: null }, engine: 'rules' });
		expect(why(d)).toBe('Vence en los próximos 2 días laborables. Sin asistente, va a Hacer.');
	});

	it('assignment', () => {
		const d = decision({ quadrant: 'delegate', delegable: { p: null, personId: 'p-luis' } });
		expect(why(d)).toBe('Se lo encargaste a Luis.');
	});

	it('answers', () => {
		const importance = decision({ quadrant: null, ask: 'importance' });
		expect(why(importance, { quadrant: 'schedule', quadrantSource: 'answer', important: true })).toBe(
			'Respondiste que es importante.'
		);
		expect(why(importance, { quadrant: 'eliminate', quadrantSource: 'answer', important: false })).toBe(
			'Respondiste que no es importante.'
		);
		const delegable = decision({ quadrant: null, ask: 'delegable' });
		expect(why(delegable, { quadrant: 'delegate', quadrantSource: 'answer', important: false })).toBe(
			'Respondiste que puede hacerlo otra persona.'
		);
		expect(why(delegable, { quadrant: 'do', quadrantSource: 'answer', important: false })).toBe(
			'Respondiste que nadie más puede hacerlo.'
		);
	});

	it('passage of time', () => {
		const tuesday = new Date(2026, 9, 20, 18, 0).toISOString();
		const friday16 = { ...ctx, now: new Date(2026, 9, 16, 9, 0) };
		const text = whyText(
			{ quadrant: 'do', quadrantSource: 'ai', decision: decision(), movedAt: friday16.now.toISOString(), dueAt: tuesday },
			friday16
		);
		expect(text).toBe('Ha pasado a Hacer porque vence el martes.');
	});

	it('moved by hand', () => {
		expect(why(decision(), { quadrantSource: 'user' })).toBe('Lo moviste tú.');
	});

	it('urgent, not important and nobody else can do it', () => {
		const d = decision({ importance: { p: 0.2 }, delegable: { p: 0.2 } });
		expect(why(d)).toBe('Vence en los próximos 2 días laborables. Importancia 20 %. Nadie más puede hacerlo.');
	});

	it('urgent, not important and delegable', () => {
		const d = decision({ quadrant: 'delegate', importance: { p: 0.2 }, delegable: { p: 0.8 } });
		expect(why(d)).toBe('Vence en los próximos 2 días laborables. Importancia 20 %. Puede hacerlo otra persona.');
	});

	it('overdue and due later', () => {
		const overdue = decision({ urgent: { value: true, dueAt: new Date(2026, 9, 1, 18).toISOString(), reason: 'overdue' } });
		expect(why(overdue)).toMatch(/^Venció ayer\./);
		const later = decision({
			quadrant: 'schedule',
			urgent: { value: false, dueAt: new Date(2026, 9, 20, 18).toISOString(), reason: 'due-later' },
			importance: { p: 0.7 }
		});
		expect(why(later)).toBe('Vence el 20 de octubre, así que aún no es urgente. Importancia 70 %.');
	});

	it('singular working day', () => {
		const one = { ...ctx, settings: { ...ctx.settings, urgencyDays: 1 } };
		expect(whyText({ quadrant: 'do', quadrantSource: 'ai', decision: decision() }, one)).toMatch(
			/^Vence el próximo día laborable\./
		);
	});

	it('works without a decision', () => {
		expect(whyText({ quadrant: 'do', quadrantSource: 'ai' }, ctx)).toBe('');
	});
});

describe('captureLines', () => {
	it('matches the capture mockup', () => {
		expect(captureLines(decision({ durationMin: 45 }), ctx)).toEqual({
			urgent: 'Sí · vence lun 5 oct, 09:00',
			important: '87 % · objetivo «Ventas Q4»',
			slot: '45 min'
		});
	});

	it('without date, model or duration', () => {
		const d = decision({ urgent: { value: false, reason: 'no-date' }, importance: { p: null }, engine: 'rules' });
		expect(captureLines(d, ctx)).toEqual({ urgent: 'No · sin fecha', important: 'Sin asistente', slot: 'Sin hora' });
	});

	it('with a slot from the scheduler', () => {
		expect(captureLines(decision({ durationMin: 45 }), ctx, new Date(2026, 9, 2, 12, 0)).slot).toBe('Hoy 12:00 · 45 min');
		expect(captureLines(decision(), ctx, new Date(2026, 9, 5, 9, 0)).slot).toBe('lun 5 oct 09:00 · 30 min');
		expect(captureLines(decision(), ctx, new Date(2026, 9, 3, 9, 0)).slot).toBe('Mañana 09:00 · 30 min');
	});

	it('overdue', () => {
		const d = decision({ urgent: { value: true, dueAt: new Date(2026, 9, 1, 18).toISOString(), reason: 'overdue' } });
		expect(captureLines(d, ctx).urgent).toBe('Sí · venció jue 1 oct, 18:00');
	});
});

describe('doubtText', () => {
	it('importance without date', () => {
		const d = decision({ quadrant: null, ask: 'importance', urgent: { value: false, reason: 'no-date' }, importance: { p: 0.52 } });
		expect(doubtText(d, ctx)).toBe('No tiene fecha, así que no es urgente. Solo falta saber si es importante para ti.');
	});

	it('delegability', () => {
		const d = decision({ quadrant: null, ask: 'delegable', importance: { p: 0.2 }, delegable: { p: 0.5 } });
		expect(doubtText(d, ctx)).toBe(
			'Vence en los próximos 2 días laborables y no parece importante. Solo falta saber si puede hacerlo otra persona.'
		);
	});
});

describe('English', () => {
	const en = { ...ctx, lang: 'en' as const };

	it('why text', () => {
		expect(whyText({ quadrant: 'do', quadrantSource: 'ai', decision: decision() }, en)).toBe(
			'Due within the next 2 working days. Importance 87% for your goal “Ventas Q4”.'
		);
		expect(whyText({ quadrant: 'do', quadrantSource: 'ai', decision: decision({ importance: { p: null }, engine: 'rules' }) }, en)).toBe(
			'Due within the next 2 working days. No assistant, goes to Do.'
		);
		expect(whyText({ quadrant: 'do', quadrantSource: 'user', decision: decision() }, en)).toBe('You moved it.');
		const friday16 = { ...en, now: new Date(2026, 9, 16, 9, 0) };
		const tuesday = new Date(2026, 9, 20, 18, 0).toISOString();
		expect(whyText({ quadrant: 'do', quadrantSource: 'ai', decision: decision(), movedAt: friday16.now.toISOString(), dueAt: tuesday }, friday16)).toBe(
			'Moved to Do because it is due on Tuesday.'
		);
	});

	it('capture lines and doubt', () => {
		expect(captureLines(decision({ durationMin: 45 }), en, new Date(2026, 9, 2, 12, 0))).toEqual({
			urgent: 'Yes · due Mon, Oct 5, 09:00',
			important: '87% · goal “Ventas Q4”',
			slot: 'Today 12:00 · 45 min'
		});
		const d = decision({ quadrant: null, ask: 'importance', urgent: { value: false, reason: 'no-date' } });
		expect(doubtText(d, en)).toBe("No date, so not urgent. All that's left is whether it matters to you.");
		expect(quadrantName('eliminate', 'en')).toBe('Eliminate');
	});
});
