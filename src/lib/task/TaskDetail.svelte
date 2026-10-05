<script lang="ts">
	import { clock } from '$lib/app/clock.svelte';
	import { currentSettings } from '$lib/app/context';
	import { repos } from '$lib/db/repositories';
	import { atTime, dateKey, fromDateKey } from '$lib/domain/dates';
	import { whyText } from '$lib/domain/explain';
	import type { Task } from '$lib/domain/types';
	import { live } from '$lib/stores/live';
	import { activeGoals, people } from '$lib/stores';
	import { taskActions } from '$lib/tasks/actions';
	import { i18n } from '$lib/i18n/index.svelte';
	import { AiDot, Button, Field, Icon, QuadrantPicker, Sheet } from '$lib/ui';

	let { id, onclose }: { id: string; onclose: () => void } = $props();
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

	const back = () => onclose();

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
			? whyText($task, { now: clock.now, settings: currentSettings(), goals: $activeGoals, people: $people, lang: i18n.lang })
			: ''
	);
	const durationValue = $derived(
		!$task?.durationMin ? '' : DURATIONS.includes($task.durationMin) && !customDuration ? String($task.durationMin) : 'custom'
	);
</script>

<div class="detail">
	<header>
		<button class="back" type="button" onclick={back}><Icon name="back" />{i18n.m.common.back}</button>
		{#if $task}
			<!-- Every change is stored as it is made; there is no save button (docs/01). -->
			<span class="saved"><Icon name="check" size={16} />{i18n.m.common.saved}</span>
		{/if}
	</header>

	{#if $task === null}
		<p class="missing">{i18n.m.detail.missing}</p>
	{:else if $task}
		<div class="body">
			<div class="title">
				<label for="task-title">{i18n.m.detail.task}</label>
				<textarea
					id="task-title"
					rows="2"
					value={$task.title}
					onchange={(e) => setTitle(e.currentTarget.value)}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							e.currentTarget.blur();
						}
					}}
				></textarea>
			</div>

			<div class="quadrant">
				<QuadrantPicker
					value={$task.quadrant}
					onchange={(q) => taskActions.changeQuadrant($task!, q, currentSettings())}
				/>
				{#if why}
					<div class="why">
						<span class="label">
							{#if $task.quadrantSource !== 'user'}<AiDot />{/if}{i18n.m.detail.why(i18n.m.quadrants[$task.quadrant].name)}
						</span>
						<p>{why}</p>
					</div>
				{/if}
			</div>

			<div class="card">
				<Field id="task-due" label={i18n.m.detail.dueDate}>
					<input
						id="task-due"
						type="datetime-local"
						value={toLocalInput($task.dueAt)}
						onchange={(e) => taskActions.changeDueDate($task!, fromLocalInput(e.currentTarget.value), currentSettings())}
					/>
				</Field>
				<Field id="task-duration" label={i18n.m.detail.duration}>
					<select id="task-duration" value={durationValue} onchange={(e) => setDuration(e.currentTarget.value)}>
						<option value="">{i18n.m.detail.noDuration}</option>
						<option value="15">15 min</option>
						<option value="30">30 min</option>
						<option value="45">45 min</option>
						<option value="60">1 h</option>
						<option value="120">2 h</option>
						<option value="custom">{i18n.m.detail.custom}</option>
					</select>
				</Field>
				{#if durationValue === 'custom'}
					<Field id="task-duration-custom" label={i18n.m.detail.minutes}>
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
				<Field id="task-when" label={i18n.m.detail.scheduled}>
					<input
						id="task-when"
						type="datetime-local"
						value={toLocalInput($task.scheduledAt)}
						onchange={(e) => update({ scheduledAt: fromLocalInput(e.currentTarget.value) })}
					/>
				</Field>
				{#if $task.quadrant === 'delegate'}
					<Field id="task-follow-up" label={i18n.m.detail.followUp}>
						<input
							id="task-follow-up"
							type="date"
							value={$task.followUpAt ? dateKey(new Date($task.followUpAt)) : ''}
							onchange={(e) =>
								update({
									followUpAt: e.currentTarget.value
										? atTime(fromDateKey(e.currentTarget.value), currentSettings().workHours.start).toISOString()
										: undefined
								})}
						/>
					</Field>
				{/if}
				<Field id="task-who" label={i18n.m.detail.delegateTo}>
					<select id="task-who" value={$task.delegatedTo ?? ''} onchange={(e) => setAssignee(e.currentTarget.value)}>
						<option value="">{i18n.m.detail.nobody}</option>
						{#each $people as person (person.id)}
							<option value={person.id}>{person.name}</option>
						{/each}
					</select>
				</Field>
			</div>

			<div class="notes">
				<label for="task-notes">{i18n.m.detail.notes}</label>
				<textarea
					id="task-notes"
					rows="3"
					placeholder={i18n.m.detail.notesPlaceholder}
					value={$task.notes ?? ''}
					onchange={(e) => update({ notes: e.currentTarget.value || undefined })}
				></textarea>
			</div>

			<!-- Destructive, so apart from the main action and confirmed (docs/01). -->
			<div class="danger-zone">
				<button class="delete" type="button" onclick={() => (confirmDelete = true)}>
					<Icon name="trash" size={18} />{i18n.m.detail.delete}
				</button>
				<p>{i18n.m.detail.deleteNote}</p>
			</div>
		</div>

		<footer>
			<Button size="lg" block onclick={toggleDone}>
				{#if $task.status !== 'done'}<Icon name="check" size={18} />{/if}
				{$task.status === 'done' ? i18n.m.detail.markOpen : i18n.m.detail.markDone}
			</Button>
		</footer>
	{/if}
</div>

<Sheet open={confirmDelete} label={i18n.m.detail.delete} onclose={() => (confirmDelete = false)}>
	<h2 class="confirm-title">{i18n.m.detail.deleteAsk($task?.title ?? '')}</h2>
	<p class="confirm-text">{i18n.m.detail.deleteText}</p>
	<Button variant="danger" size="lg" block onclick={remove}>{i18n.m.detail.deleteConfirm}</Button>
	<Button variant="secondary" size="lg" block onclick={() => (confirmDelete = false)}>{i18n.m.common.cancel}</Button>
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
		padding: var(--space-2) var(--space-4) var(--space-1) var(--space-1);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.back {
		min-height: var(--touch);
		padding: 0 var(--space-3) 0 6px;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		display: flex;
		align-items: center;
		gap: 2px;
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
	}
	.saved {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.missing {
		padding: var(--space-5);
		color: var(--text-muted);
	}
	.body {
		flex-grow: 1;
		padding: var(--space-1) var(--space-4) var(--space-5);
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
	.title,
	.notes {
		padding: 0 var(--space-1);
	}
	.title label,
	.notes label {
		font-size: 13px;
		color: var(--text-muted);
	}
	/* A textarea, so long titles wrap instead of hiding (docs/05, "Responsive"). */
	.title textarea {
		min-height: var(--touch);
		border: 0;
		border-bottom: 1px solid var(--border-control);
		border-radius: 0;
		background: transparent;
		padding: 2px 0 var(--space-2);
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 700;
		line-height: 1.2;
		resize: none;
		field-sizing: content;
	}
	.quadrant {
		display: flex;
		flex-direction: column;
		gap: var(--space-2-5);
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		display: flex;
		flex-direction: column;
	}
	.notes textarea {
		border: 1px solid var(--border-control);
		border-radius: 16px;
		padding: var(--space-3) 14px;
		font-size: 15px;
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
		font-size: 14px;
		line-height: 1.45;
	}
	.danger-zone {
		margin-top: var(--space-2);
		padding: var(--space-3) var(--space-1) 0;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
	}
	.danger-zone p {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
	.delete {
		min-height: var(--touch);
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--danger);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}
	footer {
		position: sticky;
		bottom: 0;
		padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
		display: flex;
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
