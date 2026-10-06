import { repos } from '$lib/db/repositories';
import type { CalendarEvent, Goal, Person, Settings, Task } from '$lib/domain/types';
import { live } from './live';

export const openTasks = live<Task[]>(() => repos.tasks.listOpen(), []);
/** Open, done and archived: the labels the engine learns from (docs/03). */
export const allTasks = live<Task[]>(() => repos.tasks.listAll(), []);
export const activeGoals = live<Goal[]>(() => repos.goals.listActive(), []);
export const people = live<Person[]>(() => repos.people.list(), []);
// undefined until the settings have been read; liveQuery only allows read-only queries.
export const settings = live<Settings | undefined>(() => repos.settings.peek(), undefined);
export const calendarEvents = live<CalendarEvent[]>(() => repos.events.list(), []);
