<script lang="ts">
	export type IconName =
		| 'matrix'
		| 'agenda'
		| 'settings'
		| 'mic'
		| 'close'
		| 'back'
		| 'prev'
		| 'next'
		| 'trash'
		| 'plus';

	let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'matrix'}
		<rect x="3" y="3" width="8" height="8" rx="2" />
		<rect x="13" y="3" width="8" height="8" rx="2" />
		<rect x="3" y="13" width="8" height="8" rx="2" />
		<rect x="13" y="13" width="8" height="8" rx="2" />
	{:else if name === 'agenda'}
		<rect x="3" y="5" width="18" height="16" rx="2" />
		<path d="M3 10h18M8 3v4M16 3v4" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3" />
		<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
	{:else if name === 'mic'}
		<rect x="9" y="3" width="6" height="12" rx="3" />
		<path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'back' || name === 'prev'}
		<path d="M15 5l-7 7 7 7" />
	{:else if name === 'next'}
		<path d="M9 5l7 7-7 7" />
	{:else if name === 'trash'}
		<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{/if}
</svg>
