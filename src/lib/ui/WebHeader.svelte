<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	let { current, oncapture }: { current: string; oncapture: (text: string) => void } = $props();

	const links = $derived([
		{ href: '/', label: i18n.m.nav.matrix },
		{ href: '/agenda', label: i18n.m.nav.agenda },
		{ href: '/settings', label: i18n.m.nav.settings }
	]);
	let text = $state('');
	let field: HTMLInputElement | undefined = $state();

	// Ctrl+K (Cmd+K on Mac) jumps to the capture field from anywhere.
	function keydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			field?.focus();
		}
	}
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		oncapture(text.trim());
		text = '';
	}
</script>

<svelte:window onkeydown={keydown} />

<header>
	<div class="inner">
		<a class="brand" href="/">{i18n.m.common.appName}</a>
		<nav aria-label={i18n.m.nav.label}>
			{#each links as link (link.href)}
				<a href={link.href} aria-current={current === link.href ? 'page' : undefined}>{link.label}</a>
			{/each}
		</nav>
		<form onsubmit={submit}>
			<span class="field">
				<input type="text" aria-label={i18n.m.nav.newTask} aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'} placeholder={i18n.m.nav.placeholder} bind:value={text} bind:this={field} />
				<kbd aria-hidden="true">{i18n.m.nav.captureKey(mac)}</kbd>
			</span>
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
	/* Segmented control: the current section is a raised pill. */
	nav {
		display: flex;
		gap: var(--space-1);
		padding: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--surface-muted);
	}
	nav a {
		min-height: var(--touch);
		padding: 0 var(--space-4);
		border-radius: var(--radius-pill);
		display: flex;
		align-items: center;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 15px;
	}
	nav a[aria-current='page'] {
		background: var(--surface);
		color: var(--text);
		font-weight: 600;
		box-shadow: 0 1px 2px rgb(9 9 11 / 0.08);
	}
	form {
		flex: 1 1 320px;
		max-width: 560px;
		margin-left: auto;
		display: flex;
		gap: var(--space-2);
	}
	.field {
		position: relative;
		flex-grow: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}
	input {
		flex-grow: 1;
		min-width: 0;
		min-height: var(--touch);
		border-radius: var(--radius-control);
		border: 1px solid var(--border-control);
		background: var(--bg);
		padding: 0 72px 0 var(--space-4);
		font-size: 15px;
	}
	kbd {
		position: absolute;
		right: var(--space-2-5);
		padding: 2px 6px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text-muted);
		pointer-events: none;
	}
	button {
		min-height: var(--touch);
		padding: 0 var(--space-5);
		border: 0;
		border-radius: var(--radius-control);
		background: var(--cta-bg);
		color: var(--cta-text);
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}
</style>
