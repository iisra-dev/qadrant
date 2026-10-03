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
	import { settings } from '$lib/stores';
	import { applyTheme } from '$lib/theme';
	import { TabBar, WebHeader } from '$lib/ui';

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

	// Settings are the source of truth for the theme; localStorage only mirrors it for the first paint.
	$effect(() => {
		if ($settings) applyTheme($settings.theme);
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
