<script lang="ts">
	import type { Snippet } from 'svelte';

	// Bottom sheet on mobile, centered modal on web. Native <dialog> with
	// showModal(): focus trap, Esc and inert background for free (docs/05).
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
		// A click on the backdrop lands on the dialog element itself.
		if (event.target === dialog) onclose();
	}}
>
	{#if open}
		<div class="content">
			<div class="handle" aria-hidden="true"></div>
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		margin: auto auto 0;
		width: 100%;
		max-width: 100%;
		max-height: 92dvh;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
		background: var(--surface);
		color: var(--text);
	}
	dialog::backdrop {
		background: var(--overlay);
	}
	.content {
		padding: var(--space-2-5) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.handle {
		align-self: center;
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: var(--border-strong);
	}
	@media (min-width: 768px) {
		dialog {
			margin: auto;
			width: min(560px, calc(100% - 48px));
			border-radius: var(--radius-sheet);
		}
		.content {
			padding: var(--space-6);
		}
		.handle {
			display: none;
		}
	}
</style>
