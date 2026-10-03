import { repos as defaultRepos, type Repositories } from '$lib/db/repositories';
import { doubtOutcomes, importantOnSave } from '$lib/domain/quadrant';
import { reevaluate, reevaluateAll } from '$lib/domain/reevaluate';
import { schedule } from '$lib/domain/scheduler';
import type { Decision, Quadrant, Settings, Task } from '$lib/domain/types';
import { defaultFollowUp, evaluateUrgency } from '$lib/domain/urgency';

/** How the user settled the capture. */
export type CaptureChoice =
	| { kind: 'accepted' } // saved the proposal as is
	| { kind: 'manual'; quadrant: Quadrant } // picked a quadrant with the selector
	| { kind: 'answer'; answer: boolean }; // answered the doubt

export interface SaveCaptureInput {
	rawInput: string;
	decision: Decision;
	choice: CaptureChoice;
	settings: Settings;
	now?: Date;
	/** Slot proposed by the scheduler in the capture sheet (Hacer and Programar). */
	scheduledAt?: string;
}

function corrections(repos: Repositories) {
	return {
		async record(task: Task, from: Quadrant | null, to: Quadrant, now: Date) {
			const decision = task.decision;
			await repos.corrections.add(
				{
					taskId: task.id,
					from,
					to,
					pImportance: decision?.importance.p ?? null,
					pDelegable: decision?.delegable.p ?? null,
					engine: decision?.engine ?? 'rules'
				},
				now
			);
		}
	};
}

export function createTaskActions(repos: Repositories = defaultRepos) {
	const log = corrections(repos);

	/** Saves a captured task and records a correction when the user changed or answered the proposal. */
	async function saveCapture({ rawInput, decision, choice, settings, now = new Date(), scheduledAt }: SaveCaptureInput): Promise<Task> {
		let quadrant: Quadrant;
		let quadrantSource: Task['quadrantSource'];
		let important: boolean | undefined;
		let corrected = false;

		if (choice.kind === 'answer') {
			if (!decision.ask) throw new Error('There is no question to answer');
			const outcomes = doubtOutcomes({
				ask: decision.ask,
				urgent: decision.urgent.value,
				pDelegable: decision.delegable.p
			});
			quadrant = choice.answer ? outcomes.yes : outcomes.no;
			quadrantSource = 'answer';
			important = importantOnSave({ kind: 'answer', ask: decision.ask, answer: choice.answer });
			corrected = true;
		} else if (choice.kind === 'manual' && choice.quadrant !== decision.quadrant) {
			quadrant = choice.quadrant;
			quadrantSource = 'user';
			important = importantOnSave({ kind: 'manual', quadrant, urgent: decision.urgent.value });
			corrected = true;
		} else {
			if (!decision.quadrant) throw new Error('A doubt needs an answer or a quadrant');
			quadrant = decision.quadrant;
			quadrantSource = 'ai';
			important = importantOnSave({ kind: 'accepted', decision, thresholds: settings.thresholds });
		}

		const personId = decision.delegable.personId;
		const task = await repos.tasks.create(
			{
				title: decision.title,
				rawInput,
				quadrant,
				quadrantSource,
				...(important !== undefined && { important }),
				...(decision.urgent.dueAt && { dueAt: decision.urgent.dueAt }),
				...(decision.durationMin && { durationMin: decision.durationMin }),
				...(personId && { delegatedTo: personId }),
				...(scheduledAt && (quadrant === 'do' || quadrant === 'schedule') && { scheduledAt }),
				...(quadrant === 'delegate' && { followUpAt: defaultFollowUp(now, settings) }),
				status: 'open',
				decision
			},
			now
		);
		if (corrected) await log.record(task, decision.quadrant, quadrant, now);
		return task;
	}

	/** A change of quadrant by hand (Matrix or Detail): never moved automatically again. */
	async function changeQuadrant(task: Task, to: Quadrant, settings: Settings, now = new Date()): Promise<void> {
		if (task.quadrant === to) return;
		const urgent = evaluateUrgency(task.dueAt, now, settings).value;
		const important = importantOnSave({ kind: 'manual', quadrant: to, urgent });
		// The follow-up date exists only while delegated (docs/04).
		const followUpAt = to === 'delegate' ? (task.followUpAt ?? defaultFollowUp(now, settings)) : undefined;
		await repos.tasks.update(
			task.id,
			{ quadrant: to, quadrantSource: 'user', important, movedAt: undefined, followUpAt },
			now
		);
		await log.record(task, task.quadrant, to, now);
	}

	/** Editing the due date may move the task with the passage-of-time rule, both ways. */
	async function changeDueDate(task: Task, dueAt: string | undefined, settings: Settings, now = new Date()): Promise<void> {
		const next = { ...task, dueAt };
		const to = reevaluate(next, now, settings);
		await repos.tasks.update(
			task.id,
			{
				dueAt,
				...(to && {
					quadrant: to,
					movedAt: now.toISOString(),
					followUpAt: to === 'delegate' ? (task.followUpAt ?? defaultFollowUp(now, settings)) : undefined
				})
			},
			now
		);
	}

	/** Passage of time: on start, on day change and when urgency settings change. */
	async function reevaluateOpenTasks(settings: Settings, now = new Date()): Promise<number> {
		const moves = reevaluateAll(await repos.tasks.listOpen(), now, settings);
		if (moves.length) {
			await repos.tasks.updateMany(
				moves.map((move) => ({
					id: move.id,
					changes: {
						quadrant: move.to,
						movedAt: now.toISOString(),
						followUpAt: move.to === 'delegate' ? defaultFollowUp(now, settings) : undefined
					}
				})),
				now
			);
		}
		return moves.length;
	}

	/** "Buscarles hueco": gives a time to open Hacer and Programar tasks that have none. */
	async function findSlots(settings: Settings, now = new Date()): Promise<{ placed: number; unplaced: number }> {
		const result = schedule({ now, tasks: await repos.tasks.listOpen(), settings });
		if (result.placements.length) {
			await repos.tasks.updateMany(
				result.placements.map((p) => ({ id: p.taskId, changes: { scheduledAt: p.start } })),
				now
			);
		}
		return { placed: result.placements.length, unplaced: result.unplaced.length };
	}

	return { saveCapture, changeQuadrant, changeDueDate, reevaluateOpenTasks, findSlots };
}

export const taskActions = createTaskActions();
