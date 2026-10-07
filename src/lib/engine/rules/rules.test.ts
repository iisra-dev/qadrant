import { describe, expect, it } from 'vitest';
import { defaultSettings } from '$lib/db/defaults';
import { evaluateUrgency } from '$lib/domain/urgency';
import type { Person, Settings } from '$lib/domain/types';
import { extractDuration } from './duration';
import { extract } from './index';
import { extractAssignee } from './person';

const ana: Person = { id: 'p-ana', createdAt: '', updatedAt: '', name: 'Ana', aliases: [] };
const luis: Person = { id: 'p-luis', createdAt: '', updatedAt: '', name: 'Luis', aliases: ['Luisito'] };
const people = [ana, luis];
const settings: Settings = defaultSettings();
const friday2Oct = new Date(2026, 9, 2, 10, 0);

function local(y: number, m: number, d: number, h: number, min = 0): string {
	return new Date(y, m - 1, d, h, min).toISOString();
}

function run(text: string, now = friday2Oct, s: Settings = settings) {
	const result = extract(text, { now, people, settings: s });
	return { ...result, urgent: evaluateUrgency(result.dueAt, now, s).value };
}

// docs/03, "Extracción y urgencia". Today = Friday 2 Oct 2026, 10:00.
describe('test cases of docs/03', () => {
	it('El lunes a primera hora mandar la oferta a [CLIENTE]', () => {
		expect(run('El lunes a primera hora mandar la oferta a [CLIENTE]')).toEqual({
			title: 'Mandar la oferta a [CLIENTE]',
			dueAt: local(2026, 10, 5, 9),
			urgent: true
		});
	});

	it('Mirar cursos de inglés', () => {
		expect(run('Mirar cursos de inglés')).toEqual({ title: 'Mirar cursos de inglés', urgent: false });
	});

	it('Que Ana reserve la sala para el martes', () => {
		expect(run('Que Ana reserve la sala para el martes')).toEqual({
			title: 'Que Ana reserve la sala',
			dueAt: local(2026, 10, 6, 18),
			personId: 'p-ana',
			urgent: true
		});
	});

	it('Llamar al taller hoy, media hora', () => {
		expect(run('Llamar al taller hoy, media hora')).toEqual({
			title: 'Llamar al taller',
			dueAt: local(2026, 10, 2, 18),
			durationMin: 30,
			urgent: true
		});
	});

	it('Revisión médica anual / Ordenar marcadores del navegador', () => {
		expect(run('Revisión médica anual')).toEqual({ title: 'Revisión médica anual', urgent: false });
		expect(run('Ordenar marcadores del navegador')).toEqual({ title: 'Ordenar marcadores del navegador', urgent: false });
	});

	it('Pagar recibo, venció ayer', () => {
		const result = run('Pagar recibo, venció ayer');
		expect(result.dueAt).toBe(local(2026, 10, 1, 18));
		expect(result.title).toBe('Pagar recibo');
		expect(result.urgent).toBe(true);
	});

	it('El 20 de octubre presentar el plan Q4, 2 h', () => {
		expect(run('El 20 de octubre presentar el plan Q4, 2 h')).toEqual({
			title: 'Presentar el plan Q4',
			dueAt: local(2026, 10, 20, 18),
			durationMin: 120,
			urgent: false
		});
	});

	it('Llamar a Ana mañana: a mention, not an assignment', () => {
		expect(run('Llamar a Ana mañana')).toEqual({
			title: 'Llamar a Ana',
			dueAt: local(2026, 10, 3, 18),
			urgent: true
		});
	});

	it('Pedirle a Luis que compre material de oficina', () => {
		expect(run('Pedirle a Luis que compre material de oficina')).toEqual({
			title: 'Pedirle a Luis que compre material de oficina',
			personId: 'p-luis',
			urgent: false
		});
	});

	it('Estudiar el tema 4: the 4 is not a date', () => {
		expect(run('Estudiar el tema 4')).toEqual({ title: 'Estudiar el tema 4', urgent: false });
	});

	it('Repasar el informe, hora y media', () => {
		expect(run('Repasar el informe, hora y media')).toEqual({
			title: 'Repasar el informe',
			durationMin: 90,
			urgent: false
		});
	});

	it('across the DST change: Monday 26 Oct at 09:00 is 08:00Z', () => {
		const result = run('El lunes a primera hora revisar el contrato', new Date(2026, 9, 23, 10, 0));
		expect(result).toEqual({ title: 'Revisar el contrato', dueAt: '2026-10-26T08:00:00.000Z', urgent: true });
	});

	it('Para el miércoles revisar el contrato, with and without the 12 Oct holiday', () => {
		const friday9 = new Date(2026, 9, 9, 10, 0);
		expect(run('Para el miércoles revisar el contrato', friday9)).toEqual({
			title: 'Revisar el contrato',
			dueAt: local(2026, 10, 14, 18),
			urgent: true
		});
		const noHolidays = { ...settings, holidays: { national: false, extra: [] } };
		expect(run('Para el miércoles revisar el contrato', friday9, noHolidays).urgent).toBe(false);
	});
});

describe('own date expressions', () => {
	it.each([
		['mañana por la mañana llamar', local(2026, 10, 3, 12), 'Llamar'],
		['el lunes por la tarde enviar informe', local(2026, 10, 5, 18), 'Enviar informe'],
		['mañana a última hora cerrar caja', local(2026, 10, 3, 18), 'Cerrar caja'],
		['mañana a mediodía comer con Ana', local(2026, 10, 3, 12), 'Comer con Ana'],
		['pasado mañana comprar regalo', local(2026, 10, 4, 18), 'Comprar regalo'],
		['enviar factura el viernes a las 17:30', local(2026, 10, 2, 17, 30), 'Enviar factura'],
		['revisar contrato antes del jueves', local(2026, 10, 8, 18), 'Revisar contrato'],
		['mañana a las 9 dentista', local(2026, 10, 3, 9), 'Dentista'],
		// The preposition before a time goes with it: no "Llamar a Aldo a".
		['llamar a Aldo a las 17:30', local(2026, 10, 2, 17, 30), 'Llamar a Aldo'],
		['llamar a Aldo sobre las 17:00', local(2026, 10, 2, 17), 'Llamar a Aldo'],
		['quedar con Ana hacia las 19:00', local(2026, 10, 2, 19), 'Quedar con Ana'],
		['llamar a Aldo a eso de las 18:00', local(2026, 10, 2, 18), 'Llamar a Aldo'],
		['llamar a Aldo alrededor de las 16:00', local(2026, 10, 2, 16), 'Llamar a Aldo'],
		// Before a day they stay: only a time takes them along.
		['hablar sobre mañana con Ana', local(2026, 10, 3, 18), 'Hablar sobre con Ana']
	])('%s', (text, dueAt, title) => {
		const result = run(text);
		expect(result.dueAt).toBe(dueAt);
		expect(result.title).toBe(title);
	});
});

describe('extractDuration', () => {
	it.each([
		['una hora y media', 90],
		['dos horas y media', 150],
		['hora y media', 90],
		['tres cuartos de hora', 45],
		['media hora', 30],
		['un cuarto de hora', 15],
		['1h30', 90],
		['1 h 30', 90],
		['2 h', 120],
		['1,5 horas', 90],
		['dos horas', 120],
		['una hora', 60],
		['45 min', 45],
		['diez minutos', 10],
		['durante 20 minutos', 20]
	])('%s = %i min', (text, minutes) => {
		expect(extractDuration(`Tarea ${text}`)?.minutes).toBe(minutes);
	});

	it('ignores numbers without a unit and words that start with h', () => {
		expect(extractDuration('Leer 2 hojas')).toBeNull();
		expect(extractDuration('Estudiar el tema 4')).toBeNull();
	});
});

describe('extractAssignee', () => {
	it.each([
		['Que Ana reserve la sala', 'p-ana'],
		['Ana, que reserve la sala', 'p-ana'],
		['Decirle a Luis que llame', 'p-luis'],
		['Encargarle a luis el informe', 'p-luis'],
		['Pídele a Luisito las llaves', 'p-luis'],
		['Delegar en Ana la reserva', 'p-ana'],
		['Revisar el informe, que lo haga Ana', 'p-ana']
	])('%s', (text, id) => {
		expect(extractAssignee(text, people)).toBe(id);
	});

	it.each(['Llamar a Ana', 'Regalo para Luis', 'Anabel que venga'])('mention only: %s', (text) => {
		expect(extractAssignee(text, people)).toBeUndefined();
	});
});

// Phrases from the real phase 0 data set that left debris in the title.
describe('real phrases', () => {
	it.each([
		['preparar la clase de mates de Nacho de mañana (1h de preparación)', 'Preparar la clase de mates de Nacho', local(2026, 10, 3, 18), 60],
		['comprar entradas para el cine del sábado', 'Comprar entradas para el cine', local(2026, 10, 3, 18), undefined],
		['leer el tema 2 de Redes esta tarde, tardaré 2 h', 'Leer el tema 2 de Redes', local(2026, 10, 2, 18), 120],
		['pagar el recibo de la luz (venció ayer)', 'Pagar el recibo de la luz', local(2026, 10, 1, 18), undefined],
		['llamar al banco para desbloquear la tarjeta (era para el miércoles)', 'Llamar al banco para desbloquear la tarjeta', local(2026, 10, 7, 18), undefined],
		['comprar un regalo para el cumpleaños de Marta del domingo', 'Comprar un regalo para el cumpleaños de Marta', local(2026, 10, 4, 18), undefined],
		['ordenar el escritorio, me llevará media hora', 'Ordenar el escritorio', undefined, 30],
		['limpiar la cocina a fondo, al menos 1 hora', 'Limpiar la cocina a fondo', undefined, 60],
		['el viernes pasado quedé en llamar a mi abuela', 'Quedé en llamar a mi abuela', local(2026, 9, 25, 18), undefined],
		['terminar los ejercicios de Algoritmia del jueves de la semana que viene', 'Terminar los ejercicios de Algoritmia', local(2026, 10, 8, 18), undefined],
		['repasar el tema, unas 2 horas', 'Repasar el tema', undefined, 120]
	])('%s', (text, title, dueAt, durationMin) => {
		const result = run(text);
		expect(result.title).toBe(title);
		expect(result.dueAt).toBe(dueAt);
		expect(result.durationMin).toBe(durationMin);
	});

	it('next week moves a weekday of this week to the next one', () => {
		// Monday 5 Oct: "el jueves de la semana que viene" is 15 Oct, not 8.
		expect(run('entregar la memoria el jueves de la semana que viene', new Date(2026, 9, 5, 10)).dueAt).toBe(local(2026, 10, 15, 18));
	});
});
