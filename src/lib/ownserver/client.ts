import type { Reminder } from './reminders';

export interface ServerConfig {
	url: string;
	token: string;
}

export class ServerError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
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
		response = await fetch(`${config.url}/api/cuadrante${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${config.token}`,
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
				...init.headers
			}
		});
	} catch {
		throw new ServerError('No se puede conectar con el servidor.');
	}
	if (response.status === 401) throw new ServerError('La clave de acceso no es correcta.', 401);
	if (!response.ok) throw new ServerError(`El servidor respondió con un error (${response.status}).`, response.status);
	return response;
}

export const serverApi = {
	async ping(config: ServerConfig): Promise<void> {
		const body = await (await call(config, '/ping')).json();
		if (!body?.ok) throw new ServerError('Esa dirección no es un servidor de Cuadrante.');
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
	async putReminders(config: ServerConfig, reminders: Reminder[]): Promise<void> {
		await call(config, '/reminders', { method: 'PUT', body: JSON.stringify(reminders) });
	}
};
