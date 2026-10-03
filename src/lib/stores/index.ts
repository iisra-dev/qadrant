import { repos } from '$lib/db/repositories';
import type { Goal, Person, Settings, Task } from '$lib/domain/types';
import { live } from './live';

export const openTasks = live<Task[]>(() => repos.tasks.listOpen(), []);
export const activeGoals = live<Goal[]>(() => repos.goals.listActive(), []);
export const people = live<Person[]>(() => repos.people.list(), []);
// undefined until the settings record has been read or created.
export const settings = live<Settings | undefined>(() => repos.settings.get(), undefined);
