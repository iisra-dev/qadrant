<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { pwaInfo } from 'virtual:pwa-info';
	import { clock } from '$lib/app/clock.svelte';
	import { currentSettings } from '$lib/app/context';
	import CaptureSheet from '$lib/capture/CaptureSheet.svelte';
	import UpdateNotice from '$lib/pwa/UpdateNotice.svelte';
	import { repos } from '$lib/db/repositories';
	import { taskActions } from '$lib/tasks/actions';
	import { TabBar } from '$lib/ui';

	let { children } = $props();

	onMount(() => clock.start());

	// Passage of time (docs/03): on start and whenever the day changes.
	$effect(() => {
		void clock.today;
		repos.settings.get().then(() => taskActions.reevaluateOpenTasks(currentSettings()));
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
	<main>
		{@render children()}
	</main>
	{#if showTabs}
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
