<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { clock } from '$lib/app/clock.svelte';
	import { currentSettings } from '$lib/app/context';
	import { repos } from '$lib/db/repositories';
	import { whyText } from '$lib/domain/explain';
	import type { Task } from '$lib/domain/types';
	import { live } from '$lib/stores/live';
	import { activeGoals, people } from '$lib/stores';
	import { taskActions } from '$lib/tasks/actions';
	import { AiDot, Button, Field, IconButton, QuadrantPicker, QUADRANT_META, Sheet } from '$lib/ui';

	const id = $derived(page.params.id ?? '');
	// undefined while loading, null when it does not exist.
	const task = $derived(live<Task | null | undefined>(async () => (await repos.tasks.get(id)) ?? null, undefined));

	const DURATIONS = [15, 30, 45, 60, 120];
	let customDuration = $state(false);
	let confirmDelete = $state(false);

	function toLocalInput(iso: string | undefined): string {
		if (!iso) return '';
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function fromLocalInput(value: string): string | undefined {
		return value ? new Date(value).toISOString() : undefined;
	}

	function back() {
		if (history.length > 1) history.back();
		else void goto('/');
	}

	async function update(changes: Partial<Task>) {
		if ($task) await repos.tasks.update($task.id, changes);
	}

	async function setTitle(value: string) {
		const title = value.trim();
		if ($task && title && title !== $task.title) await update({ title });
	}

	async function setDuration(value: string) {
		if (value === 'custom') {
			customDuration = true;
			return;
		}
		customDuration = false;
		await update({ durationMin: value ? Number(value) : undefined });
	}

	async function setAssignee(value: string) {
		if (!$task) return;
		if (!value) {
			// Back to "Nadie" does not take it out of Delegar (docs/01).
			await update({ delegatedTo: undefined });
			return;
		}
		await update({ delegatedTo: value });
		await taskActions.changeQuadrant({ ...$task, delegatedTo: value }, 'delegate', currentSettings());
	}

	async function toggleDone() {
		if (!$task) return;
		if ($task.status === 'done') await repos.tasks.reopen($task.id);
		else {
			await repos.tasks.complete($task.id);
			back();
		}
	}

	async function remove() {
		if (!$task) return;
		confirmDelete = false;
		await repos.tasks.remove($task.id);
		back();
	}

	const why = $derived(
		$task
			? whyText($task, { now: clock.now, settings: currentSettings(), goals: $activeGoals, people: $people })
			: ''
	);
	const durationValue = $derived(
		!$task?.durationMin ? '' : DURATIONS.includes($task.durationMin) && !customDuration ? String($task.durationMin) : 'custom'
	);
</script>

<svelte:head>
	<title>{$task?.title ?? 'Tarea'} · Cuadrante</title>
</svelte:head>

<div class="detail">
	<header>
		<IconButton label="Volver" icon="back" onclick={back} />
		<Button variant="text" onclick={back}>Guardar</Button>
	</header>

	{#if $task === null}
		<p class="missing">Esta tarea ya no existe.</p>
	{:else if $task}
		<div class="body">
			<div class="title">
				<label for="task-title">Tarea</label>
				<input id="task-title" type="text" value={$task.title} onchange={(e) => setTitle(e.currentTarget.value)} />
			</div>

			<QuadrantPicker
				value={$task.quadrant}
				onchange={(q) => taskActions.changeQuadrant($task!, q, currentSettings())}
			/>

			<div class="card">
				<Field id="task-due" label="Fecha límite">
					<input
						id="task-due"
						type="datetime-local"
						value={toLocalInput($task.dueAt)}
						onchange={(e) => taskActions.changeDueDate($task!, fromLocalInput(e.currentTarget.value), currentSettings())}
					/>
				</Field>
				<Field id="task-duration" label="Duración">
					<select id="task-duration" value={durationValue} onchange={(e) => setDuration(e.currentTarget.value)}>
						<option value="">Sin duración</option>
						<option value="15">15 min</option>
						<option value="30">30 min</option>
						<option value="45">45 min</option>
						<option value="60">1 h</option>
						<option value="120">2 h</option>
						<option value="custom">Personalizada</option>
					</select>
				</Field>
				{#if durationValue === 'custom'}
					<Field id="task-duration-custom" label="Minutos">
						<input
							id="task-duration-custom"
							type="number"
							min="5"
							max="720"
							step="5"
							inputmode="numeric"
							value={$task.durationMin ?? ''}
							onchange={(e) => update({ durationMin: Number(e.currentTarget.value) || undefined })}
						/>
					</Field>
				{/if}
				<Field id="task-when" label="En la agenda">
					<input
						id="task-when"
						type="datetime-local"
						value={toLocalInput($task.scheduledAt)}
						onchange={(e) => update({ scheduledAt: fromLocalInput(e.currentTarget.value) })}
					/>
				</Field>
				<Field id="task-who" label="Delegar en">
					<select id="task-who" value={$task.delegatedTo ?? ''} onchange={(e) => setAssignee(e.currentTarget.value)}>
						<option value="">Nadie</option>
						{#each $people as person (person.id)}
							<option value={person.id}>{person.name}</option>
						{/each}
					</select>
				</Field>
			</div>

			<div class="notes">
				<label for="task-notes">Notas</label>
				<textarea
					id="task-notes"
					rows="3"
					placeholder="Añade detalles"
					value={$task.notes ?? ''}
					onchange={(e) => update({ notes: e.currentTarget.value || undefined })}
				></textarea>
			</div>

			{#if why}
				<div class="why">
					<span class="label">
						{#if $task.quadrantSource !== 'user'}<AiDot />{/if}POR QUÉ ESTÁ EN {QUADRANT_META[$task.quadrant].name.toUpperCase()}
					</span>
					<p>{why}</p>
				</div>
			{/if}
		</div>

		<footer>
			<Button size="lg" block onclick={toggleDone}>
				{$task.status === 'done' ? 'Marcar como pendiente' : 'Marcar como hecha'}
			</Button>
			<IconButton label="Borrar tarea" icon="trash" variant="outlined" onclick={() => (confirmDelete = true)} />
		</footer>
	{/if}
</div>

<Sheet open={confirmDelete} label="Borrar tarea" onclose={() => (confirmDelete = false)}>
	<h2 class="confirm-title">¿Borrar «{$task?.title}»?</h2>
	<p class="confirm-text">No se puede deshacer.</p>
	<Button variant="danger" size="lg" block onclick={remove}>Borrar</Button>
	<Button variant="secondary" size="lg" block onclick={() => (confirmDelete = false)}>Cancelar</Button>
</Sheet>

<style>
	.detail {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		max-width: 640px;
		width: 100%;
		margin: 0 auto;
	}
	header {
		padding: var(--space-3) var(--space-3) var(--space-1);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.missing {
		padding: var(--space-5);
		color: var(--text-muted);
	}
	.body {
		flex-grow: 1;
		padding: var(--space-1) var(--space-5) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.title,
	.notes {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.title label,
	.notes label {
		font-size: 12px;
		color: var(--text-muted);
	}
	.title input {
		min-height: var(--touch);
		border: 0;
		border-bottom: 1px solid var(--border-control);
		background: transparent;
		padding: var(--space-1) 0 var(--space-2-5);
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 700;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		display: flex;
		flex-direction: column;
	}
	textarea {
		border: 1px solid var(--border-control);
		border-radius: 16px;
		padding: var(--space-3) 14px;
		font-size: 14px;
		background: var(--surface);
		resize: vertical;
	}
	.why {
		border-radius: 16px;
		background: var(--surface-muted);
		padding: var(--space-3) 14px;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.why .label {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.08em;
		color: var(--text-muted);
	}
	.why p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
	}
	footer {
		position: sticky;
		bottom: 0;
		padding: var(--space-3) var(--space-5) calc(var(--space-6) + env(safe-area-inset-bottom));
		display: flex;
		gap: var(--space-2);
		border-top: 1px solid var(--border);
		background: var(--surface);
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
