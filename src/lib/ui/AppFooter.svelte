<script lang="ts">
	import { ISSUES_URL, reportUrl } from '$lib/app/report';
	import { engineState } from '$lib/engine';
	import { i18n } from '$lib/i18n/index.svelte';
	import { settings } from '$lib/stores';

	// Licenses and the author's contact (docs/01). The licenses file is generated
	// at build time from the packages shipped (scripts/licenses.mjs).
	const AUTHOR_URL = 'https://github.com/iisra-dev';

	// Filled in on click, so it describes the device as it is then; the plain
	// address is left for middle-click. Opening it sends nothing (docs/01).
	function fillReport(event: MouseEvent & { currentTarget: HTMLAnchorElement }) {
		const status = engineState.status;
		event.currentTarget.href = reportUrl(i18n.m.report, {
			version: __APP_VERSION__,
			language: i18n.lang,
			installed:
				matchMedia('(display-mode: standalone)').matches ||
				(navigator as Navigator & { standalone?: boolean }).standalone === true,
			engine: status.engine,
			model: status.model,
			sync: Boolean($settings?.server && $settings.sync),
			browser: navigator.userAgent
		});
	}
</script>

<footer>
	<span>{i18n.m.footer.app(__APP_VERSION__)}</span>
	<a href="/licenses.txt" target="_blank" rel="noopener">{i18n.m.footer.licenses}</a>
	<a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">{i18n.m.footer.author}</a>
	<a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" onclick={fillReport}>{i18n.m.footer.report}</a>
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
