<script lang="ts">
	import { onMount } from 'svelte';
	import { GOAL_SUMMARY_MAX, MAX_GOALS } from '$lib/db/defaults';
	import { repos } from '$lib/db/repositories';
	import { fromDateKey } from '$lib/domain/dates';
	import { formatShortDate } from '$lib/domain/format';
	import type { Settings } from '$lib/domain/types';
	import { activeGoals, people, settings } from '$lib/stores';
	import { taskActions } from '$lib/tasks/actions';
	import { applyTheme, type Theme } from '$lib/theme';
	import { AiDot, Button } from '$lib/ui';
	import DataSection from './DataSection.svelte';

	const s = $derived($settings);
	const WEEKDAYS = [
		{ day: 1, short: 'L', name: 'lunes' },
		{ day: 2, short: 'M', name: 'martes' },
		{ day: 3, short: 'X', name: 'miércoles' },
		{ day: 4, short: 'J', name: 'jueves' },
		{ day: 5, short: 'V', name: 'viernes' },
		{ day: 6, short: 'S', name: 'sábado' },
		{ day: 7, short: 'D', name: 'domingo' }
	];

	let newGoal = $state('');
	let newPerson = $state('');
	let newHoliday = $state('');
	let persisted = $state<boolean | null>(null);

	onMount(async () => {
		await repos.settings.get();
		try {
			persisted = (await navigator.storage?.persisted?.()) ?? null;
		} catch {
			persisted = null;
		}
	});

	/** Saves settings; changes to urgency or holidays move tasks with the passage of time. */
	async function save(changes: Partial<Settings>, reevaluate = false) {
		const next = await repos.settings.update(changes);
		if (reevaluate) await taskActions.reevaluateOpenTasks(next);
	}

	async function addGoal(event: SubmitEvent) {
		event.preventDefault();
		if (!newGoal.trim() || $activeGoals.length >= MAX_GOALS) return;
		await repos.goals.add(newGoal);
		newGoal = '';
	}

	async function addPerson(event: SubmitEvent) {
		event.preventDefault();
		if (!newPerson.trim()) return;
		await repos.people.add(newPerson);
		newPerson = '';
	}

	function aliasesFrom(value: string): string[] {
		return value.split(',').map((alias) => alias.trim()).filter(Boolean);
	}

	async function addHoliday(event: SubmitEvent) {
		event.preventDefault();
		if (!s || !newHoliday || s.holidays.extra.includes(newHoliday)) return;
		const extra = [...s.holidays.extra, newHoliday].sort();
		await save({ holidays: { ...s.holidays, extra } }, true);
		newHoliday = '';
	}

	async function setTheme(theme: Theme) {
		applyTheme(theme);
		await save({ theme });
	}

	function toggleWorkDay(day: number, checked: boolean) {
		if (!s) return;
		const days = checked ? [...new Set([...s.workDays, day])].sort() : s.workDays.filter((d) => d !== day);
		if (days.length === 0) return;
		void save({ workDays: days }, true);
	}
</script>

<svelte:head>
	<title>Ajustes · Cuadrante</title>
</svelte:head>

<div class="settings">
	<h1>Ajustes</h1>

	{#if s}
		<section aria-labelledby="s-goals">
			<h2 id="s-goals">Objetivos</h2>
			<ul class="card">
				{#each $activeGoals as goal, index (goal.id)}
					<li class="row">
						<input
							type="text"
							aria-label={`Objetivo ${index + 1}`}
							value={goal.title}
							maxlength={GOAL_SUMMARY_MAX}
							onchange={(e) => e.currentTarget.value.trim() && repos.goals.rename(goal.id, e.currentTarget.value)}
						/>
						<Button variant="text" aria-label={`Quitar ${goal.title}`} onclick={() => repos.goals.remove(goal.id)}>Quitar</Button>
					</li>
				{/each}
				{#if $activeGoals.length < MAX_GOALS}
					<li>
						<form class="row add" onsubmit={addGoal}>
							<input type="text" aria-label="Nuevo objetivo" placeholder="Nuevo objetivo" maxlength={GOAL_SUMMARY_MAX} bind:value={newGoal} />
							<Button type="submit" variant="text">+ Añadir objetivo</Button>
						</form>
					</li>
				{/if}
			</ul>
			<p class="note">El asistente los usa para decidir qué es importante. Mejor pocos y concretos (hasta {MAX_GOALS}).</p>
		</section>

		<section aria-labelledby="s-urgency">
			<h2 id="s-urgency">Urgencia y horario</h2>
			<div class="card">
				<div class="row">
					<span id="s-urgency-label">Urgente si vence en</span>
					<div class="stepper" role="group" aria-labelledby="s-urgency-label">
						<button
							type="button"
							aria-label="Un día menos"
							disabled={s.urgencyDays <= 1}
							onclick={() => save({ urgencyDays: s.urgencyDays - 1 }, true)}>−</button
						>
						<output aria-live="polite"
							>{s.urgencyDays} {s.urgencyDays === 1 ? 'día' : 'días'}<span class="short" aria-hidden="true"> lab.</span><span class="long"
								> {s.urgencyDays === 1 ? 'laborable' : 'laborables'}</span
							></output
						>
						<button
							type="button"
							aria-label="Un día más"
							disabled={s.urgencyDays >= 5}
							onclick={() => save({ urgencyDays: s.urgencyDays + 1 }, true)}>+</button
						>
					</div>
				</div>
				<div class="row">
					<span id="s-hours">Horario de trabajo</span>
					<div class="hours" role="group" aria-labelledby="s-hours">
						<input
							type="time"
							aria-label="Empieza"
							value={s.workHours.start}
							onchange={(e) => e.currentTarget.value && save({ workHours: { ...s.workHours, start: e.currentTarget.value } })}
						/>
						<span aria-hidden="true">–</span>
						<input
							type="time"
							aria-label="Termina"
							value={s.workHours.end}
							onchange={(e) => e.currentTarget.value && save({ workHours: { ...s.workHours, end: e.currentTarget.value } })}
						/>
					</div>
				</div>
				<fieldset class="row days">
					<legend>Días laborables</legend>
					<div class="day-list">
						{#each WEEKDAYS as weekday (weekday.day)}
							<label class="day" title={weekday.name}>
								<input
									type="checkbox"
									aria-label={weekday.name}
									checked={s.workDays.includes(weekday.day)}
									onchange={(e) => toggleWorkDay(weekday.day, e.currentTarget.checked)}
								/>
								<span aria-hidden="true">{weekday.short}</span>
							</label>
						{/each}
					</div>
				</fieldset>
				<div class="row">
					<label for="s-national">Festivos nacionales</label>
					<input
						id="s-national"
						class="check"
						type="checkbox"
						checked={s.holidays.national}
						onchange={(e) => save({ holidays: { ...s.holidays, national: e.currentTarget.checked } }, true)}
					/>
				</div>
				<div class="row column">
					<span id="s-extra">Otros días no laborables</span>
					<ul class="extra" aria-labelledby="s-extra">
						{#each s.holidays.extra as date (date)}
							<li>
								<span>{formatShortDate(fromDateKey(date))} {date.slice(0, 4)}</span>
								<Button
									variant="text"
									aria-label={`Quitar ${formatShortDate(fromDateKey(date))}`}
									onclick={() => save({ holidays: { ...s.holidays, extra: s.holidays.extra.filter((d) => d !== date) } }, true)}
									>Quitar</Button
								>
							</li>
						{/each}
					</ul>
					<form class="add-date" onsubmit={addHoliday}>
						<input type="date" aria-label="Día no laborable" bind:value={newHoliday} />
						<Button type="submit" variant="text">+ Añadir</Button>
					</form>
				</div>
			</div>
			<p class="note">Si un festivo cae en domingo y tu comunidad lo pasa al lunes, añade el lunes.</p>
		</section>

		<section aria-labelledby="s-people">
			<h2 id="s-people">Personas para delegar</h2>
			<ul class="card">
				{#each $people as person (person.id)}
					<li class="row person">
						<input
							type="text"
							aria-label="Nombre"
							value={person.name}
							onchange={(e) => e.currentTarget.value.trim() && repos.people.update(person.id, { name: e.currentTarget.value })}
						/>
						<input
							type="text"
							aria-label={`Alias de ${person.name}, separados por comas`}
							placeholder="Alias, separados por comas"
							value={person.aliases.join(', ')}
							onchange={(e) => repos.people.update(person.id, { aliases: aliasesFrom(e.currentTarget.value) })}
						/>
						<Button variant="text" aria-label={`Quitar a ${person.name}`} onclick={() => repos.people.remove(person.id)}>Quitar</Button>
					</li>
				{/each}
				<li>
					<form class="row add" onsubmit={addPerson}>
						<input type="text" aria-label="Nueva persona" placeholder="Nombre" bind:value={newPerson} />
						<Button type="submit" variant="text">+ Añadir persona</Button>
					</form>
				</li>
			</ul>
			<p class="note">Solo nombres, para reconocerlos al capturar. La app no les envía nada.</p>
		</section>

		<section aria-labelledby="s-ai">
			<h2 id="s-ai">Asistente</h2>
			<div class="card">
				<div class="row">
					<span><AiDot />Estado</span>
					<span class="badge">No descargado</span>
				</div>
				<div class="row">
					<span>Motor en uso</span>
					<span>Reglas</span>
				</div>
				<div class="row">
					<label for="s-wifi">Actualizar solo con wifi</label>
					<input
						id="s-wifi"
						class="check"
						type="checkbox"
						checked={s.model.wifiOnly}
						onchange={(e) => save({ model: { ...s.model, wifiOnly: e.currentTarget.checked } })}
					/>
				</div>
			</div>
			<p class="note">Mientras no esté el asistente, la app clasifica con reglas y te pregunta cuando duda. Tus tareas no salen del dispositivo.</p>
		</section>

		<section aria-labelledby="s-theme">
			<h2 id="s-theme">Apariencia</h2>
			<fieldset class="segmented">
				<legend class="visually-hidden">Tema</legend>
				{#each [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Sistema']] as [value, label] (value)}
					<label>
						<input type="radio" name="theme" {value} checked={s.theme === value} onchange={() => setTheme(value as Theme)} />
						<span>{label}</span>
					</label>
				{/each}
			</fieldset>
		</section>

		<DataSection {persisted} />
	{/if}
</div>

<style>
	.settings {
		flex-grow: 1;
		width: 100%;
		max-width: 720px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}
	h1 {
		margin: 0 var(--space-1);
		font-size: 32px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	h2 {
		margin: 0 var(--space-1);
		font-size: 18px;
		font-weight: 700;
	}
	.card {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		display: flex;
		flex-direction: column;
	}
	.card > :global(*) + :global(*) {
		border-top: 1px solid var(--border);
	}
	.row {
		min-height: 52px;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: 14px;
	}
	.row.column {
		flex-direction: column;
		align-items: stretch;
		padding-top: var(--space-3);
	}
	.row input[type='text'] {
		flex-grow: 1;
		min-width: 0;
		min-height: var(--touch);
		border: 0;
		border-bottom: 1px solid var(--border-control);
		background: transparent;
		font-size: 14px;
	}
	.person input[type='text'] + input[type='text'] {
		color: var(--text-muted);
	}
	.add {
		margin: 0;
	}
	input[type='time'],
	input[type='date'] {
		min-height: var(--touch);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		padding: 0 var(--space-2);
		background: var(--surface);
		font-size: 14px;
	}
	.check {
		width: 22px;
		height: 22px;
		margin: 0 var(--space-3);
		accent-color: var(--cta-bg);
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.stepper button {
		width: var(--touch);
		height: var(--touch);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		background: var(--surface);
		font-size: 18px;
		cursor: pointer;
	}
	.stepper button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.stepper output {
		min-width: 6.5em;
		white-space: nowrap;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.long {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	@media (min-width: 768px) {
		.short {
			display: none;
		}
		.long {
			position: static;
			width: auto;
			height: auto;
			clip: auto;
		}
	}
	.hours {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	fieldset {
		margin: 0;
		border: 0;
	}
	.days {
		flex-wrap: wrap;
	}
	.days legend {
		float: left;
		padding: 0;
	}
	.day-list {
		display: flex;
		gap: 2px;
	}
	.day {
		position: relative;
		width: 40px;
		height: var(--touch);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.day input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.day span {
		width: 34px;
		height: 34px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border-control);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 500;
	}
	.day input:checked + span {
		background: var(--cta-bg);
		color: var(--cta-text);
		border-color: var(--cta-bg);
	}
	.day input:focus-visible + span {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.extra {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.extra li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--font-mono);
		font-size: 12px;
	}
	.add-date {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding-bottom: var(--space-2);
	}
	.badge {
		padding: 2px var(--space-2-5);
		border-radius: var(--radius-pill);
		background: var(--accent-ai-soft);
		color: var(--accent-ai-ink);
		font-size: 12px;
		font-weight: 600;
	}
	.note {
		margin: 0 var(--space-1);
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.segmented {
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
	}
	.segmented label {
		position: relative;
		display: flex;
	}
	.segmented input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.segmented span {
		flex-grow: 1;
		min-height: var(--touch);
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		background: var(--surface);
		font-size: 14px;
	}
	.segmented input:checked + span {
		background: var(--cta-bg);
		color: var(--cta-text);
		border-color: var(--cta-bg);
		font-weight: 600;
	}
	.segmented input:focus-visible + span {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
</style>
