<script lang="ts">
	import { repos } from '$lib/db/repositories';
	import type { Settings } from '$lib/domain/types';
	import { normaliseUrl, ServerError, serverApi } from '$lib/ownserver/client';
	import { refreshCalendar } from '$lib/ownserver/calendar';
	import { askPermission, disablePush, enablePush, pushStatus, pushSupported, type PushStatus } from '$lib/ownserver/push';
	import { i18n } from '$lib/i18n/index.svelte';
	import { Button, SettingsGroup } from '$lib/ui';

	let { server }: { server: Settings['server'] } = $props();

	let url = $state('');
	let token = $state('');
	let message = $state('');
	let busy = $state(false);

	// Calendar (optional, only with the own server). The address stays on the server.
	let calendarConnected = $state<boolean | null>(null);
	let calendarUrl = $state('');
	let calendarMessage = $state('');

	// Notices on this device: permission and push subscription, checked again on return
	// to the app (after granting it in the system settings, for example).
	let notices = $state<PushStatus | null>(null);
	let noticesMessage = $state('');

	function refreshNotices() {
		pushStatus()
			.then((status) => (notices = status))
			.catch(() => (notices = null));
	}

	$effect(() => {
		if (!server) return;
		refreshNotices();
		const onVisible = () => document.visibilityState === 'visible' && refreshNotices();
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	async function turnOnNotices() {
		if (!server) return;
		// First thing in the tap, so Safari shows the permission prompt.
		const outcome = enablePush(server);
		busy = true;
		noticesMessage = '';
		try {
			const result = await outcome;
			noticesMessage = result === 'failed' ? m.noticesFailed : '';
		} finally {
			busy = false;
			refreshNotices();
		}
	}

	$effect(() => {
		const current = server;
		calendarConnected = null;
		if (!current) return;
		serverApi
			.calendar(current)
			.then((state) => (calendarConnected = state.connected))
			.catch(() => (calendarConnected = null));
	});

	async function connectCalendar(event: SubmitEvent) {
		event.preventDefault();
		if (!server) return;
		busy = true;
		calendarMessage = m.readingCalendar;
		try {
			const state = await serverApi.connectCalendar(server, calendarUrl.trim());
			calendarConnected = state.connected;
			calendarUrl = '';
			calendarMessage = m.calendarConnected(state.events.length);
			await refreshCalendar(server);
		} catch (error) {
			calendarMessage = errorText(error, m.calendarError);
		} finally {
			busy = false;
		}
	}

	async function disconnectCalendar() {
		if (!server) return;
		busy = true;
		try {
			await serverApi.disconnectCalendar(server);
			calendarConnected = false;
			calendarMessage = m.calendarRemoved;
			await refreshCalendar(server);
		} catch (error) {
			calendarMessage = errorText(error, m.calendarRemoveError);
		} finally {
			busy = false;
		}
	}

	const m = $derived(i18n.m.server);

	/** The message of a server error, in the interface language. */
	function errorText(error: unknown, fallback: string): string {
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

	async function connect(event: SubmitEvent) {
		event.preventDefault();
		const clean = normaliseUrl(url);
		if (!clean) {
			message = m.httpsOnly;
			return;
		}
		// Asked before any await: Safari only shows the prompt within the tap.
		const permission = pushSupported() ? askPermission() : null;
		busy = true;
		message = m.connecting;
		try {
			const config = { url: clean, token: token.trim() };
			await serverApi.ping(config);
			await repos.settings.update({ server: config });
			message = m[await enablePush(config, permission ?? undefined)];
			url = token = '';
			refreshNotices();
		} catch (error) {
			message = errorText(error, m.genericError);
		} finally {
			busy = false;
		}
	}

	async function disconnect() {
		if (!server) return;
		busy = true;
		try {
			await disablePush(server).catch(() => {});
			await serverApi.putReminders(server, []).catch(() => {});
			await repos.settings.update({ server: undefined });
			message = m.removed;
		} finally {
			busy = false;
		}
	}
</script>

<SettingsGroup title={m.title} summary={i18n.m.settings.serverSummary(Boolean(server))}>
	<div class="card">
		{#if server}
			<div class="row">
				<span class="url">{server.url}</span>
				<Button variant="text" onclick={disconnect} disabled={busy}>{i18n.m.common.remove}</Button>
			</div>
		{:else}
			<form onsubmit={connect}>
				<label for="server-url">{m.address}</label>
				<input id="server-url" type="url" inputmode="url" autocomplete="off" placeholder="https://qadrant.example.com" bind:value={url} required />
				<label for="server-token">{m.key}</label>
				<input id="server-token" type="password" autocomplete="off" bind:value={token} required />
				<Button type="submit" variant="secondary" disabled={busy}>{m.connect}</Button>
			</form>
		{/if}
	</div>
	<p class="note" role="status">{message}</p>

	{#if server}
		<h3 id="s-notices">{m.notices}</h3>
		<div class="card" aria-labelledby="s-notices" role="group">
			<div class="row">
				<span>{notices ? m.noticesState[notices] : ''}</span>
				{#if notices === 'off' || notices === 'blocked'}
					<Button variant="secondary" onclick={turnOnNotices} disabled={busy}>{m.turnOnNotices}</Button>
				{/if}
			</div>
		</div>
		<p class="note" role="status">{noticesMessage}</p>
		{#if notices === 'blocked' || notices === 'unsupported'}
			<p class="note">{notices === 'blocked' ? m.noticesBlockedHelp : m.noticesUnsupportedHelp}</p>
		{/if}

		<h3 id="s-calendar">{m.calendar}</h3>
		<div class="card" aria-labelledby="s-calendar" role="group">
			{#if calendarConnected}
				<div class="row">
					<span>{m.connected}</span>
					<Button variant="text" onclick={disconnectCalendar} disabled={busy}>{i18n.m.common.remove}</Button>
				</div>
			{:else if calendarConnected === false}
				<form onsubmit={connectCalendar}>
					<label for="calendar-url">{m.calendarAddress}</label>
					<input
						id="calendar-url"
						type="url"
						inputmode="url"
						autocomplete="off"
						placeholder={m.calendarPlaceholder}
						bind:value={calendarUrl}
						required
					/>
					<Button type="submit" variant="secondary" disabled={busy}>{m.connectCalendar}</Button>
				</form>
			{:else}
				<p class="note">{m.calendarUnavailable}</p>
			{/if}
		</div>
		<p class="note" role="status">{calendarMessage}</p>
		<p class="note">{m.calendarNote}</p>
	{/if}
	<p class="note">{m.privacy}</p>
</SettingsGroup>

<style>
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		padding: var(--space-3) var(--space-4);
	}
	h3 {
		margin: var(--space-2) var(--space-1) 0;
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: 14px;
	}
	.url {
		font-family: var(--font-mono);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: stretch;
		font-size: 14px;
	}
	input {
		min-height: var(--touch);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		padding: 0 var(--space-3);
		background: var(--surface);
		font-size: 14px;
	}
	.note {
		margin: 0 var(--space-1);
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.note:empty {
		display: none;
	}
</style>
