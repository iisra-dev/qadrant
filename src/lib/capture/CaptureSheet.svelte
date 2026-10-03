<script lang="ts">
	import { goto } from '$app/navigation';
	import { capture } from '$lib/app/capture.svelte';
	import { classifyContext, currentSettings } from '$lib/app/context';
	import { dictate, localSpeechAvailable } from '$lib/app/speech';
	import { atTime, fromDateKey } from '$lib/domain/dates';
	import { captureLines, doubtText } from '$lib/domain/explain';
	import { formatPercent } from '$lib/domain/format';
	import { doubtOutcomes, redecide } from '$lib/domain/quadrant';
	import { QUADRANTS, type Decision, type Quadrant } from '$lib/domain/types';
	import { classify, latestClassifier } from '$lib/engine';
	import { taskActions } from '$lib/tasks/actions';
	import { AiDot, Button, IconButton, QuadrantPicker, QUADRANT_META, quadrantVars, Sheet } from '$lib/ui';
	import { activeGoals, people } from '$lib/stores';

	const DEBOUNCE_MS = 400;
	const classifyLatest = latestClassifier();

	let text = $state('');
	// Raw: the decision is stored in IndexedDB as is, and proxies cannot be cloned.
	let decision = $state.raw<Decision | null>(null);
	let decidedFor = $state('');
	let chosen = $state<Quadrant | null>(null);
	let saving = $state(false);
	let showDate = $state(false);
	let showPicker = $state(false);
	let dateValue = $state('');
	let canDictate = $state(false);
	let stopDictation: (() => void) | null = $state(null);
	let textarea: HTMLTextAreaElement | undefined = $state();

	const quadrant = $derived(chosen ?? decision?.quadrant ?? null);
	const isDoubt = $derived(Boolean(decision && decision.quadrant === null && !chosen));
	const explainCtx = $derived({ now: new Date(), settings: currentSettings(), goals: $activeGoals, people: $people });
	const lines = $derived(decision ? captureLines(decision, explainCtx) : null);

	// Opening the sheet starts from the text given by the caller (the web header field).
	$effect(() => {
		if (!capture.open) return;
		text = capture.text;
		decision = null;
		decidedFor = '';
		chosen = null;
		showDate = showPicker = false;
		dateValue = '';
		localSpeechAvailable().then((available) => (canDictate = available));
		queueMicrotask(() => textarea?.focus());
	});

	// Classify 400 ms after the user stops typing.
	$effect(() => {
		const current = text.trim();
		if (!capture.open) return;
		if (!current) {
			decision = null;
			decidedFor = '';
			return;
		}
		const timer = setTimeout(async () => {
			const result = await classifyLatest(current, classifyContext());
			if (result) setDecision(result, current);
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	function setDecision(next: Decision, forText: string) {
		decision = next;
		decidedFor = forText;
		chosen = null;
		showDate = showPicker = false;
	}

	async function ensureDecision(): Promise<Decision | null> {
		const current = text.trim();
		if (!current) return null;
		if (decision && decidedFor === current) return decision;
		const result = await classify(current, classifyContext());
		setDecision(result, current);
		return result;
	}

	function close() {
		stopDictation?.();
		capture.hide();
	}

	async function save(options: { details?: boolean } = {}) {
		if (saving) return;
		saving = true;
		try {
			const result = await ensureDecision();
			if (!result) return;
			if (!chosen && result.quadrant === null) return; // the doubt is shown instead
			const task = await taskActions.saveCapture({
				rawInput: text.trim(),
				decision: result,
				choice: chosen ? { kind: 'manual', quadrant: chosen } : { kind: 'accepted' },
				settings: currentSettings()
			});
			close();
			if (options.details) await goto(`/task/${task.id}`);
		} finally {
			saving = false;
		}
	}

	async function answer(yes: boolean) {
		if (!decision || saving) return;
		saving = true;
		try {
			await taskActions.saveCapture({
				rawInput: text.trim(),
				decision,
				choice: { kind: 'answer', answer: yes },
				settings: currentSettings()
			});
			close();
		} finally {
			saving = false;
		}
	}

	function applyDate() {
		if (!decision || !dateValue) return;
		const settings = currentSettings();
		const dueAt = atTime(fromDateKey(dateValue), settings.workHours.end).toISOString();
		const next = redecide(decision, dueAt, new Date(), settings);
		decision = next;
		if (next.quadrant !== null) showDate = false;
	}

	function onTextKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			void save();
		}
	}

	// Web shortcuts: 1-4 change the quadrant when the focus is not in a text field.
	function onSheetKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('textarea, input, select')) return;
		const index = ['1', '2', '3', '4'].indexOf(event.key);
		if (index >= 0 && decision) {
			event.preventDefault();
			chosen = QUADRANTS[index];
		}
	}

	function toggleDictation() {
		if (stopDictation) {
			stopDictation();
			stopDictation = null;
			return;
		}
		const base = text ? `${text.trimEnd()} ` : '';
		stopDictation = dictate(
			(spoken) => (text = base + spoken),
			() => (stopDictation = null)
		);
	}

	const RESULT_TEXT: Record<Quadrant, string> = {
		do: 'Urgente e importante',
		schedule: 'Importante, sin prisa',
		delegate: 'Lo puede hacer otra persona',
		eliminate: 'Ni urgente ni importante'
	};

	const doubtP = $derived(
		decision?.ask === 'delegable' ? decision.delegable.p : (decision?.importance.p ?? null)
	);
	const outcomes = $derived(
		decision?.ask
			? doubtOutcomes({ ask: decision.ask, urgent: decision.urgent.value, pDelegable: decision.delegable.p })
			: null
	);
</script>

<Sheet open={capture.open} label="Nueva tarea" onclose={close}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="capture" onkeydown={onSheetKeydown}>
		<div class="head">
			<h2>Nueva tarea</h2>
			<IconButton label="Cerrar" icon="close" onclick={close} />
		</div>

		<div class="input">
			<label class="visually-hidden" for="capture-text">Tarea</label>
			<textarea
				id="capture-text"
				rows="2"
				bind:this={textarea}
				bind:value={text}
				onkeydown={onTextKeydown}
				placeholder="¿Qué tienes en mente?"
			></textarea>
			{#if canDictate}
				<IconButton
					label={stopDictation ? 'Parar el dictado' : 'Dictar'}
					icon="mic"
					aria-pressed={Boolean(stopDictation)}
					onclick={toggleDictation}
				/>
			{/if}
		</div>

		{#if decision && isDoubt && decision.ask && outcomes}
			<div class="doubt">
				<span class="label">
					<AiDot />NO LO TENGO CLARO{#if doubtP !== null}&nbsp;· {formatPercent(doubtP)}{/if}
				</span>
				<p class="question">
					{decision.ask === 'importance' ? '¿Te acerca a alguno de tus objetivos?' : '¿Puede hacerlo otra persona?'}
				</p>
				<p class="context">{doubtText(decision, explainCtx)}</p>
			</div>
			<div class="answers">
				<button type="button" class="answer" style={quadrantVars(outcomes.yes)} onclick={() => answer(true)} disabled={saving}>
					{decision.ask === 'importance' ? 'Sí, es importante' : 'Sí, puede hacerlo otra persona'}
					<span>va a {QUADRANT_META[outcomes.yes].name}</span>
				</button>
				<button type="button" class="answer" style={quadrantVars(outcomes.no)} onclick={() => answer(false)} disabled={saving}>
					{decision.ask === 'importance' ? 'No, no lo es' : 'No, nadie más puede'}
					<span>va a {QUADRANT_META[outcomes.no].name}</span>
				</button>
			</div>
			<div class="links">
				<Button variant="text" aria-expanded={showDate} onclick={() => (showDate = !showDate)}>Añadir fecha</Button>
				<Button variant="text" aria-expanded={showPicker} onclick={() => (showPicker = !showPicker)}>
					Elegir cuadrante a mano
				</Button>
			</div>
			{#if showDate}
				<div class="date">
					<label for="capture-date">Fecha límite</label>
					<input id="capture-date" type="date" bind:value={dateValue} onchange={applyDate} />
				</div>
			{/if}
			{#if showPicker}
				<QuadrantPicker value={chosen} label="Elegir cuadrante" onchange={(q) => (chosen = q)} />
			{/if}
		{:else if decision && quadrant && lines}
			<div class="result" style={quadrantVars(quadrant)}>
				<div class="result-main">
					<span class="label">
						{#if !chosen}<AiDot />{/if}{chosen ? 'LO PONES EN' : 'VA A'}
					</span>
					<span class="result-name">{QUADRANT_META[quadrant].name}</span>
				</div>
				<span class="result-rule">{RESULT_TEXT[quadrant]}</span>
			</div>
			<dl>
				<div><dt>Urgente</dt><dd>{lines.urgent}</dd></div>
				<div><dt>Importante</dt><dd>{lines.important}</dd></div>
				<div><dt>Hueco</dt><dd>{lines.slot}</dd></div>
			</dl>
			<QuadrantPicker value={quadrant} label="Cambiar cuadrante" onchange={(q) => (chosen = q)} />
		{/if}

		{#if !isDoubt}
			<div class="actions">
				<Button size="lg" block onclick={() => save()} disabled={saving || !text.trim()}>Guardar</Button>
				<span class="web-only">
					<Button variant="text" onclick={() => save({ details: true })} disabled={saving || !text.trim()}>
						Más detalles
					</Button>
				</span>
			</div>
		{/if}
	</div>
</Sheet>

<style>
	.capture {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		margin: 0;
		font-size: 22px;
	}
	.input {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	textarea {
		flex-grow: 1;
		min-height: 72px;
		border: 1px solid var(--border-control);
		border-radius: 16px;
		padding: var(--space-3) 14px;
		font-size: 15px;
		line-height: 1.4;
		background: var(--bg);
		resize: none;
	}
	.label {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.08em;
	}
	.result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		background: var(--q-bg);
		color: var(--q-ink);
		border-radius: 16px;
		padding: 14px var(--space-4);
	}
	.result-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.result-name {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 700;
	}
	.result-rule {
		font-size: 12px;
		text-align: right;
		max-width: 10em;
	}
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2-5);
		font-size: 14px;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		text-align: right;
	}
	.doubt {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.doubt .label {
		color: var(--text-muted);
	}
	.question {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
		line-height: 1.25;
	}
	.context {
		margin: 0;
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.45;
	}
	.answers {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.answer {
		min-height: 56px;
		border: 0;
		border-radius: 16px;
		background: var(--q-bg);
		color: var(--q-ink);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 0 18px;
		font: inherit;
		font-size: 15px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.answer span {
		font-size: 12px;
		font-weight: 400;
		flex-shrink: 0;
	}
	.links {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.date {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: 14px;
	}
	.date input {
		min-height: var(--touch);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		padding: 0 var(--space-3);
		background: var(--surface);
	}
	.actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
	}
	.web-only {
		display: none;
	}
	@media (min-width: 768px) {
		.web-only {
			display: contents;
		}
	}
</style>
