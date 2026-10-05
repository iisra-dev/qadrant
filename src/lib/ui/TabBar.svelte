<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	let { current }: { current: string } = $props();

	const tabs: { href: string; label: string; icon: IconName }[] = $derived([
		{ href: '/', label: i18n.m.nav.matrix, icon: 'matrix' },
		{ href: '/agenda', label: i18n.m.nav.agenda, icon: 'agenda' },
		{ href: '/settings', label: i18n.m.nav.settings, icon: 'settings' }
	]);
</script>

<nav aria-label={i18n.m.nav.label}>
	{#each tabs as tab (tab.href)}
		<a href={tab.href} aria-current={current === tab.href ? 'page' : undefined}>
			<span class="icon"><Icon name={tab.icon} /></span>
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	nav {
		min-height: 64px;
		padding-bottom: env(safe-area-inset-bottom);
		border-top: 1px solid var(--border);
		background: var(--surface);
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: 64px;
		text-decoration: none;
		color: var(--text-muted);
		font-size: 12px;
	}
	/* The current tab carries a filled indicator, not only a darker color (docs/05). */
	.icon {
		width: 56px;
		height: 30px;
		border-radius: 15px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
	}
	a[aria-current='page'] .icon {
		background: var(--surface-muted);
	}
</style>
