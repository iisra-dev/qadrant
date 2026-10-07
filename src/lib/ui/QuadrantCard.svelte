<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Quadrant } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import QuadrantGlyph from './QuadrantGlyph.svelte';
	import { quadrantVars } from './quadrants';
	import { moveRow, receiveRow, sendRow } from './motion';

	type Item = { id: string };

	let {
		quadrant,
		items,
		limit = 3,
		count,
		showCount = true,
		row,
		footer
	}: {
		quadrant: Quadrant;
		items: Item[];
		/** Rows shown before "+N more"; Infinity shows them all. */
		limit?: number;
		/** Tasks still to do; done ones are listed but not counted. Defaults to all items. */
		count?: number;
		/** Visible count; off on the phone, where the summary pills above already show it. */
		showCount?: boolean;
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
		<QuadrantGlyph {quadrant} />
		<div class="names">
			<h2 id={`quadrant-${quadrant}-title`}>{meta.name}</h2>
			<span class="rule">{meta.rule}</span>
		</div>
		<!-- Hidden on the phone but still read out, so each region says how many tasks it has. -->
		<span class="count" class:hidden={!showCount} aria-label={i18n.m.common.tasksCount(count ?? items.length)}>{count ?? items.length}</span>
	</div>
	{#if items.length === 0}
		<p class="empty">{meta.empty}</p>
	{/if}
	<!-- Always there, so rows animate in and out, also into an empty quadrant (docs/05, "Movimiento"). -->
	<ul id={listId}>
		{#each visible as item (item.id)}
			<li animate:moveRow in:receiveRow={{ key: item.id }} out:sendRow={{ key: item.id }}>{@render row(item)}</li>
		{/each}
	</ul>
	{#if hidden > 0}
		<button class="more" type="button" aria-expanded={expanded} aria-controls={listId} onclick={() => (expanded = !expanded)}>
			{expanded ? i18n.m.common.less : i18n.m.common.more(hidden)}
		</button>
	{/if}
	{#if footer}<div class="footer">{@render footer()}</div>{/if}
</section>

<style>
	/* Colored header, tasks on the plain surface (design/canvas, "Hoy rediseñada"). */
	.card {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-width: 0;
		scroll-margin-top: var(--space-4);
		/* The quadrant's color, kept for rows that sit on the plain surface. */
		--q-tint: var(--q-bg);
	}
	.head {
		padding: 14px var(--space-4);
		background: var(--q-bg);
		color: var(--q-ink);
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.names {
		flex-grow: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		line-height: 1.2;
	}
	.rule {
		font-size: 13px;
	}
	.count {
		flex-shrink: 0;
		min-width: 28px;
		height: 24px;
		padding: 0 var(--space-2);
		box-sizing: border-box;
		border-radius: var(--radius-pill);
		background: var(--surface);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 500;
	}
	.count.hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		min-width: 0;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		/* Rows sit on the surface; the swipe button keeps the quadrant's ink. */
		--q-bg: var(--surface);
	}
	ul :global(.meta) {
		color: var(--text-muted);
	}
	/* Separator inset past the checkbox, as in grouped lists. */
	li + li {
		position: relative;
	}
	li + li::before {
		content: '';
		position: absolute;
		z-index: 1;
		top: 0;
		left: calc(var(--touch) + var(--space-1));
		right: 0;
		border-top: 1px solid var(--border);
	}
	.empty {
		margin: 0;
		padding: 14px var(--space-4);
		font-size: 15px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.more {
		align-self: flex-start;
		min-height: var(--touch);
		margin: 0 var(--space-4);
		border: 0;
		background: transparent;
		padding: 0;
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		color: inherit;
		cursor: pointer;
	}
	.footer {
		padding: var(--space-1) var(--space-4) var(--space-4);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}
</style>
