import { formatShortDateTime } from '$lib/domain/format';
import type { Messages } from '$lib/i18n/catalog';
import type { Lang } from '$lib/i18n/lang';
import type { SyncState } from './types';

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function agoText(m: Messages['server'], at: string, now: Date, lang: Lang): string {
	const minutes = Math.floor((now.getTime() - new Date(at).getTime()) / 60_000);
	if (minutes < 1) return m.justNow;
	if (minutes < 60) return m.minutesAgo(minutes);
	if (minutes < 24 * 60) return m.hoursAgo(Math.floor(minutes / 60));
	return m.onDate(formatShortDateTime(new Date(at), lang));
}

/** The status line under "Sincronizar mis tareas" (docs/01). */
export function syncStatusLine(
	m: Messages['server'],
	state: Pick<SyncState, 'lastSyncAt' | 'lastError'> | undefined,
	pending: number,
	now: Date,
	lang: Lang
): string {
	switch (state?.lastError) {
		case 'unsupported':
			return m.syncUnsupported;
		case 'unauthorized':
			return m.syncUnauthorized;
		case 'failed':
			return m.syncFailed;
		case 'offline':
			if (pending) return `${capitalise(m.pending(pending))}, ${m.offline}.`;
	}
	const synced = state?.lastSyncAt ? m.syncedAgo(agoText(m, state.lastSyncAt, now, lang)) : m.syncNever;
	return pending ? `${synced} ${capitalise(m.pending(pending))}.` : synced;
}
