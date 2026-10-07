import { liveQuery } from 'dexie';
import { readable, writable, type Readable } from 'svelte/store';

/** Set when IndexedDB cannot be read (private browsing, blocked site data): the layout says so instead of looking empty. */
export const storageError = writable(false);

/**
 * A Svelte store over a Dexie liveQuery: it re-runs the query whenever the
 * tables it read change, in this tab or another one. `onFirst` runs once the
 * first result is in, so screens can tell "empty" from "not read yet".
 */
export function live<T>(query: () => Promise<T>, initial: T, onFirst?: () => void): Readable<T> {
	return readable(initial, (set) => {
		const subscription = liveQuery(query).subscribe({
			next: (value) => {
				set(value);
				onFirst?.();
			},
			error: (error) => {
				console.error('liveQuery failed', error);
				storageError.set(true);
			}
		});
		return () => subscription.unsubscribe();
	});
}
