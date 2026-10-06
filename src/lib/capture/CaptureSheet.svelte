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
	import { AiDot, Button, Icon, IconButton, QuadrantPicker, quadrantVars, Sheet } from '$lib/ui';
	import { activeGoals, calendarEvents, openTasks, people } from '$lib/stores';

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

	/** Closing without saving keeps the text as a draft (docs/01, "Captura"). */
	function close(saved = false) {
		// The dialog's own close event comes after a save; the draft is already settled.
		if (!capture.open) return;
		stopDictation?.();
		stopDictation = null;
		capture.hide(saved ? '' : text);
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
			close(true);
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
				settings: currentSettings(),
				scheduledAt: outcomes ? slotFor(yes ? outcomes.yes : outcomes.no) : undefined
			});
			close(true);
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
				bind:this={textarea}
				bind:value={text}
				onkeydown={onTextKeydown}
				placeholder={i18n.m.capture.placeholder}
			></textarea>
			{#if canDictate}
				<IconButton
					label={stopDictation ? i18n.m.capture.stopDictation : i18n.m.capture.dictate}
					icon="mic"
					aria-pressed={Boolean(stopDictation)}
					onclick={toggleDictation}
				/>
			{/if}
		</div>

		{#if askConsent}
			<div class="consent" role="alertdialog" aria-labelledby="voice-title" aria-describedby="voice-text">
				<p id="voice-title" class="consent-title">{i18n.m.capture.voiceAskTitle}</p>
				<p id="voice-text" class="consent-text">{i18n.m.capture.voiceAskText}</p>
				<div class="consent-actions">
					<Button onclick={acceptVoice}>{i18n.m.capture.voiceAccept}</Button>
					<Button variant="secondary" onclick={() => (askConsent = false)}>{i18n.m.capture.voiceDecline}</Button>
				</div>
			</div>
		{/if}

		{#if stopDictation}
			<div class="listening">
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

		{#if decision && isDoubt && decision.ask && outcomes}
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
					{decision.ask === 'importance' ? i18n.m.capture.yesImportant : i18n.m.capture.yesDelegable}
					<span>{i18n.m.capture.goesToQuadrant(i18n.m.quadrants[outcomes.yes].name)}</span>
				</button>
				<button type="button" class="answer" style={quadrantVars(outcomes.no)} onclick={() => answer(false)} disabled={saving}>
					{decision.ask === 'importance' ? i18n.m.capture.noImportant : i18n.m.capture.noDelegable}
					<span>{i18n.m.capture.goesToQuadrant(i18n.m.quadrants[outcomes.no].name)}</span>
				</button>
			</div>
			<div class="links">
				<Button variant="text" aria-expanded={showDate} onclick={() => (showDate = !showDate)}>{i18n.m.capture.addDate}</Button>
				<Button variant="text" aria-expanded={showPicker} onclick={() => (showPicker = !showPicker)}>
					{i18n.m.capture.pickByHand}
				</Button>
			</div>
			{#if showDate}
				<div class="date">
					<label for="capture-date">{i18n.m.capture.dueDate}</label>
					<input id="capture-date" type="date" bind:value={dateValue} onchange={applyDate} />
				</div>
			{/if}
			{#if showPicker}
				<QuadrantPicker value={chosen} label={i18n.m.capture.choose} onchange={(q) => (chosen = q)} />
			{/if}
		{:else if decision && quadrant && lines}
			<div class="result" style={quadrantVars(quadrant)}>
				<div class="result-head">
					<div class="result-main">
						<span class="label">
							{#if !chosen}<AiDot />{/if}{chosen ? i18n.m.capture.youPut : i18n.m.capture.goesTo}
						</span>
						<span class="result-name">{i18n.m.quadrants[quadrant].name}</span>
					</div>
					<span class="result-rule">{i18n.m.quadrants[quadrant].result}</span>
				</div>
				<dl>
					<div><dt>{i18n.m.capture.urgent}</dt><dd>{lines.urgent}</dd></div>
					<div><dt>{i18n.m.capture.important}</dt><dd>{lines.important}</dd></div>
					<div><dt>{i18n.m.capture.slot}</dt><dd>{lines.slot}</dd></div>
				</dl>
			</div>
			<div class="change">
				<span class="hint">{i18n.m.capture.changeHint}</span>
				<QuadrantPicker value={quadrant} label={i18n.m.capture.change} onchange={(q) => (chosen = q)} />
			</div>
		{/if}

		{#if !isDoubt}
			<div class="actions">
				<Button size="lg" block onclick={() => save()} disabled={saving || !text.trim()}>
					{quadrant ? i18n.m.capture.saveIn(i18n.m.quadrants[quadrant].name) : i18n.m.capture.save}
				</Button>
				<div class="secondary">
					<Button variant="text" onclick={() => save({ details: true })} disabled={saving || !text.trim()}>
						{i18n.m.capture.details}
					</Button>
					<span class="draft-note">{i18n.m.capture.draftNote}</span>
				</div>
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
		font-size: 16px;
		line-height: 1.4;
		background: var(--bg);
		resize: none;
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
		font-weight: 700;
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
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
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
		font-weight: 700;
	}
	.listening-note {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.label {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.08em;
	}
	.result {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		background: var(--q-bg);
		color: var(--q-ink);
		border-radius: var(--radius-card);
		padding: 14px var(--space-4);
	}
	.result-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.result-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.result-name {
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 700;
		line-height: 1.1;
	}
	.result-rule {
		font-size: 13px;
		text-align: right;
		max-width: 10em;
	}
	/* The three reasons side by side on a phone; they wrap when the text grows. */
	dl {
		margin: 0;
		padding-top: var(--space-2-5);
		border-top: 1px solid color-mix(in srgb, var(--q-ink) 16%, transparent);
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
		gap: var(--space-2);
	}
	dl div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	dt {
		font-size: 12px;
	}
	dd {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.change {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hint {
		font-size: 13px;
		color: var(--text-muted);
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
		font-size: 24px;
		font-weight: 700;
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
		min-height: 60px;
		border: 0;
		border-radius: 16px;
		background: var(--q-bg);
		color: var(--q-ink);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) 18px;
		font: inherit;
		font-size: 16px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.answer span {
		font-size: 13px;
		font-weight: 400;
		flex-shrink: 0;
	}
	.links {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		border-top: 1px solid var(--border);
		padding-top: var(--space-1);
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
		gap: var(--space-1);
	}
	.secondary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		column-gap: var(--space-3);
	}
	.draft-note {
		font-size: 12px;
		color: var(--text-muted);
	}
</style>
