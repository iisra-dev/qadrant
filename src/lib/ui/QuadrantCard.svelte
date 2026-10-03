<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Quadrant } from '$lib/domain/types';
	import { QUADRANT_META, quadrantVars } from './quadrants';

	type Item = { id: string };

	let {
		quadrant,
		items,
		limit = 3,
		row,
		footer
	}: {
		quadrant: Quadrant;
		items: Item[];
		/** Rows shown before "+N más"; Infinity shows them all. */
		limit?: number;
		row: Snippet<[Item]>;
		footer?: Snippet;
	} = $props();

	const meta = $derived(QUADRANT_META[quadrant]);
	let expanded = $state(false);
	const visible = $derived(expanded ? items : items.slice(0, limit));
	const hidden = $derived(items.length - Math.min(items.length, limit));
	const listId = $derived(`quadrant-${quadrant}-list`);
</script>

<section class="card" style={quadrantVars(quadrant)} aria-labelledby={`quadrant-${quadrant}-title`}>
	<div class="head">
		<h2 id={`quadrant-${quadrant}-title`}>{meta.name}</h2>
		<span class="count" aria-label={`${items.length} tareas`}>{items.length}</span>
	</div>
	<span class="rule">{meta.rule}</span>
	{#if items.length === 0}
		<p class="empty">{meta.empty}</p>
	{:else}
		<ul id={listId}>
			{#each visible as item (item.id)}
				<li>{@render row(item)}</li>
			{/each}
		</ul>
		{#if hidden > 0}
			<button class="more" type="button" aria-expanded={expanded} aria-controls={listId} onclick={() => (expanded = !expanded)}>
				{expanded ? 'Ver menos' : `+${hidden} más`}
			</button>
		{/if}
	{/if}
	{#if footer}{@render footer()}{/if}
</section>

<style>
	.card {
		background: var(--q-bg);
		color: var(--q-ink);
		border-radius: var(--radius-card);
		padding: 14px var(--space-3) var(--space-2);
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	h2 {
		margin: 0;
		font-size: 19px;
		font-weight: 700;
	}
	.count {
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.rule {
		font-size: 11px;
		padding: 2px 0 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.empty {
		margin: var(--space-2) 0;
		font-size: 12px;
		line-height: 1.4;
		opacity: 0.85;
	}
	.more {
		align-self: flex-start;
		min-height: var(--touch);
		border: 0;
		background: transparent;
		padding: 0;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: inherit;
		cursor: pointer;
	}
</style>
