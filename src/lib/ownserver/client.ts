import type { CalendarEvent } from '$lib/domain/types';
import type { Reminder } from './reminders';
import type { PullPage, PushItem, PushResponse } from '$lib/sync/api';

export interface CalendarState {
	connected: boolean;
	events: CalendarEvent[];
	fetchedAt?: string;
	error?: string;
}

export interface ServerConfig {
	url: string;
	token: string;
}

/** What /ping says about the server: its API version (2 and later sync) and the id of its synced data. */
export interface ServerInfo {
	version: number;
	syncId?: string;
}

export type ServerErrorCode = 'unreachable' | 'unauthorized' | 'status' | 'notQadrant' | 'calendarUnreadable';

/** The interface turns the code into a message in its language. */
export class ServerError extends Error {
	constructor(
		readonly code: ServerErrorCode,
		readonly status?: number
	) {
		super(code);
	}
}

/** Normalises what the user pastes: https only, no trailing slash. */
export function normaliseUrl(input: string): string | null {
	try {
		const url = new URL(input.trim());
		if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return null;
		return url.origin + url.pathname.replace(/\/+$/, '');
	} catch {
		return null;
	}
}

async function call(config: ServerConfig, path: string, init: RequestInit = {}): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(`${config.url}/api/qadrant${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${config.token}`,
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
				...init.headers
			}
		});
	} catch {
		throw new ServerError('unreachable');
	}
	if (response.status === 401) throw new ServerError('unauthorized', 401);
	if (!response.ok) throw new ServerError('status', response.status);
	return response;
}

export const serverApi = {
	async ping(config: ServerConfig): Promise<ServerInfo> {
		const body = await (await call(config, '/ping')).json().catch(() => null);
		if (!body?.ok) throw new ServerError('notQadrant');
		return { version: Number(body.version) || 1, ...(typeof body.syncId === 'string' && { syncId: body.syncId }) };
	},
	async vapidKey(config: ServerConfig): Promise<string> {
		return (await (await call(config, '/vapid')).json()).publicKey;
	},
	async subscribe(config: ServerConfig, subscription: PushSubscriptionJSON): Promise<void> {
		await call(config, '/subscriptions', { method: 'POST', body: JSON.stringify(subscription) });
	},
	async unsubscribe(config: ServerConfig, endpoint: string): Promise<void> {
		await call(config, '/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) });
	},
	/** With `version` (devices that sync), the server ignores lists older than the last one. */
	async putReminders(config: ServerConfig, reminders: Reminder[], version?: number): Promise<void> {
		const query = version === undefined ? '' : `?version=${version}`;
		await call(config, `/reminders${query}`, { method: 'PUT', body: JSON.stringify(reminders) });
	},
	async syncPush(config: ServerConfig, items: PushItem[]): Promise<PushResponse> {
		return (await call(config, '/sync/push', { method: 'POST', body: JSON.stringify(items) })).json();
	},
	async syncPull(config: ServerConfig, since: number): Promise<PullPage> {
		return (await call(config, `/sync/pull?since=${since}`)).json();
	},
	/** The change stream (SSE). Read with fetch: EventSource cannot send Authorization. */
	async syncEvents(config: ServerConfig, signal: AbortSignal): Promise<Response> {
		return call(config, '/sync/events', { signal, headers: { Accept: 'text/event-stream' } });
	},
	async calendar(config: ServerConfig): Promise<CalendarState> {
		return (await call(config, '/calendar')).json();
	},
	/** The secret address goes to the server only; the app keeps nothing but the events. */
	async connectCalendar(config: ServerConfig, url: string): Promise<CalendarState> {
		try {
			return (await call(config, '/calendar', { method: 'PUT', body: JSON.stringify({ url }) })).json();
		} catch (error) {
			if (error instanceof ServerError && error.status === 400) {
				throw new ServerError('calendarUnreadable', 400);
			}
			throw error;
		}
	},
	async disconnectCalendar(config: ServerConfig): Promise<void> {
		await call(config, '/calendar', { method: 'DELETE' });
	}
};
