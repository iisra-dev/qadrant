<script lang="ts">
	import { repos } from '$lib/db/repositories';
	import type { Settings } from '$lib/domain/types';
	import { normaliseUrl, serverApi, type ServerInfo } from '$lib/ownserver/client';
	import { serverErrorText } from '$lib/ownserver/errors';
	import { instructionsUrl } from '$lib/ownserver/repository';
	import { clock } from '$lib/app/clock.svelte';
	import { pendingChanges, syncState } from '$lib/stores';
	import { prepareSync, SYNC_API_VERSION } from '$lib/sync';
	import { syncStatusLine } from '$lib/sync/status';
	import { refreshCalendar } from '$lib/ownserver/calendar';
	import { askPermission, disablePush, enablePush, pushStatus, pushSupported, type PushStatus } from '$lib/ownserver/push';
	import { i18n } from '$lib/i18n/index.svelte';
	import { Button, SettingsGroup } from '$lib/ui';

	let { server, sync = false }: { server: Settings['server']; sync?: boolean } = $props();

	const m = $derived(i18n.m.server);

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

	// What the server can do: from API version 2 it syncs (docs/01).
	let info = $state<ServerInfo | null>(null);
	let syncMessage = $state('');
	$effect(() => {
		const current = server;
		info = null;
		if (!current) return;
		serverApi
			.ping(current)
			.then((result) => (info = result))
			.catch(() => (info = null));
	});
	const syncs = $derived(info === null || info.version >= SYNC_API_VERSION);
	const status = $derived(
		!syncs && !sync ? m.syncUnsupported : syncStatusLine(m, $syncState, $pendingChanges, clock.now, i18n.lang)
	);

	async function toggleSync(on: boolean) {
		if (!server) return;
		busy = true;
		syncMessage = '';
		try {
			if (on) {
				// Everything goes up and comes down again (docs/04).
				await prepareSync();
				await repos.settings.update({ sync: true });
			} else {
				await repos.settings.update({ sync: false });
				syncMessage = m.syncOff;
			}
		} finally {
			busy = false;
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

	function errorText(error: unknown, fallback: string): string {
		return serverErrorText(m, error, fallback);
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
			// Leaving the server also leaves sync; the server keeps its data (docs/02).
			await repos.settings.update({ server: undefined, sync: false });
			message = m.removed;
		} finally {
			busy = false;
		}
	}
</script>

<SettingsGroup title={m.title} summary={i18n.m.settings.serverSummary(Boolean(server))}>
	<p class="note">
		{m.intro}
		{#if instructionsUrl(i18n.lang)}
			<a href={instructionsUrl(i18n.lang)} target="_blank" rel="noopener noreferrer">{m.instructions}</a>
		{/if}
	</p>
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

		<div class="card">
			<div class="row">
				<label for="s-sync">{m.sync}</label>
				<input
					id="s-sync"
					class="check"
					type="checkbox"
					aria-describedby="s-sync-status"
					checked={sync}
					disabled={busy || (!syncs && !sync)}
					onchange={(e) => toggleSync(e.currentTarget.checked)}
				/>
			</div>
		</div>
		{#if sync || !syncs}
			<p class="note" id="s-sync-status" role="status">{status}</p>
		{/if}
		<p class="note" role="status">{syncMessage}</p>
		{#if sync}
			<p class="note">{m.syncLive}</p>
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
	<p class="note">{sync ? m.privacySync : m.privacy}</p>
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
	.check {
		width: 22px;
		height: 22px;
		margin: 0 var(--space-3);
		accent-color: var(--cta-bg);
	}
	.row label {
		flex-grow: 1;
		min-height: var(--touch);
		display: flex;
		align-items: center;
	}
	.note a {
		color: var(--text);
		text-underline-offset: 3px;
		display: inline-flex;
		align-items: center;
		min-height: var(--touch);
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
