<script lang="ts">
	import { syncActivity } from '$lib/sync/activity.svelte';
	import { i18n } from '$lib/i18n/index.svelte';

	// Only for syncs that take a while: shown after 400 ms, and then at least
	// 600 ms, so a quick cycle never makes it blink.
	const SHOW_AFTER_MS = 400;
	const MIN_SHOWN_MS = 600;

	let shown = $state(false);
	let shownAt = 0;

	$effect(() => {
		if (syncActivity.busy) {
			const timer = setTimeout(() => {
				shown = true;
				shownAt = Date.now();
			}, SHOW_AFTER_MS);
			return () => clearTimeout(timer);
		}
		if (!shown) return;
		const timer = setTimeout(() => (shown = false), Math.max(0, MIN_SHOWN_MS - (Date.now() - shownAt)));
		return () => clearTimeout(timer);
	});
</script>

<!-- Decoration only: the status line in Settings says what happened, so screen readers are not told every cycle. -->
<span class="ring" class:shown title={i18n.m.server.syncing} aria-hidden="true"></span>

<style>
	.ring {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-left: var(--space-2);
		vertical-align: -1px;
		box-sizing: border-box;
		border: 1.5px solid var(--border-control);
		border-top-color: var(--text-muted);
		border-radius: 50%;
		opacity: 0;
		transition: opacity 150ms ease-out;
		animation: spin 900ms linear infinite;
		animation-play-state: paused;
	}
	.ring.shown {
		opacity: 1;
		animation-play-state: running;
	}
	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ring {
			animation: none;
			border-color: var(--text-muted);
		}
	}
</style>
