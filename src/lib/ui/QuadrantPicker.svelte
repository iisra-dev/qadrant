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
</script>

<div class="picker" role="group" aria-label={groupLabel}>
	{#each QUADRANTS as quadrant (quadrant)}
		<button
			type="button"
			style={quadrantVars(quadrant)}
			aria-pressed={value === quadrant}
			onclick={() => onchange(quadrant)}
		>
			{i18n.m.quadrants[quadrant].name}
		</button>
	{/each}
</div>

<style>
	.picker {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	button {
		min-height: var(--touch);
		border-radius: var(--radius-control);
		border: 2px solid transparent;
		background: var(--q-bg);
		color: var(--q-ink);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
		padding: 0 2px;
	}
	button[aria-pressed='true'] {
		border-color: var(--q-ink);
		font-weight: 600;
	}
</style>
