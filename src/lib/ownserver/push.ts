import { serverApi, type ServerConfig } from './client';

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export type PushOutcome = 'enabled' | 'denied' | 'unsupported' | 'failed';
export type PushStatus = 'on' | 'off' | 'blocked' | 'unsupported';

/** Web Push needs a service worker, PushManager and Notification (on iPhone, only once installed). */
export function pushSupported(): boolean {
	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Asks for notification permission. Call it before any other await in a click
 * handler: Safari only shows the prompt while it still counts as the user's tap.
 */
export function askPermission(): Promise<NotificationPermission> {
	return pushSupported() ? Notification.requestPermission() : Promise.resolve('denied');
}

/** Whether this browser gets notices: permission granted and subscribed to the push service. */
export async function pushStatus(): Promise<PushStatus> {
	if (!pushSupported()) return 'unsupported';
	const permission = await notificationPermission();
	if (permission === 'denied') return 'blocked';
	if (permission !== 'granted') return 'off';
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	return subscription ? 'on' : 'off';
}

/** The Permissions API when there is one: it follows the browser settings even where Notification.permission lags. */
async function notificationPermission(): Promise<NotificationPermission> {
	try {
		const { state } = await navigator.permissions.query({ name: 'notifications' });
		return state === 'prompt' ? 'default' : state;
	} catch {
		return Notification.permission;
	}
}

/**
 * Asks for notification permission (only when the user sets up the server or
 * taps "Turn on notices"; never on start) and registers this browser with the
 * server. The permission is asked as soon as this is called, so call it, or
 * askPermission(), straight from the tap.
 */
export async function enablePush(config: ServerConfig, permissionRequest = askPermission()): Promise<PushOutcome> {
	if (!pushSupported()) return 'unsupported';
	const permission = await permissionRequest;
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
