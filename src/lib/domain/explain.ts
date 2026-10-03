import { addDays, sameDay } from './dates';
import { formatDuration, formatPercent, formatShortDate, formatShortDateTime, formatTime, relativeDay } from './format';
import type { Decision, Goal, Person, Quadrant, Settings, Task } from './types';

export interface ExplainContext {
	now: Date;
	settings: Pick<Settings, 'urgencyDays'>;
	goals: Goal[];
	people: Person[];
}

const NAMES: Record<Quadrant, string> = {
	do: 'Hacer',
	schedule: 'Programar',
	delegate: 'Delegar',
	eliminate: 'Eliminar'
};

export function quadrantName(quadrant: Quadrant): string {
	return NAMES[quadrant];
}

function windowText(urgencyDays: number): string {
	return urgencyDays === 1
		? 'el próximo día laborable'
		: `en los próximos ${urgencyDays} días laborables`;
}

function urgencySentence(urgent: Decision['urgent'], ctx: ExplainContext): string {
	switch (urgent.reason) {
		case 'no-date':
			return 'No tiene fecha, así que no es urgente.';
		case 'due-soon':
			return `Vence ${windowText(ctx.settings.urgencyDays)}.`;
		case 'overdue':
			return `Venció ${relativeDay(new Date(urgent.dueAt!), ctx.now)}.`;
		case 'due-later':
			return `Vence ${relativeDay(new Date(urgent.dueAt!), ctx.now)}, así que aún no es urgente.`;
	}
}

function goalTitle(id: string | undefined, goals: Goal[]): string | undefined {
	return id ? goals.find((goal) => goal.id === id)?.title : undefined;
}

type Explainable = Pick<Task, 'quadrant' | 'quadrantSource' | 'decision' | 'important' | 'movedAt' | 'dueAt'>;

/** The "Por qué está en..." box of the task detail (docs/03, "Explicación"). */
export function whyText(task: Partial<Explainable> & Pick<Task, 'quadrant' | 'quadrantSource'>, ctx: ExplainContext): string {
	const { decision } = task;

	if (task.quadrantSource === 'user') return 'Lo moviste tú.';

	if (task.movedAt) {
		const due = task.dueAt ?? decision?.urgent.dueAt;
		const name = quadrantName(task.quadrant);
		if (!due) return `Ha pasado a ${name}.`;
		const dueDate = new Date(due);
		if (task.quadrant === 'schedule' || task.quadrant === 'eliminate') {
			return `Ha pasado a ${name} porque ya no vence ${windowText(ctx.settings.urgencyDays)}.`;
		}
		const verb = dueDate.getTime() < ctx.now.getTime() ? 'venció' : 'vence';
		return `Ha pasado a ${name} porque ${verb} ${relativeDay(dueDate, ctx.now)}.`;
	}

	if (!decision) return '';

	const personId = decision.delegable.personId;
	if (personId) {
		const person = ctx.people.find((p) => p.id === personId);
		return person ? `Se lo encargaste a ${person.name}.` : 'Se lo encargaste a otra persona.';
	}

	if (task.quadrantSource === 'answer') {
		if (decision.ask === 'delegable') {
			return task.quadrant === 'delegate'
				? 'Respondiste que puede hacerlo otra persona.'
				: 'Respondiste que nadie más puede hacerlo.';
		}
		return task.important === false
			? 'Respondiste que no es importante.'
			: 'Respondiste que es importante.';
	}

	const parts = [urgencySentence(decision.urgent, ctx)];
	const p = decision.importance.p;
	if (p === null) {
		parts.push(`Sin asistente, va a ${quadrantName(task.quadrant)}.`);
		return parts.join(' ');
	}

	const goal = goalTitle(decision.importance.matchedGoalId, ctx.goals);
	parts.push(goal ? `Importancia ${formatPercent(p)} por tu objetivo «${goal}».` : `Importancia ${formatPercent(p)}.`);

	// Urgent and not important: the result depends on delegability, so say it.
	if (decision.urgent.value && decision.delegable.p !== null) {
		if (task.quadrant === 'delegate') parts.push('Puede hacerlo otra persona.');
		else if (task.quadrant === 'do') parts.push('Nadie más puede hacerlo.');
	}
	return parts.join(' ');
}

/** "Hoy 12:00", "Mañana 09:00", "lun 5 oct 09:00". */
export function slotLabel(start: Date, now: Date): string {
	const day = sameDay(start, now) ? 'Hoy' : sameDay(start, addDays(now, 1)) ? 'Mañana' : formatShortDate(start);
	return `${day} ${formatTime(start)}`;
}

/** The three lines of the capture sheet: Urgente, Importante, Hueco (slot proposed by the scheduler, if any). */
export function captureLines(
	decision: Decision,
	ctx: ExplainContext,
	slotStart?: Date
): { urgent: string; important: string; slot: string } {
	const { urgent } = decision;
	let urgentLine: string;
	if (!urgent.dueAt) urgentLine = 'No · sin fecha';
	else {
		const when = formatShortDateTime(new Date(urgent.dueAt));
		urgentLine = urgent.reason === 'overdue' ? `Sí · venció ${when}` : `${urgent.value ? 'Sí' : 'No'} · vence ${when}`;
	}

	const p = decision.importance.p;
	let importantLine = 'Sin asistente';
	if (p !== null) {
		const goal = goalTitle(decision.importance.matchedGoalId, ctx.goals);
		importantLine = goal ? `${formatPercent(p)} · objetivo «${goal}»` : formatPercent(p);
	}

	const duration = decision.durationMin ? formatDuration(decision.durationMin) : '';
	const slot = slotStart
		? [slotLabel(slotStart, ctx.now), duration || formatDuration(30)].join(' · ')
		: duration || 'Sin hora';
	return { urgent: urgentLine, important: importantLine, slot };
}

/** Context line under the doubt question. */
export function doubtText(decision: Decision, ctx: ExplainContext): string {
	if (decision.ask === 'delegable') {
		const urgency = urgencySentence(decision.urgent, ctx).replace(/\.$/, '');
		return `${urgency} y no parece importante. Solo falta saber si puede hacerlo otra persona.`;
	}
	return `${urgencySentence(decision.urgent, ctx)} Solo falta saber si es importante para ti.`;
}
