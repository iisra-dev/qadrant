import type { Settings } from '$lib/domain/types';

export const MAX_GOALS = 5;
export const GOAL_SUMMARY_MAX = 80;

export function defaultSettings(now: Date = new Date()): Settings {
	const stamp = now.toISOString();
	return {
		id: 'settings',
		createdAt: stamp,
		updatedAt: stamp,
		urgencyDays: 2,
		workHours: { start: '09:00', end: '18:00' },
		workDays: [1, 2, 3, 4, 5],
		holidays: { national: true, extra: [] },
		thresholds: { low: 0.35, high: 0.65 },
		theme: 'system',
		model: { state: 'absent', wifiOnly: true },
		onboardingDone: false
	};
}
