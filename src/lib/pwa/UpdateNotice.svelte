<script lang="ts">
	import { onMount } from 'svelte';
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { Button, Sheet } from '$lib/ui';

	// immediate: the SPA mounts after window "load", so waiting for it would never register.
	const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });

	// A popup, but never on top of another one (a capture half typed, say):
	// it waits until that one closes.
	let otherOpen = $state(false);
	let self: HTMLDivElement | undefined = $state();

	function check() {
		otherOpen = [...document.querySelectorAll('dialog[open]')].some((dialog) => !self?.contains(dialog));
	}

	onMount(() => {
		check();
		const observer = new MutationObserver(check);
		observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
		return () => observer.disconnect();
	});

	const open = $derived($needRefresh && !otherOpen);
</script>

<div bind:this={self}>
	<Sheet {open} label={i18n.m.update.available} onclose={() => needRefresh.set(false)}>
		<h2 class="title">{i18n.m.update.available}</h2>
		<p class="text">{i18n.m.update.text}</p>
		<Button size="lg" block onclick={() => updateServiceWorker(true)}>{i18n.m.update.reload}</Button>
		<Button variant="secondary" size="lg" block onclick={() => needRefresh.set(false)}>{i18n.m.update.later}</Button>
	</Sheet>
</div>

<style>
	.title {
		margin: 0;
		font-size: 22px;
	}
	.text {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
</style>
