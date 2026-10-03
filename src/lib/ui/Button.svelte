<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'text' | 'danger';
	type Props = {
		variant?: Variant;
		size?: 'md' | 'lg';
		block?: boolean;
		children: Snippet;
	} & (({ href: string } & HTMLAnchorAttributes) | ({ href?: undefined } & HTMLButtonAttributes));

	let { variant = 'primary', size = 'md', block = false, children, ...rest }: Props = $props();
</script>

{#if rest.href !== undefined}
	<a class="button {variant} {size}" class:block {...rest as HTMLAnchorAttributes}>{@render children()}</a>
{:else}
	<button class="button {variant} {size}" class:block type="button" {...rest as HTMLButtonAttributes}>
		{@render children()}
	</button>
{/if}

<style>
	.button {
		min-height: var(--touch);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: 0 var(--space-4);
		border-radius: var(--radius-pill);
		border: 1px solid transparent;
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}
	.lg {
		min-height: 52px;
		padding: 0 var(--space-5);
	}
	.block {
		display: flex;
		width: 100%;
	}
	.primary {
		background: var(--cta-bg);
		color: var(--cta-text);
	}
	.secondary {
		background: var(--surface);
		color: var(--text);
		border-color: var(--border-strong);
	}
	.text {
		background: transparent;
		color: var(--text);
		padding: 0 var(--space-2);
		font-weight: 500;
		font-size: 14px;
	}
	.danger {
		background: var(--surface);
		color: var(--danger);
		border-color: var(--danger);
	}
	.button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
