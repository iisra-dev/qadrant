import { openStorage } from './open';

// Every module waits for the storage to open, so none of them touches the wrong one.
const storage = await openStorage();

/** The app's database: on disk, or in memory when the browser blocks its storage. */
export const db = storage.db;
export const storageMode = storage.mode;
