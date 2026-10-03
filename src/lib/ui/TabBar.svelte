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
			<Icon name={tab.icon} />
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
		gap: 3px;
		min-height: 64px;
		text-decoration: none;
		color: var(--text-muted);
		font-size: 11px;
	}
	a[aria-current='page'] {
		color: var(--text);
		font-weight: 600;
	}
</style>
