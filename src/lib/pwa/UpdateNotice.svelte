<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';

	// immediate: the SPA mounts after window "load", so waiting for it would never register.
	const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });
</script>

{#if $needRefresh}
	<div class="update" role="status">
		<p>Hay una versión nueva</p>
		<button type="button" onclick={() => updateServiceWorker(true)}>Actualizar</button>
		<button type="button" onclick={() => needRefresh.set(false)}>Ahora no</button>
	</div>
{/if}
