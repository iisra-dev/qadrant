<script lang="ts">
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';

	type Props = {
		label: string;
		icon: IconName;
		variant?: 'plain' | 'outlined' | 'danger';
	} & (({ href: string } & HTMLAnchorAttributes) | ({ href?: undefined } & HTMLButtonAttributes));

	let { label, icon, variant = 'plain', ...rest }: Props = $props();
</script>

{#if rest.href !== undefined}
	<a class="icon-button {variant}" aria-label={label} {...rest as HTMLAnchorAttributes}><Icon name={icon} /></a>
{:else}
	<button class="icon-button {variant}" type="button" aria-label={label} {...rest as HTMLButtonAttributes}>
		<Icon name={icon} />
	</button>
{/if}

<style>
	.icon-button {
		width: var(--touch);
		height: var(--touch);
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.outlined {
		width: 52px;
		height: 52px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
	}
	.danger {
		color: var(--danger);
	}
</style>
