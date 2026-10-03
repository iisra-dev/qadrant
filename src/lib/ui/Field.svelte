<script lang="ts">
	import type { Snippet } from 'svelte';

	// A row with a label and a control; the control gets `id` to bind the label.
	let { id, label, children }: { id: string; label: string; children: Snippet } = $props();
</script>

<div class="field">
	<label for={id}>{label}</label>
	{@render children()}
</div>

<style>
	.field {
		min-height: 52px;
		padding: 0 var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.field:last-child {
		border-bottom: 0;
	}
	label {
		font-size: 14px;
	}
	.field :global(input),
	.field :global(select) {
		min-height: var(--touch);
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		color: var(--text);
		text-align: right;
	}
</style>
