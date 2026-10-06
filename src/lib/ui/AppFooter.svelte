<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';

	// Licenses and the author's contact (docs/01). The licenses file is generated
	// at build time from the packages shipped (scripts/licenses.mjs).
	const AUTHOR_URL = 'https://github.com/iisra-dev';
</script>

<footer>
	<span>{i18n.m.footer.app}</span>
	<a href="/licenses.txt" target="_blank" rel="noopener">{i18n.m.footer.licenses}</a>
	<a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">{i18n.m.footer.author}</a>
</footer>

<style>
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		column-gap: var(--space-4);
		padding: var(--space-2) var(--space-4);
		font-size: 13px;
		color: var(--text-muted);
	}
	a {
		min-height: var(--touch);
		display: inline-flex;
		align-items: center;
		color: var(--text);
		text-underline-offset: 3px;
	}
</style>
