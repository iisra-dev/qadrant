<script lang="ts">
	import type { Snippet } from 'svelte';

	// Side panel on web, over a native <dialog> like Sheet.
	let {
		open,
		label,
		onclose,
		children
	}: { open: boolean; label: string; onclose: () => void; children: Snippet } = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	aria-label={label}
	onclose={onclose}
	onclick={(event) => {
		if (event.target === dialog) onclose();
	}}
>
	{#if open}{@render children()}{/if}
</dialog>

<style>
	dialog {
		margin: 0 0 0 auto;
		width: min(440px, 100%);
		max-width: 100%;
		height: 100dvh;
		max-height: 100dvh;
		padding: 0;
		border: 0;
		border-left: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
	}
	dialog::backdrop {
		background: var(--overlay);
	}
</style>
