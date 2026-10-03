<script lang="ts">
	import type { Quadrant } from '$lib/domain/types';
	import AiDot from './AiDot.svelte';
	import { quadrantVars } from './quadrants';

	let {
		time,
		title,
		meta,
		href,
		quadrant,
		focus = false,
		minutes = 30
	}: {
		time: string;
		title: string;
		/** "Hacer · 30 min" */
		meta: string;
		href?: string;
		/** Without a quadrant the block is a calendar event (white with border). */
		quadrant?: Quadrant;
		/** A focus block proposed by the scheduler. */
		focus?: boolean;
		minutes?: number;
	} = $props();

	const height = $derived(Math.max(56, Math.min(160, Math.round(minutes * 1.1))));
</script>

<div class="slot">
	<span class="time">{time}</span>
	{#if href}
		<a class="block" class:event={!quadrant} {href} style="{quadrant ? quadrantVars(quadrant) : ''} min-height: {height}px">
			{#if focus}<span class="label"><AiDot />BLOQUE DE FOCO</span>{/if}
			<span class="title">{title}</span>
			<span class="meta">{meta}</span>
		</a>
	{:else}
		<div class="block" class:event={!quadrant} style="{quadrant ? quadrantVars(quadrant) : ''} min-height: {height}px">
			<span class="title">{title}</span>
			<span class="meta">{meta}</span>
		</div>
	{/if}
</div>

<style>
	.slot {
		display: flex;
		gap: var(--space-2-5);
	}
	.time {
		width: 44px;
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
		padding-top: var(--space-2-5);
	}
	.block {
		flex-grow: 1;
		min-width: 0;
		border-radius: var(--radius-block);
		background: var(--q-bg);
		color: var(--q-ink);
		padding: var(--space-2) var(--space-3);
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		text-decoration: none;
	}
	.event {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}
	.event .meta {
		color: var(--text-muted);
	}
	.label {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
	}
	.title {
		font-size: 14px;
		font-weight: 600;
	}
	.meta {
		font-size: 11px;
	}
</style>
