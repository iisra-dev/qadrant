import type { Messages } from '$lib/i18n/catalog';
import { ServerError } from './client';

/** The message of a server error, in the interface language. */
export function serverErrorText(m: Messages['server'], error: unknown, fallback: string): string {
	if (!(error instanceof ServerError)) return fallback;
	switch (error.code) {
		case 'unreachable':
			return m.cannotConnect;
		case 'unauthorized':
			return m.wrongKey;
		case 'notQadrant':
			return m.notQadrant;
		case 'calendarUnreadable':
			return m.calendarUnreadable;
		default:
			return m.serverError(error.status ?? 0);
	}
}
