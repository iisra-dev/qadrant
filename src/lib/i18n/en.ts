import type { Quadrant } from '$lib/domain/types';

// English (US) catalog. Spanish (es.ts) must have the same shape.
export const en = {
	quadrants: {
		do: { name: 'Do', rule: 'Urgent · Important', empty: 'Nothing urgent. A good time to Schedule.', result: 'Urgent and important' },
		schedule: { name: 'Schedule', rule: 'Not urgent · Important', empty: 'Nothing to plan yet.', result: 'Important, no rush' },
		delegate: { name: 'Delegate', rule: 'Urgent · Not important', empty: 'Nothing to hand off.', result: 'Someone else can do it' },
		eliminate: { name: 'Eliminate', rule: 'Not urgent · Not important', empty: 'Nothing to spare. Good.', result: 'Neither urgent nor important' }
	} satisfies Record<Quadrant, { name: string; rule: string; empty: string; result: string }>,
	explain: {
		window: (n: number) => (n === 1 ? 'the next working day' : `within the next ${n} working days`),
		noDate: 'No date, so not urgent.',
		dueSoon: (window: string) => `Due ${window}.`,
		overdue: (when: string) => `Was due ${when}.`,
		dueLater: (when: string) => `Due ${when}, so not urgent yet.`,
		noAssistant: (quadrant: string) => `No assistant, goes to ${quadrant}.`,
		importanceGoal: (percent: string, goal: string) => `Importance ${percent} for your goal “${goal}”.`,
		importance: (percent: string) => `Importance ${percent}.`,
		someoneElse: 'Someone else can do it.',
		nobodyElse: 'Nobody else can do it.',
		assignedTo: (name: string) => `You assigned it to ${name}.`,
		assignedToSomeone: 'You assigned it to someone else.',
		answeredDelegable: 'You said someone else can do it.',
		answeredNotDelegable: 'You said nobody else can do it.',
		answeredImportant: 'You said it is important.',
		answeredNotImportant: 'You said it is not important.',
		movedByHand: 'You moved it.',
		moved: (quadrant: string) => `Moved to ${quadrant}.`,
		movedOut: (quadrant: string, window: string) => `Moved to ${quadrant} because it is no longer due ${window}.`,
		movedIn: (quadrant: string, overdue: boolean, when: string) =>
			`Moved to ${quadrant} because it ${overdue ? 'was due' : 'is due'} ${when}.`,
		doubtImportance: (urgency: string) => `${urgency} All that's left is whether it matters to you.`,
		doubtDelegable: (urgency: string) => `${urgency} and doesn't look important. All that's left is whether someone else can do it.`,
		lineNoDate: 'No · no date',
		lineOverdue: (when: string) => `Yes · was due ${when}`,
		lineDue: (urgent: boolean, when: string) => `${urgent ? 'Yes' : 'No'} · due ${when}`,
		lineGoal: (percent: string, goal: string) => `${percent} · goal “${goal}”`,
		lineNoAssistant: 'No assistant',
		lineNoTime: 'No time',
		today: 'Today',
		tomorrow: 'Tomorrow'
	}
};

export type Messages = typeof en;
