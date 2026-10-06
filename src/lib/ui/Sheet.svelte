<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';

	// Bottom sheet on mobile, centered modal on web. Native <dialog> with
	// showModal(): focus trap, Esc and inert background for free (docs/05).
	// It slides in and out (fades with reduced motion) and, on a phone, can be
	// dragged down by its grabber to close.
	let {
		open,
		label,
		onclose,
		children
	}: { open: boolean; label: string; onclose: () => void; children: Snippet } = $props();

	/** Length of the closing animation in the CSS below. */
	const CLOSE_MS = 280;
	/** A drag past this distance, or a quick flick down, closes the sheet. */
	const DISMISS_PX = 120;
	const DISMISS_SPEED = 0.6; // px per ms

	let dialog: HTMLDialogElement | undefined = $state();
	let visible = $state(false);
	let closing = $state(false);
	let closeTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (!dialog) return;
		const wantOpen = open;
		untrack(() => {
			if (wantOpen) {
				clearTimeout(closeTimer);
				closing = false;
				visible = true;
				if (!dialog!.open) dialog!.showModal();
			} else if (dialog!.open && !closing) {
				closing = true;
				closeTimer = setTimeout(() => {
					closing = false;
					visible = false;
					dragY = 0;
					dialog?.close();
				}, CLOSE_MS);
			}
		});
	});

	// Dragging the grabber down follows the finger; letting go far or fast enough closes.
	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;
	let lastY = 0;
	let lastT = 0;
	let speed = 0;

	function dragStart(event: PointerEvent) {
		dragging = true;
		startY = lastY = event.clientY;
		lastT = event.timeStamp;
		speed = 0;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function dragMove(event: PointerEvent) {
		if (!dragging) return;
		const dt = event.timeStamp - lastT;
		if (dt > 0) speed = (event.clientY - lastY) / dt;
		lastY = event.clientY;
		lastT = event.timeStamp;
		// Upwards it resists, as iOS sheets do.
		const dy = event.clientY - startY;
		dragY = dy > 0 ? dy : dy / 6;
	}

	function dragEnd() {
		if (!dragging) return;
		dragging = false;
		if (dragY > DISMISS_PX || speed > DISMISS_SPEED) onclose();
		else dragY = 0;
	}

	// iOS does not resize the layout for the keyboard: lift the sheet by the part it covers.
	let keyboard = $state(0);
	$effect(() => {
		const viewport = window.visualViewport;
		if (!visible || !viewport) return;
		const update = () => (keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
		update();
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
			keyboard = 0;
		};
	});
</script>

<dialog
	bind:this={dialog}
	class:closing
	class:dragging
	aria-label={label}
	style:--drag={`${dragY}px`}
	style:--keyboard={`${keyboard}px`}
	oncancel={(event) => {
		// Esc: close with the animation instead of at once.
		event.preventDefault();
		onclose();
	}}
	onclose={() => {
		// Closed by something other than this component (a form with method="dialog").
		if (open) onclose();
	}}
	onclick={(event) => {
		// A click on the backdrop lands on the dialog element itself.
		if (event.target === dialog) onclose();
	}}
>
	{#if visible}
		<div class="content">
			<div
				class="grabber"
				role="presentation"
				onpointerdown={dragStart}
				onpointermove={dragMove}
				onpointerup={dragEnd}
				onpointercancel={dragEnd}
			>
				<span class="handle"></span>
			</div>
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		margin: auto auto var(--keyboard, 0px);
		width: 100%;
		max-width: 100%;
		max-height: calc(92dvh - var(--keyboard, 0px));
		padding: 0;
		border: 0;
		border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 -8px 30px rgb(9 9 11 / 0.12);
		transform: translateY(var(--drag, 0px));
		transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	dialog.dragging {
		transition: none;
	}
	/* iOS sheet curve in; a quicker ease out. */
	dialog[open] {
		animation: sheet-in 420ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	dialog.closing {
		animation: sheet-out 280ms cubic-bezier(0.4, 0, 1, 1) forwards;
	}
	dialog::backdrop {
		background: var(--overlay);
	}
	dialog[open]::backdrop {
		animation: fade-in 250ms ease;
	}
	dialog.closing::backdrop {
		animation: fade-out 280ms ease forwards;
	}
	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes sheet-out {
		to {
			transform: translateY(100%);
		}
	}
	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}
	@keyframes pop-out {
		to {
			opacity: 0;
			transform: scale(0.96);
		}
	}
	.content {
		padding: 0 var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	/* A tall strip around the small handle, so it is easy to grab. */
	.grabber {
		align-self: stretch;
		height: 24px;
		margin-bottom: calc(-1 * var(--space-2));
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: none;
		cursor: grab;
	}
	.handle {
		width: 36px;
		height: 5px;
		border-radius: 3px;
		background: var(--border-strong);
	}
	@media (min-width: 768px) {
		dialog {
			margin: auto;
			width: min(560px, calc(100% - 48px));
			max-height: 92dvh;
			border-radius: var(--radius-sheet);
			transform: none;
		}
		dialog[open] {
			animation: pop-in 220ms cubic-bezier(0.32, 0.72, 0, 1);
		}
		dialog.closing {
			animation: pop-out 160ms ease-in forwards;
		}
		.content {
			padding: var(--space-6);
		}
		.grabber {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		dialog[open],
		dialog[open]::backdrop {
			animation: fade-in 150ms linear;
		}
		dialog.closing,
		dialog.closing::backdrop {
			animation: fade-out 150ms linear forwards;
		}
	}
</style>
