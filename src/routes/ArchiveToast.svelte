<script lang="ts">
	import { onMount } from 'svelte';

	// Undo for about 10 s; it does not close while it has the focus or the pointer (docs/01).
	let { count, onundo, ondismiss }: { count: number; onundo: () => void; ondismiss: () => void } = $props();

	const DURATION_MS = 10_000;
	let held = $state(false);
	let remaining = DURATION_MS;
	let startedAt = Date.now();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function schedule() {
		clearTimeout(timer);
		startedAt = Date.now();
		timer = setTimeout(ondismiss, remaining);
	}

	function hold() {
		if (held) return;
		held = true;
		clearTimeout(timer);
		remaining = Math.max(2000, remaining - (Date.now() - startedAt));
	}

	function release(event: FocusEvent | PointerEvent) {
		const next = (event as FocusEvent).relatedTarget as Node | null;
		if (next && (event.currentTarget as HTMLElement).contains(next)) return;
		held = false;
		schedule();
	}

	onMount(() => {
		schedule();
		return () => clearTimeout(timer);
	});
</script>

<div
	class="toast"
	role="status"
	onfocusin={hold}
	onfocusout={release}
	onpointerenter={hold}
	onpointerleave={release}
>
	<span>{count === 1 ? 'Tarea archivada' : `${count} tareas archivadas`}</span>
	<button type="button" onclick={onundo}>Deshacer</button>
</div>

<style>
	.toast {
		position: fixed;
		left: var(--space-4);
		right: var(--space-4);
		bottom: calc(150px + env(safe-area-inset-bottom));
		max-width: 480px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border-radius: var(--radius-block);
		background: var(--cta-bg);
		color: var(--cta-text);
		font-size: 14px;
	}
	button {
		min-height: var(--touch);
		padding: 0 var(--space-4);
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
