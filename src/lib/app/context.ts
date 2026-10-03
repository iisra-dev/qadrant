import { get } from 'svelte/store';
import { defaultSettings } from '$lib/db/defaults';
import type { ClassifyContext, Settings } from '$lib/domain/types';
import { activeGoals, people, settings } from '$lib/stores';

export function currentSettings(): Settings {
	return get(settings) ?? defaultSettings();
}

/** Everything classify() needs, from the live stores. */
export function classifyContext(now = new Date()): ClassifyContext {
	return { now, goals: get(activeGoals), people: get(people), settings: currentSettings() };
}
