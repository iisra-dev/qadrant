<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	// immediate: the SPA mounts after window "load", so waiting for it would never register.
	const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
</script>

{#if $needRefresh}
	<div class="update" role="status">
		<p>{i18n.m.update.available}</p>
		<button type="button" onclick={() => updateServiceWorker(true)}>{i18n.m.update.reload}</button>
		<button type="button" onclick={() => needRefresh.set(false)}>{i18n.m.update.later}</button>
	</div>
{/if}
