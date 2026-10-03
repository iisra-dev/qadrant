import { serverApi, type ServerConfig } from './client';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export type PushOutcome = 'enabled' | 'denied' | 'unsupported' | 'failed';

/**
 * Asks for notification permission (only here, when the user sets up the
 * server; never on start) and registers this browser with the server.
 */
export async function enablePush(config: ServerConfig): Promise<PushOutcome> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return 'denied';
	try {
		const registration = await navigator.serviceWorker.ready;
		const key = await serverApi.vapidKey(config);
		let subscription = await registration.pushManager.getSubscription();
		if (subscription && !sameKey(subscription, key)) {
			await subscription.unsubscribe();
			subscription = null;
		}
		subscription ??= await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: base64UrlToBytes(key)
		});
		await serverApi.subscribe(config, subscription.toJSON());
		return 'enabled';
	} catch {
		return 'failed';
	}
}

function sameKey(subscription: PushSubscription, key: string): boolean {
	const current = subscription.options.applicationServerKey;
	if (!current) return false;
	const a = new Uint8Array(current);
	const b = base64UrlToBytes(key);
	return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** Removes this browser from the server and from the push service. */
export async function disablePush(config: ServerConfig): Promise<void> {
	if (!('serviceWorker' in navigator)) return;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	if (!subscription) return;
	try {
		await serverApi.unsubscribe(config, subscription.endpoint);
	} finally {
		await subscription.unsubscribe();
	}
}
