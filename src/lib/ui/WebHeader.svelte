<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	let { current, oncapture }: { current: string; oncapture: (text: string) => void } = $props();

	const links = $derived([
		{ href: '/', label: i18n.m.nav.matrix },
		{ href: '/agenda', label: i18n.m.nav.agenda },
		{ href: '/settings', label: i18n.m.nav.settings }
	]);
	let text = $state('');

	function submit(event: SubmitEvent) {
		event.preventDefault();
		oncapture(text.trim());
		text = '';
	}
</script>

<header>
	<div class="inner">
		<a class="brand" href="/">{i18n.m.common.appName}</a>
		<nav aria-label={i18n.m.nav.label}>
			{#each links as link (link.href)}
				<a href={link.href} aria-current={current === link.href ? 'page' : undefined}>{link.label}</a>
			{/each}
		</nav>
		<form onsubmit={submit}>
			<input type="text" aria-label={i18n.m.nav.newTask} placeholder={i18n.m.nav.placeholder} bind:value={text} />
			<button type="submit">{i18n.m.common.add}</button>
		</form>
	</div>
</header>

<style>
	header {
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}
	.inner {
		max-width: 1280px;
		margin: 0 auto;
		padding: var(--space-3) var(--space-6);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}
	.brand {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
		color: var(--text);
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: var(--space-1);
	}
	nav a {
		min-height: var(--touch);
		padding: 0 14px;
		border-radius: var(--radius-pill);
		display: flex;
		align-items: center;
		color: var(--text);
		text-decoration: none;
		font-size: 14px;
	}
	nav a[aria-current='page'] {
		background: var(--cta-bg);
		color: var(--cta-text);
		font-weight: 600;
	}
	form {
		flex: 1 1 320px;
		display: flex;
		gap: var(--space-2);
	}
	input {
		flex-grow: 1;
		min-width: 0;
		min-height: var(--touch);
		border-radius: 22px;
		border: 1px solid var(--border-control);
		background: var(--bg);
		padding: 0 18px;
		font-size: 14px;
	}
	button {
		min-height: var(--touch);
		padding: 0 var(--space-5);
		border: 0;
		border-radius: 22px;
		background: var(--cta-bg);
		color: var(--cta-text);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
</style>
