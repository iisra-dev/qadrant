import type { Task } from '$lib/domain/types';

export type ReminderKind = 'due' | 'follow-up';

/** What the own server receives about a task (docs/02): id, time, kind and title. Nothing else. */
export interface Reminder {
	taskId: string;
	kind: ReminderKind;
	at: string;
	title: string;
}

const MAX_TITLE = 200;

/**
 * Reminders for the open tasks: due date notices and follow-ups of delegated
 * tasks. Past times are left out so a reconnect does not flood old notices.
 */
export function remindersFor(tasks: Task[], now: Date): Reminder[] {
	const list: Reminder[] = [];
	for (const task of tasks) {
		if (task.status !== 'open' || task.deletedAt) continue;
		const title = task.title.slice(0, MAX_TITLE);
		if (task.dueAt && new Date(task.dueAt).getTime() > now.getTime()) {
			list.push({ taskId: task.id, kind: 'due', at: task.dueAt, title });
		}
		if (task.quadrant === 'delegate' && task.followUpAt && new Date(task.followUpAt).getTime() > now.getTime()) {
			list.push({ taskId: task.id, kind: 'follow-up', at: task.followUpAt, title });
		}
	}
	return list.sort((a, b) => a.at.localeCompare(b.at) || a.taskId.localeCompare(b.taskId) || a.kind.localeCompare(b.kind));
}

/** Stable fingerprint, to skip sending a list that did not change. */
export function fingerprint(list: Reminder[]): string {
	return JSON.stringify(list);
}
