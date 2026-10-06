<script lang="ts">
	import { goto } from '$app/navigation';
	import { capture } from '$lib/app/capture.svelte';
	import { classifyContext, currentSettings } from '$lib/app/context';
	import { dictate, speechMode, type SpeechMode } from '$lib/app/speech';
	import { repos } from '$lib/db/repositories';
	import { atTime, fromDateKey } from '$lib/domain/dates';
	import { captureLines, doubtText } from '$lib/domain/explain';
	import { formatPercent } from '$lib/domain/format';
	import { doubtOutcomes, redecide } from '$lib/domain/quadrant';
	import { proposeSlot } from '$lib/domain/scheduler';
	import { QUADRANTS, type Decision, type Quadrant } from '$lib/domain/types';
	import { classify, latestClassifier } from '$lib/engine';
	import { taskActions } from '$lib/tasks/actions';
	import { i18n } from '$lib/i18n/index.svelte';
	import { fade, fly, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { AiDot, autoHeight, Button, Icon, IconButton, QuadrantGlyph, QuadrantPicker, quadrantVars, Sheet } from '$lib/ui';
	import { activeGoals, calendarEvents, openTasks, people } from '$lib/stores';

	const DEBOUNCE_MS = 400;
	/** "Thinking" shows only if the answer takes longer than this: rules answer at once and never flash it. */
	const THINKING_DELAY_MS = 150;
	const classifyLatest = latestClassifier();

	// Entrances slide up a little; with reduced motion they only fade (docs/05, "Movimiento").
	const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const rise = (delay = 0) => ({ y: reduced ? 0 : 8, duration: reduced ? 150 : 320, delay: reduced ? 0 : delay, easing: quintOut });

	let text = $state('');
	// Raw: the decision is stored in IndexedDB as is, and proxies cannot be cloned.
	let decision = $state.raw<Decision | null>(null);
	let decidedFor = $state('');
	let chosen = $state<Quadrant | null>(null);
	let saving = $state(false);
	let thinking = $state(false);
	let showDate = $state(false);
	let showPicker = $state(false);
	let dateValue = $state('');
	let mode = $state<SpeechMode>('none');
	const canDictate = $derived(mode !== 'none');
	// The browser's service sends the audio out: ask once before using it (docs/01).
	let askConsent = $state(false);
	let stopDictation: (() => void) | null = $state(null);
	let textarea: HTMLTextAreaElement | undefined = $state();

	const quadrant = $derived(chosen ?? decision?.quadrant ?? null);
	const isDoubt = $derived(Boolean(decision && decision.quadrant === null && !chosen));
	const explainCtx = $derived({ now: new Date(), settings: currentSettings(), goals: $activeGoals, people: $people, lang: i18n.lang });
	function slotFor(target: Quadrant | null): string | undefined {
		if (!decision || !target) return undefined;
		const slot = proposeSlot(
			{ quadrant: target, durationMin: decision.durationMin, dueAt: decision.urgent.dueAt },
			{ now: new Date(), tasks: $openTasks, settings: currentSettings(), events: $calendarEvents }
		);
		return slot?.start;
	}
	const slotStart = $derived(slotFor(quadrant));
	const lines = $derived(decision ? captureLines(decision, explainCtx, slotStart ? new Date(slotStart) : undefined) : null);

	// Opening the sheet starts from the text given by the caller (the web header field).
	$effect(() => {
		if (!capture.open) return;
		text = capture.text;
		decision = null;
		decidedFor = '';
		chosen = null;
		showDate = showPicker = false;
		dateValue = '';
		const startDictating = capture.dictate;
		askConsent = false;
		speechMode(i18n.lang).then((found) => {
			mode = found;
			if (found !== 'none' && startDictating && !stopDictation) toggleDictation();
		});
		queueMicrotask(() => textarea?.focus());
	});

	// Classify 400 ms after the user stops typing.
	$effect(() => {
		const current = text.trim();
		if (!capture.open) return;
		if (!current) {
			decision = null;
			decidedFor = '';
			thinking = false;
			return;
		}
		const timer = setTimeout(async () => {
			const slow = setTimeout(() => (thinking = true), THINKING_DELAY_MS);
			const result = await classifyLatest(current, classifyContext());
			clearTimeout(slow);
			thinking = false;
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

	/** Closing without saving discards the text (docs/01, "Captura"). */
	function close() {
		if (!capture.open) return;
		stopDictation?.();
		stopDictation = null;
		thinking = false;
		capture.hide();
	}

	function useExample(example: string) {
		text = example;
		textarea?.focus();
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
				settings: currentSettings(),
				scheduledAt: slotFor(chosen ?? result.quadrant)
			});
			close();
			capture.markLanded(task.id);
			if (options.details) await goto(`/task/${task.id}`);
		} finally {
			saving = false;
		}
	}

	async function answer(yes: boolean) {
		if (!decision || saving) return;
		saving = true;
		try {
			const task = await taskActions.saveCapture({
				rawInput: text.trim(),
				decision,
				choice: { kind: 'answer', answer: yes },
				settings: currentSettings(),
				scheduledAt: outcomes ? slotFor(yes ? outcomes.yes : outcomes.no) : undefined
			});
			close();
			capture.markLanded(task.id);
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
		if (mode === 'none') return;
		if (mode === 'cloud' && !currentSettings().voiceConsent) {
			askConsent = true;
			return;
		}
		const base = text ? `${text.trimEnd()} ` : '';
		stopDictation = dictate(
			i18n.lang,
			mode,
			(spoken) => (text = base + spoken),
			() => (stopDictation = null)
		);
	}

	async function acceptVoice() {
		askConsent = false;
		await repos.settings.update({ voiceConsent: true });
		toggleDictation();
	}

	const doubtP = $derived(
		decision?.ask === 'delegable' ? decision.delegable.p : (decision?.importance.p ?? null)
	);
	const outcomes = $derived(
		decision?.ask
			? doubtOutcomes({ ask: decision.ask, urgent: decision.urgent.value, pDelegable: decision.delegable.p })
			: null
	);
</script>

<Sheet open={capture.open} label={i18n.m.capture.title} onclose={() => close()}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="capture" onkeydown={onSheetKeydown}>
		<div class="head">
			<h2>{i18n.m.capture.title}</h2>
			<IconButton label={i18n.m.common.close} icon="close" onclick={() => close()} />
		</div>

		<div class="input">
			<label class="visually-hidden" for="capture-text">{i18n.m.capture.field}</label>
			<textarea
				id="capture-text"
				rows="2"
				class:with-mic={canDictate}
				bind:this={textarea}
				bind:value={text}
				onkeydown={onTextKeydown}
				placeholder={i18n.m.capture.placeholder}
			></textarea>
			{#if canDictate}
				<span class="mic" class:on={Boolean(stopDictation)}>
					<IconButton
						label={stopDictation ? i18n.m.capture.stopDictation : i18n.m.capture.dictate}
						icon="mic"
						aria-pressed={Boolean(stopDictation)}
						onclick={toggleDictation}
					/>
				</span>
			{/if}
		</div>

		{#if askConsent}
			<div class="consent" role="alertdialog" aria-labelledby="voice-title" aria-describedby="voice-text" transition:slide={{ duration: reduced ? 0 : 280 }}>
				<p id="voice-title" class="consent-title">{i18n.m.capture.voiceAskTitle}</p>
				<p id="voice-text" class="consent-text">{i18n.m.capture.voiceAskText}</p>
				<div class="consent-actions">
					<Button onclick={acceptVoice}>{i18n.m.capture.voiceAccept}</Button>
					<Button variant="secondary" onclick={() => (askConsent = false)}>{i18n.m.capture.voiceDecline}</Button>
				</div>
			</div>
		{/if}

		{#if stopDictation}
			<div class="listening" transition:slide={{ duration: reduced ? 0 : 280 }}>
				<span class="pulse" aria-hidden="true"></span>
				<div class="listening-text">
					<p class="listening-status" role="status">{i18n.m.capture.listening}</p>
					<p class="listening-note">
						{#if mode === 'local'}<Icon name="lock" size={16} />{/if}{mode === 'local' ? i18n.m.capture.voicePrivacy : i18n.m.capture.voiceCloud}
					</p>
				</div>
				<Button variant="secondary" onclick={toggleDictation}>{i18n.m.capture.finishDictation}</Button>
			</div>
		{/if}

		<!-- The proposal area grows and shrinks smoothly instead of jumping (docs/05, "Movimiento"). -->
		<div class="zone" use:autoHeight>
			<div class="zone-inner">
				{#if decision && isDoubt && decision.ask && outcomes}
					<div class="doubt-block" in:fly={rise()}>
						<div class="doubt">
							<span class="label">
								<AiDot />{i18n.m.capture.unsure}{#if doubtP !== null}&nbsp;· {formatPercent(doubtP, i18n.lang)}{/if}
							</span>
							<p class="question">
								{decision.ask === 'importance' ? i18n.m.capture.askImportance : i18n.m.capture.askDelegable}
							</p>
							<p class="context">{doubtText(decision, explainCtx)}</p>
						</div>
						<div class="answers">
							<button type="button" class="answer" style={quadrantVars(outcomes.yes)} onclick={() => answer(true)} disabled={saving}>
								<span class="answer-text">{decision.ask === 'importance' ? i18n.m.capture.yesImportant : i18n.m.capture.yesDelegable}</span>
								<span class="answer-goes">{i18n.m.capture.goesToQuadrant(i18n.m.quadrants[outcomes.yes].name)}</span>
								<Icon name="next" size={16} />
							</button>
							<button type="button" class="answer" style={quadrantVars(outcomes.no)} onclick={() => answer(false)} disabled={saving}>
								<span class="answer-text">{decision.ask === 'importance' ? i18n.m.capture.noImportant : i18n.m.capture.noDelegable}</span>
								<span class="answer-goes">{i18n.m.capture.goesToQuadrant(i18n.m.quadrants[outcomes.no].name)}</span>
								<Icon name="next" size={16} />
							</button>
						</div>
						<div class="links">
							<button type="button" class="chip" aria-expanded={showDate} onclick={() => (showDate = !showDate)}>
								<Icon name="agenda" size={16} />{i18n.m.capture.addDate}
							</button>
							<button type="button" class="chip" aria-expanded={showPicker} onclick={() => (showPicker = !showPicker)}>
								<Icon name="matrix" size={16} />{i18n.m.capture.pickByHand}
							</button>
						</div>
						{#if showDate}
							<div class="date" in:fly={rise()}>
								<label for="capture-date">{i18n.m.capture.dueDate}</label>
								<input id="capture-date" type="date" bind:value={dateValue} onchange={applyDate} />
							</div>
						{/if}
						{#if showPicker}
							<div in:fly={rise()}>
								<QuadrantPicker value={chosen} label={i18n.m.capture.choose} onchange={(q) => (chosen = q)} />
							</div>
						{/if}
					</div>
				{:else if decision && quadrant && lines}
					<div class="proposal" in:fly={rise()}>
						<!-- The color follows the quadrant with a transition when it changes. -->
						<div class="result" style={quadrantVars(quadrant)}>
							<div class="result-head">
								<div class="result-main">
									<span class="label">{#if !chosen}<AiDot />{/if}{chosen ? i18n.m.capture.youPut : i18n.m.capture.goesTo}</span>
									<span class="result-name">{i18n.m.quadrants[quadrant].name}</span>
								</div>
								<QuadrantGlyph {quadrant} size={28} />
							</div>
							<dl>
								<div in:fly={rise(80)}><dt>{i18n.m.capture.urgent}</dt><dd>{lines.urgent}</dd></div>
								<div in:fly={rise(140)}><dt>{i18n.m.capture.important}</dt><dd>{lines.important}</dd></div>
								<div in:fly={rise(200)}><dt>{i18n.m.capture.slot}</dt><dd>{lines.slot}</dd></div>
							</dl>
						</div>
						<QuadrantPicker value={quadrant} label={i18n.m.capture.change} onchange={(q) => (chosen = q)} />
					</div>
				{:else if thinking}
					<div class="thinking" role="status" in:fade={{ duration: 150 }}>
						<span class="label"><span class="beat" aria-hidden="true"></span>{i18n.m.capture.thinking}</span>
						<span class="bar wide" aria-hidden="true"></span>
						<span class="bar" aria-hidden="true"></span>
						<span class="bar short" aria-hidden="true"></span>
					</div>
				{:else}
					<!-- Stays while the first proposal is on its way, so the area does not collapse and grow again. -->
					<div class="examples" in:fade={{ duration: 150 }}>
						<span class="examples-label">{i18n.m.capture.examplesLabel}</span>
						<div class="example-list">
							{#each i18n.m.capture.examples as example (example)}
								<button type="button" class="example" onclick={() => useExample(example)}>{example}</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		{#if !isDoubt}
			<div class="actions" transition:slide={{ duration: reduced ? 0 : 320, easing: quintOut }}>
				<Button size="lg" block onclick={() => save()} disabled={saving || !text.trim()}>
					{quadrant ? i18n.m.capture.saveIn(i18n.m.quadrants[quadrant].name) : i18n.m.capture.save}
				</Button>
				<Button variant="text" onclick={() => save({ details: true })} disabled={saving || !text.trim()}>
					{i18n.m.capture.details}
				</Button>
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
		margin-right: calc(-1 * var(--space-2));
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
	}
	.input {
		position: relative;
	}
	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 84px;
		border: 1px solid transparent;
		border-radius: 16px;
		padding: 14px var(--space-4);
		font-size: 17px;
		line-height: 1.4;
		background: var(--surface-muted);
		color: var(--text);
		resize: none;
	}
	textarea.with-mic {
		padding-right: 56px;
	}
	.mic {
		position: absolute;
		right: var(--space-1);
		bottom: var(--space-1);
		border-radius: var(--radius-pill);
		background: var(--surface);
		box-shadow: 0 1px 2px rgb(9 9 11 / 0.1);
	}
	.mic.on {
		background: var(--cta-bg);
		color: var(--cta-text);
	}
	.mic.on :global(.icon-button) {
		color: inherit;
	}
	.consent {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-radius: 16px;
		border: 1px solid var(--border-control);
	}
	.consent p {
		margin: 0;
	}
	.consent-title {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 600;
	}
	.consent-text {
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.consent-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.listening {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-radius: 16px;
		background: var(--surface-muted);
	}
	.pulse {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		border-radius: 7px;
		background: var(--text);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	.listening-text {
		flex: 1 1 180px;
		min-width: 0;
	}
	.listening-text p {
		margin: 0;
	}
	.listening-status {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 600;
	}
	.listening-note {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.zone {
		transition: height 320ms cubic-bezier(0.32, 0.72, 0, 1);
	}
	.zone-inner {
		display: flex;
		flex-direction: column;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
	}
	.examples {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.examples-label {
		font-size: 13px;
		color: var(--text-muted);
	}
	.example-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.example {
		min-height: var(--touch);
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 14px;
		cursor: pointer;
	}
	/* Placeholder while a slow answer (the model) comes: same place and size as the proposal. */
	.thinking {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-height: 168px;
		box-sizing: border-box;
		padding: var(--space-4);
		border-radius: var(--radius-card);
		background: var(--surface-muted);
		color: var(--text-muted);
	}
	.beat {
		width: 8px;
		height: 8px;
		border-radius: 4px;
		background: var(--accent-ai);
		animation: beat 1.1s ease-in-out infinite;
	}
	@keyframes beat {
		50% {
			transform: scale(0.6);
			opacity: 0.45;
		}
	}
	.bar {
		width: 70%;
		height: 12px;
		border-radius: 6px;
		background: linear-gradient(90deg, var(--border) 25%, var(--surface) 50%, var(--border) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.4s linear infinite;
	}
	.bar.wide {
		width: 88%;
	}
	.bar.short {
		width: 52%;
	}
	@keyframes shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}
	.proposal {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: var(--space-2-5);
		background: var(--q-bg);
		color: var(--q-ink);
		border-radius: var(--radius-card);
		padding: var(--space-4);
		transition:
			background-color 300ms ease,
			color 300ms ease;
	}
	.result-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.result-main {
		display: flex;
		flex-direction: column;
	}
	.result-name {
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 700;
		line-height: 1.15;
	}
	/* One reason per line: label and value side by side, the value wraps. */
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 14px;
	}
	dl div {
		display: grid;
		grid-template-columns: 92px minmax(0, 1fr);
		gap: var(--space-2);
	}
	dd {
		margin: 0;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.doubt-block {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.doubt {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.doubt .label {
		color: var(--text-muted);
	}
	.question {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		line-height: 1.25;
	}
	.context {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.45;
	}
	.answers {
		display: flex;
		flex-direction: column;
		gap: var(--space-2-5);
	}
	.answer {
		min-height: 56px;
		border: 0;
		border-radius: 16px;
		background: var(--q-bg);
		color: var(--q-ink);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 14px var(--space-2) 18px;
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.answer-text {
		flex-grow: 1;
	}
	.answer-goes {
		font-size: 13px;
		font-weight: 400;
		flex-shrink: 0;
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch);
		padding: 0 14px;
		border: 0;
		border-radius: var(--radius-control);
		background: var(--surface-muted);
		color: var(--text);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
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
		align-items: flex-start;
		gap: var(--space-1);
	}
	.actions > :global(:first-child) {
		align-self: stretch;
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse,
		.beat,
		.bar {
			animation: none;
		}
		.zone,
		.result {
			transition: none;
		}
	}
</style>
