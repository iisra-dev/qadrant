import { liveQuery } from 'dexie';
import { readable, type Readable } from 'svelte/store';

/**
 * A Svelte store over a Dexie liveQuery: it re-runs the query whenever the
 * tables it read change, in this tab or another one.
 */
export function live<T>(query: () => Promise<T>, initial: T): Readable<T> {
	return readable(initial, (set) => {
		const subscription = liveQuery(query).subscribe({
			next: set,
			error: (error) => console.error('liveQuery failed', error)
		});
		return () => subscription.unsubscribe();
	});
}
