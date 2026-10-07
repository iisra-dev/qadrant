<script lang="ts">
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/index.svelte';

	const m = $derived(i18n.m.error);
	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? m.notFound : m.generic);
</script>

<svelte:head>
	<title>{i18n.m.common.pageTitle(title)}</title>
</svelte:head>

<div class="error">
	<span class="code">{page.status}</span>
	<h1>{title}</h1>
	<p>{notFound ? m.notFoundText : m.genericText}</p>
	<a href="/">{m.home}</a>
</div>

<style>
	.error {
		flex-grow: 1;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-5);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: var(--space-3);
	}
	.code {
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	a {
		align-self: flex-start;
		min-height: var(--touch);
		margin-top: var(--space-2);
		padding: 0 var(--space-5);
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: var(--cta-bg);
		color: var(--cta-text);
		font-weight: 600;
		text-decoration: none;
	}
</style>
