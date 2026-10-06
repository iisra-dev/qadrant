<script lang="ts">
	import { QUADRANTS, type Quadrant } from '$lib/domain/types';
	import { i18n } from '$lib/i18n/index.svelte';
	import { quadrantVars } from './quadrants';

	let {
		value,
		label,
		onchange
	}: { value: Quadrant | null; label?: string; onchange: (quadrant: Quadrant) => void } = $props();

	const groupLabel = $derived(label ?? i18n.m.common.quadrantGroup);
	const index = $derived(value ? QUADRANTS.indexOf(value) : -1);
</script>

<!-- Segmented control: a highlight in the chosen quadrant's color slides to it. -->
<div class="picker" role="group" aria-label={groupLabel} style={value ? quadrantVars(value) : undefined}>
	<span class="indicator" class:shown={index >= 0} style:--index={Math.max(index, 0)} aria-hidden="true"></span>
	{#each QUADRANTS as quadrant (quadrant)}
		<button type="button" aria-pressed={value === quadrant} onclick={() => onchange(quadrant)}>
			{i18n.m.quadrants[quadrant].name}
		</button>
	{/each}
</div>

<style>
	.picker {
		position: relative;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		min-height: 52px;
		padding: var(--space-1);
		box-sizing: border-box;
		border-radius: var(--radius-block);
		background: var(--surface-muted);
	}
	.indicator {
		position: absolute;
		top: var(--space-1);
		bottom: var(--space-1);
		left: calc(var(--space-1) + var(--index) * (100% - 2 * var(--space-1)) / 4);
		width: calc((100% - 2 * var(--space-1)) / 4);
		border-radius: 10px;
		background: var(--q-bg);
		box-shadow: 0 1px 3px rgb(9 9 11 / 0.12);
		opacity: 0;
		transition:
			left 320ms cubic-bezier(0.32, 0.72, 0, 1),
			background-color 300ms ease,
			opacity 200ms ease;
	}
	.indicator.shown {
		opacity: 1;
	}
	button {
		position: relative;
		min-width: 0;
		min-height: var(--touch);
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		padding: 0 2px;
		transition: color 200ms ease;
	}
	button[aria-pressed='true'] {
		color: var(--q-ink);
		font-weight: 600;
	}
	@media (prefers-reduced-motion: reduce) {
		.indicator {
			transition: opacity 150ms linear;
		}
	}
</style>
