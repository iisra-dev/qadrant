<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';
	import { capture } from '$lib/app/capture.svelte';
	import { clock } from '$lib/app/clock.svelte';
	import { media } from '$lib/app/media.svelte';
	import { currentSettings } from '$lib/app/context';
	import CaptureSheet from '$lib/capture/CaptureSheet.svelte';
	import UpdateNotice from '$lib/pwa/UpdateNotice.svelte';
	import { repos } from '$lib/db/repositories';
	import { taskActions } from '$lib/tasks/actions';
	import { CALENDAR_REFRESH_MS, refreshCalendar } from '$lib/ownserver/calendar';
	import { createReminderSync } from '$lib/ownserver/sync';
	import { activeGoals, allTasks, openTasks, settings } from '$lib/stores';
	import { engineState, startEngine, teachEngine } from '$lib/engine';
	import { importanceLabels, recalibrateThresholds, trainingSet } from '$lib/domain/learning';
	import type { Settings } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import { applyTheme } from '$lib/theme';
	import { AppFooter, TabBar, WebHeader } from '$lib/ui';

	let { children } = $props();

	onMount(() => {
		const stopClock = clock.start();
		const stopMedia = media.start();
		return () => {
			stopClock();
			stopMedia();
		};
	});

	// Passage of time (docs/03): on start and whenever the day changes.
	$effect(() => {
		void clock.today;
		repos.settings.get().then(() => taskActions.reevaluateOpenTasks(currentSettings()));
	});

	// Own server (phase 3): keep its reminders in step with the tasks.
	const reminderSync = createReminderSync();
	$effect(() => {
		reminderSync.update($openTasks, $settings?.server);
	});

	// Calendar copy (optional): on start, when the server changes and every 15 minutes.
	// Only a change of server (not of other settings) restarts it.
	const serverKey = $derived($settings ? JSON.stringify($settings.server ?? null) : undefined);
	$effect(() => {
		if (serverKey === undefined) return;
		const server = JSON.parse(serverKey) as NonNullable<typeof $settings>['server'] | null ?? undefined;
		void refreshCalendar(server);
		if (!server) return;
		const timer = setInterval(() => refreshCalendar(server), CALENDAR_REFRESH_MS);
		return () => clearInterval(timer);
	});

	// Settings are the source of truth for the theme; localStorage only mirrors it for the first paint.
	$effect(() => {
		if ($settings) applyTheme($settings.theme);
	});

	// Interface language (device-local setting, English by default).
	$effect(() => {
		if ($settings) i18n.set($settings.language ?? 'en');
	});

	// The engine opens the model in the background once the welcome is done (docs/03).
	let engineStarted = false;
	$effect(() => {
		if (!$settings?.onboardingDone || engineStarted) return;
		engineStarted = true;
		startEngine({ autoDownload: $settings.model.autoDownload ?? true, wifiOnly: $settings.model.wifiOnly });
	});

	// Settings keeps what the assistant has on this device (device-local, docs/04).
	$effect(() => {
		const { model, version, sizeBytes } = engineState.status;
		const current = $settings?.model;
		if (!current || model === 'checking' || model === 'downloading') return;
		const state: Settings['model']['state'] = model === 'unavailable' ? 'absent' : model;
		if (current.state === state && current.version === version && current.sizeBytes === sizeBytes) return;
		void repos.settings.update({ model: { ...current, state, version, sizeBytes } });
	});

	// What the user's choices teach: classifiers on the device and the thresholds (docs/03).
	$effect(() => {
		const examples = trainingSet($allTasks);
		const goals = $activeGoals;
		const timer = setTimeout(() => teachEngine(examples, goals), 2000);
		return () => clearTimeout(timer);
	});
	$effect(() => {
		const current = $settings?.thresholds;
		const next = recalibrateThresholds(importanceLabels($allTasks));
		if (!current || !next || (next.low === current.low && next.high === current.high)) return;
		void repos.settings.update({ thresholds: next });
	});

	// First run: the welcome screen, only once (docs/01).
	$effect(() => {
		if (!$settings) return;
		const onWelcome = page.url.pathname.startsWith('/welcome');
		if (!$settings.onboardingDone && !onWelcome) void goto('/welcome', { replaceState: true });
		if ($settings.onboardingDone && onWelcome) void goto('/', { replaceState: true });
	});

	const section = $derived('/' + (page.url.pathname.split('/')[1] ?? ''));
	const showTabs = $derived(section !== '/task' && section !== '/welcome');
</script>

<svelte:head>
	{#if pwaInfo}
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

<div class="app">
	{#if showTabs && media.web}
		<WebHeader current={section} oncapture={(text) => capture.show(text)} />
	{/if}
	<main>
		{@render children()}
	</main>
	{#if media.web && section !== '/task'}
		<AppFooter />
	{/if}
	{#if showTabs && !media.web}
		<div class="tabs"><TabBar current={section} /></div>
	{/if}
</div>

<CaptureSheet />
<UpdateNotice />

<style>
	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}
	main {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.tabs {
		position: sticky;
		bottom: 0;
	}
</style>
