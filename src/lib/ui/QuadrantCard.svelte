<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Quadrant } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import { quadrantVars } from './quadrants';

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
		/** Rows shown before "+N more"; Infinity shows them all. */
		limit?: number;
		row: Snippet<[Item]>;
		footer?: Snippet;
	} = $props();

	const meta = $derived(i18n.m.quadrants[quadrant]);
	let expanded = $state(false);
	const visible = $derived(expanded ? items : items.slice(0, limit));
	const hidden = $derived(items.length - Math.min(items.length, limit));
	const listId = $derived(`quadrant-${quadrant}-list`);
</script>

<section class="card" id={`quadrant-${quadrant}`} style={quadrantVars(quadrant)} aria-labelledby={`quadrant-${quadrant}-title`}>
	<div class="head">
		<div class="names">
			<h2 id={`quadrant-${quadrant}-title`}>{meta.name}</h2>
			<span class="rule">{meta.rule}</span>
		</div>
		<span class="count" aria-label={i18n.m.common.tasksCount(items.length)}>{items.length}</span>
	</div>
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
				{expanded ? i18n.m.common.less : i18n.m.common.more(hidden)}
			</button>
		{/if}
	{/if}
	{#if footer}<div class="footer">{@render footer()}</div>{/if}
</section>

<style>
	.card {
		background: var(--q-bg);
		color: var(--q-ink);
		border-radius: var(--radius-card);
		padding: 14px var(--space-1) var(--space-1);
		display: flex;
		flex-direction: column;
		min-width: 0;
		scroll-margin-top: var(--space-4);
	}
	.head {
		padding: 0 var(--space-3) 6px;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
	}
	.names {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}
	.count {
		font-family: var(--font-mono);
		font-size: 13px;
	}
	.rule {
		font-size: 12px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li + li {
		border-top: 1px solid color-mix(in srgb, var(--q-ink) 16%, transparent);
	}
	.empty {
		margin: var(--space-1) var(--space-3) var(--space-3);
		font-size: 14px;
		line-height: 1.4;
	}
	.more {
		align-self: flex-start;
		min-height: var(--touch);
		margin: 0 var(--space-3);
		border: 0;
		background: transparent;
		padding: 0;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		color: inherit;
		cursor: pointer;
	}
	.footer {
		padding: 0 var(--space-3) var(--space-1);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
	}
</style>
