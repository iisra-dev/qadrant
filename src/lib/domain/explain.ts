import type { Lang } from '$lib/i18n/lang';
import { messages } from '$lib/i18n/catalog';
import { addDays, sameDay } from './dates';
import { formatDuration, formatPercent, formatShortDate, formatShortDateTime, formatTime, relativeDay } from './format';
import type { Decision, Goal, Person, Quadrant, Settings, Task } from './types';

export interface ExplainContext {
	now: Date;
	settings: Pick<Settings, 'urgencyDays'>;
	goals: Goal[];
	people: Person[];
	/** Interface language; Spanish if not given. */
	lang?: Lang;
}

export function quadrantName(quadrant: Quadrant, lang: Lang = 'es'): string {
	return messages(lang).quadrants[quadrant].name;
}

function urgencySentence(urgent: Decision['urgent'], ctx: ExplainContext): string {
	const lang = ctx.lang ?? 'es';
	const m = messages(lang).explain;
	switch (urgent.reason) {
		case 'no-date':
			return m.noDate;
		case 'due-soon':
			return m.dueSoon(m.window(ctx.settings.urgencyDays));
		case 'overdue':
			return m.overdue(relativeDay(new Date(urgent.dueAt!), ctx.now, lang));
		case 'due-later':
			return m.dueLater(relativeDay(new Date(urgent.dueAt!), ctx.now, lang));
	}
}

function goalTitle(id: string | undefined, goals: Goal[]): string | undefined {
	return id ? goals.find((goal) => goal.id === id)?.title : undefined;
}

type Explainable = Pick<Task, 'quadrant' | 'quadrantSource' | 'decision' | 'important' | 'movedAt' | 'dueAt'>;

/** The "Why is it in..." box of the task detail (docs/03, "Explicación"). */
export function whyText(task: Partial<Explainable> & Pick<Task, 'quadrant' | 'quadrantSource'>, ctx: ExplainContext): string {
	const lang = ctx.lang ?? 'es';
	const m = messages(lang).explain;
	const { decision } = task;

	if (task.quadrantSource === 'user') return m.movedByHand;

	if (task.movedAt) {
		const due = task.dueAt ?? decision?.urgent.dueAt;
		const name = quadrantName(task.quadrant, lang);
		if (!due) return m.moved(name);
		const dueDate = new Date(due);
		if (task.quadrant === 'schedule' || task.quadrant === 'eliminate') {
			return m.movedOut(name, m.window(ctx.settings.urgencyDays));
		}
		return m.movedIn(name, dueDate.getTime() < ctx.now.getTime(), relativeDay(dueDate, ctx.now, lang));
	}

	if (!decision) return '';

	const personId = decision.delegable.personId;
	if (personId) {
		const person = ctx.people.find((p) => p.id === personId);
		return person ? m.assignedTo(person.name) : m.assignedToSomeone;
	}

	if (task.quadrantSource === 'answer') {
		if (decision.ask === 'delegable') {
			return task.quadrant === 'delegate' ? m.answeredDelegable : m.answeredNotDelegable;
		}
		return task.important === false ? m.answeredNotImportant : m.answeredImportant;
	}

	const parts = [urgencySentence(decision.urgent, ctx)];
	const p = decision.importance.p;
	if (p === null) {
		parts.push(m.noAssistant(quadrantName(task.quadrant, lang)));
		return parts.join(' ');
	}

	const goal = goalTitle(decision.importance.matchedGoalId, ctx.goals);
	const percent = formatPercent(p, lang);
	parts.push(goal ? m.importanceGoal(percent, goal) : m.importance(percent));

	// Urgent and not important: the result depends on delegability, so say it.
	if (decision.urgent.value && decision.delegable.p !== null) {
		if (task.quadrant === 'delegate') parts.push(m.someoneElse);
		else if (task.quadrant === 'do') parts.push(m.nobodyElse);
	}
	return parts.join(' ');
}

/** "Hoy 12:00", "Mañana 09:00", "lun 5 oct 09:00"; "Today 12:00", "Mon, Oct 5 09:00". */
export function slotLabel(start: Date, now: Date, lang: Lang = 'es'): string {
	const m = messages(lang).explain;
	const day = sameDay(start, now) ? m.today : sameDay(start, addDays(now, 1)) ? m.tomorrow : formatShortDate(start, lang);
	return `${day} ${formatTime(start)}`;
}

/** The three lines of the capture sheet: urgent, important and slot (proposed by the scheduler, if any). */
export function captureLines(
	decision: Decision,
	ctx: ExplainContext,
	slotStart?: Date
): { urgent: string; important: string; slot: string } {
	const lang = ctx.lang ?? 'es';
	const m = messages(lang).explain;
	const { urgent } = decision;
	let urgentLine: string;
	if (!urgent.dueAt) urgentLine = m.lineNoDate;
	else {
		const when = formatShortDateTime(new Date(urgent.dueAt), lang);
		urgentLine = urgent.reason === 'overdue' ? m.lineOverdue(when) : m.lineDue(urgent.value, when);
	}

	const p = decision.importance.p;
	let importantLine = m.lineNoAssistant;
	if (p !== null) {
		const goal = goalTitle(decision.importance.matchedGoalId, ctx.goals);
		importantLine = goal ? m.lineGoal(formatPercent(p, lang), goal) : formatPercent(p, lang);
	}

	const duration = decision.durationMin ? formatDuration(decision.durationMin) : '';
	const slot = slotStart
		? [slotLabel(slotStart, ctx.now, lang), duration || formatDuration(30)].join(' · ')
		: duration || m.lineNoTime;
	return { urgent: urgentLine, important: importantLine, slot };
}

/** Context line under the doubt question. */
export function doubtText(decision: Decision, ctx: ExplainContext): string {
	const m = messages(ctx.lang ?? 'es').explain;
	const urgency = urgencySentence(decision.urgent, ctx);
	if (decision.ask === 'delegable') return m.doubtDelegable(urgency.replace(/\.$/, ''));
	return m.doubtImportance(urgency);
}
