<script lang="ts">
	import type { Snippet } from 'svelte';
	import { media } from '$lib/app/media.svelte';
	import Icon from './Icon.svelte';

	// A collapsible group of settings: the summary shows the current value, so the
	// screen reads at a glance and opens only what is needed (docs/01, "Ajustes").
	// On web every group starts open: there is room for all of them.
	let {
		title,
		summary,
		open: openAtStart = false,
		children
	}: { title: string; summary: string; open?: boolean; children: Snippet } = $props();

	// svelte-ignore state_referenced_locally
	let open = $state(openAtStart);
	$effect(() => {
		if (media.web) open = true;
	});
</script>

<details class="group" bind:open>
	<summary>
		<span class="text">
			<span class="title">{title}</span>
			<span class="summary">{summary}</span>
		</span>
		<span class="chevron"><Icon name="next" size={20} /></span>
	</summary>
	<div class="body">
		{@render children()}
	</div>
</details>

<style>
	.group {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
	}
	summary {
		min-height: 64px;
		padding: var(--space-2-5) var(--space-4);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		list-style: none;
		cursor: pointer;
		border-radius: var(--radius-card);
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.text {
		flex-grow: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.title {
		font-size: 16px;
		font-weight: 600;
	}
	.summary {
		font-size: 13px;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.chevron {
		display: flex;
		color: var(--text-muted);
		transition: transform 150ms ease-out;
	}
	details[open] .chevron {
		transform: rotate(90deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
	.body {
		padding: 0 var(--space-3) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
</style>
