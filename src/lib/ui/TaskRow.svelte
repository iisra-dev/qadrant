<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		href,
		detail,
		meta,
		overdue = false,
		done = false,
		oncomplete,
		onreopen
	}: {
		title: string;
		href: string;
		/** Secondary text after the title, e.g. the assignee. */
		detail?: string;
		/** Short trailing text, e.g. today's time. */
		meta?: string;
		overdue?: boolean;
		/** Done in the last 24 hours: struck through, still in its quadrant (docs/01). */
		done?: boolean;
		oncomplete: () => void;
		/** Unticking a done task opens it again. */
		onreopen?: () => void;
	} = $props();

	// Swiping left reveals "Done": a shortcut for touch, never the only way.
	// The checkbox stays visible and does the same (docs/05, TaskRow).
	const REVEAL = 96;
	const SLOP = 10;
	let offset = $state(0);
	let open = $state(false);
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let base = 0;
	let mode: 'idle' | 'pending' | 'swipe' = 'idle';
	let swiped = false;

	function down(event: PointerEvent) {
		if (event.pointerType === 'mouse' || done) return;
		mode = 'pending';
		swiped = false;
		startX = event.clientX;
		startY = event.clientY;
		base = open ? -REVEAL : 0;
	}

	function move(event: PointerEvent) {
		if (mode === 'idle') return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (mode === 'pending') {
			if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) {
				mode = 'idle';
				return;
			}
			if (Math.abs(dx) <= SLOP) return;
			mode = 'swipe';
			swiped = true;
			dragging = true;
			try {
				(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			} catch {
				// The pointer is already gone; the swipe still follows the moves it gets.
			}
		}
		offset = Math.max(-REVEAL * 1.5, Math.min(0, base + dx));
	}

	function up() {
		if (mode === 'swipe') {
			open = offset < -REVEAL / 2;
			offset = open ? -REVEAL : 0;
		}
		mode = 'idle';
		dragging = false;
	}

	// A swipe must not also open the task.
	function click(event: MouseEvent) {
		if (swiped) {
			event.preventDefault();
			event.stopPropagation();
			swiped = false;
		}
	}

	function close() {
		open = false;
		offset = 0;
	}
</script>

<div class="row" class:is-done={done}>
	<button
		class="swipe-done"
		class:shown={open || offset !== 0}
		type="button"
		tabindex={open ? 0 : -1}
		aria-hidden={!open}
		onclick={() => {
			close();
			oncomplete();
		}}
	>
		<Icon name="check" size={18} />{i18n.m.common.done}
	</button>
	<div
		class="content"
		class:dragging
		style="transform: translateX({offset}px)"
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
		onclickcapture={click}
		role="presentation"
	>
		<label class="check">
			<input
				type="checkbox"
				aria-label={i18n.m.common.complete(title)}
				checked={done}
				onchange={(event) => (event.currentTarget.checked ? oncomplete() : onreopen?.())}
			/>
		</label>
		<a {href} onfocus={close}>
			<span class="title">{title}{#if detail}<span class="detail">{` · ${detail}`}</span>{/if}</span>
			{#if overdue && !done}<span class="overdue">{i18n.m.common.overdue}</span>{/if}
			{#if meta}<span class="meta">{meta}</span>{/if}
		</a>
	</div>
</div>

<style>
	.row {
		position: relative;
		overflow: hidden;
	}
	/* Hidden until a swipe starts, so it never peeks at the row's edges. */
	.swipe-done {
		visibility: hidden;
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		width: 96px;
		border: 0;
		background: var(--q-ink, var(--cta-bg));
		color: var(--q-bg, var(--cta-text));
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.swipe-done.shown {
		visibility: visible;
	}
	.content {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 52px;
		background: var(--q-bg, var(--surface));
		/* Vertical scrolling stays with the page; horizontal moves are the swipe. */
		touch-action: pan-y;
		transition: transform 180ms ease-out;
	}
	.content.dragging {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.content {
			transition: none;
		}
	}
	/* 44 x 44 touch area around the checkbox (docs/05, TaskRow). */
	.check {
		width: var(--touch);
		height: var(--touch);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--q-ink, var(--text));
		cursor: pointer;
	}
	a {
		min-height: var(--touch);
		min-width: 0;
		flex-grow: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3) var(--space-2) 0;
		color: inherit;
		text-decoration: none;
		font-size: 15px;
		line-height: 1.35;
	}
	.title {
		flex-grow: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	/* Done: struck through and quieter, but still readable (contrast stays AA). */
	.is-done .title {
		text-decoration: line-through;
		text-decoration-thickness: 1.5px;
		opacity: 0.75;
	}
	.is-done .meta {
		opacity: 0.75;
	}
	.overdue {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid currentColor;
		border-radius: var(--radius-pill);
		padding: 1px 6px;
	}
	.meta {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 500;
	}
</style>
