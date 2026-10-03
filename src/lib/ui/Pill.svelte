<script lang="ts">
	import type { Snippet } from 'svelte';
	import AiDot from './AiDot.svelte';

	let { href, ai = false, children }: { href?: string; ai?: boolean; children: Snippet } = $props();
</script>

{#if href}
	<a class="pill" {href}>{#if ai}<AiDot />{/if}{@render children()}</a>
{:else}
	<span class="pill">{#if ai}<AiDot />{/if}{@render children()}</span>
{/if}

<style>
	.pill {
		align-self: flex-start;
		min-height: var(--touch);
		display: inline-flex;
		align-items: center;
		padding: 0 14px;
		border-radius: var(--radius-pill);
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		font-size: 13px;
		text-decoration: none;
	}
</style>
