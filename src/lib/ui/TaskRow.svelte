<script lang="ts">
	let {
		title,
		href,
		detail,
		overdue = false,
		oncomplete
	}: {
		title: string;
		href: string;
		/** Secondary text after the title, e.g. the assignee. */
		detail?: string;
		overdue?: boolean;
		oncomplete: () => void;
	} = $props();
</script>

<div class="row">
	<label class="check">
		<input type="checkbox" aria-label={`Completar: ${title}`} onchange={oncomplete} />
	</label>
	<a {href}>
		{title}{#if detail}<span class="detail"> · {detail}</span>{/if}
		{#if overdue}<span class="overdue">Vencida</span>{/if}
	</a>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		min-height: var(--touch);
	}
	/* 44 x 44 touch area around an 18 px checkbox (docs/05, TaskRow). */
	.check {
		width: var(--touch);
		height: var(--touch);
		margin-left: -13px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--q-ink, var(--text));
		cursor: pointer;
	}
	a {
		min-height: var(--touch);
		flex-grow: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 6px;
		color: inherit;
		text-decoration: none;
		font-size: 13px;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.overdue {
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 1px solid currentColor;
		border-radius: var(--radius-pill);
		padding: 1px 6px;
	}
</style>
