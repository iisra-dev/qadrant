<script lang="ts">
	import type { Quadrant } from '$lib/domain/types';

	// Position of the quadrant in the 2 x 2 matrix: a cue that does not rely on color.
	let { quadrant, size = 20 }: { quadrant: Quadrant; size?: number } = $props();

	const CELLS = [
		{ quadrant: 'do', x: 1, y: 1 },
		{ quadrant: 'schedule', x: 9, y: 1 },
		{ quadrant: 'delegate', x: 1, y: 9 },
		{ quadrant: 'eliminate', x: 9, y: 9 }
	] as const;
</script>

<svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
	{#each CELLS as cell (cell.quadrant)}
		<rect x={cell.x} y={cell.y} width="6" height="6" rx="1.5" fill="currentColor" opacity={cell.quadrant === quadrant ? 1 : 0.22} />
	{/each}
</svg>

<style>
	svg {
		flex-shrink: 0;
	}
	rect {
		transition: opacity 300ms ease;
	}
</style>
