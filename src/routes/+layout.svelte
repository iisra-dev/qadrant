<script lang="ts">
	import { pwaInfo } from 'virtual:pwa-info';
	import UpdateNotice from '$lib/pwa/UpdateNotice.svelte';

	let { children } = $props();
</script>

<svelte:head>
	{#if pwaInfo}
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

{@render children()}

<UpdateNotice />
