<script lang="ts">
	import { clock } from '$lib/app/clock.svelte';
	import { capture } from '$lib/app/capture.svelte';
	import { repos } from '$lib/db/repositories';
	import { formatLongDate } from '$lib/domain/format';
	import { groupByQuadrant, isOverdue } from '$lib/domain/matrix';
	import { QUADRANTS, type Task } from '$lib/domain/types';
	import { openTasks, people } from '$lib/stores';
	import { Button, Icon, QuadrantCard, Sheet, TaskRow } from '$lib/ui';
	import ArchiveToast from './ArchiveToast.svelte';

	const groups = $derived(groupByQuadrant($openTasks, clock.now));
	const today = $derived(formatLongDate(clock.now));

	function personName(id: string | undefined): string | undefined {
		return id ? $people.find((person) => person.id === id)?.name : undefined;
	}

	let confirmArchive = $state(false);
	let archived = $state<string[]>([]);

	async function archiveAll() {
		const ids = groups.eliminate.map((task) => task.id);
		confirmArchive = false;
		await repos.tasks.archive(ids);
		archived = ids;
	}

	async function undoArchive() {
		const ids = archived;
		archived = [];
		for (const id of ids) await repos.tasks.reopen(id);
	}
</script>

<svelte:head>
	<title>Hoy · Cuadrante</title>
</svelte:head>

<div class="matrix">
	<header>
		<span class="date">{today.charAt(0).toUpperCase() + today.slice(1)}</span>
		<h1>Hoy</h1>
	</header>

	<div class="grid">
		{#each QUADRANTS as quadrant (quadrant)}
			<QuadrantCard {quadrant} items={groups[quadrant]}>
				{#snippet row(item)}
					{@const task = item as Task}
					<TaskRow
						title={task.title}
						href={`/task/${task.id}`}
						detail={quadrant === 'delegate' ? personName(task.delegatedTo) : undefined}
						overdue={isOverdue(task, clock.now)}
						oncomplete={() => repos.tasks.complete(task.id)}
					/>
				{/snippet}
				{#snippet footer()}
					{#if quadrant === 'eliminate' && groups.eliminate.length > 0}
						<button class="archive" type="button" onclick={() => (confirmArchive = true)}>Archivar</button>
					{/if}
				{/snippet}
			</QuadrantCard>
		{/each}
	</div>

	<button class="capture" type="button" onclick={() => capture.show()}>
		<span>¿Qué tienes en mente?</span>
		<span class="capture-icon" aria-hidden="true"><Icon name="mic" size={18} /></span>
	</button>
</div>

<Sheet open={confirmArchive} label="Archivar tareas" onclose={() => (confirmArchive = false)}>
	<h2 class="confirm-title">¿Archivar {groups.eliminate.length === 1 ? 'la tarea' : `las ${groups.eliminate.length} tareas`} de Eliminar?</h2>
	<p class="confirm-text">Dejarán de verse en la Matriz. Podrás deshacerlo durante unos segundos.</p>
	<Button size="lg" block onclick={archiveAll}>Archivar</Button>
	<Button variant="secondary" size="lg" block onclick={() => (confirmArchive = false)}>Cancelar</Button>
</Sheet>

{#if archived.length}
	<ArchiveToast count={archived.length} onundo={undoArchive} ondismiss={() => (archived = [])} />
{/if}

<style>
	.matrix {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
	}
	header {
		padding: var(--space-6) var(--space-5) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.date {
		font-size: 13px;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: 32px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.grid {
		flex-grow: 1;
		padding: 0 var(--space-4);
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: minmax(200px, auto);
		gap: var(--space-2-5);
	}
	.archive {
		align-self: flex-start;
		min-height: var(--touch);
		border: 0;
		background: transparent;
		padding: 0;
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		color: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.capture {
		position: sticky;
		bottom: 76px;
		margin: var(--space-3) var(--space-4);
		min-height: 56px;
		border: 0;
		border-radius: 28px;
		background: var(--cta-bg);
		color: var(--cta-text);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-2) 0 var(--space-5);
		font: inherit;
		font-size: 15px;
		cursor: pointer;
	}
	.capture-icon {
		width: 40px;
		height: 40px;
		border-radius: 20px;
		background: var(--cta-text);
		color: var(--cta-bg);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.confirm-title {
		margin: 0;
		font-size: 22px;
	}
	.confirm-text {
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}
</style>
