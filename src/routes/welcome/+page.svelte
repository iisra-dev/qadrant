<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { repos } from '$lib/db/repositories';
	import { GOAL_SUMMARY_MAX } from '$lib/db/defaults';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { Lang } from '$lib/i18n/lang';
	import { AiDot, Button, Icon } from '$lib/ui';

	let goals = $state(['', '', '']);
	// One goal is asked for; up to two more appear on request (progressive disclosure).
	let shown = $state(1);
	let wifiOnly = $state(true);
	let missingGoal = $state(false);
	let saving = $state(false);
	let installHint = $state<'ios' | 'desktop' | 'android' | null>(null);

	const m = $derived(i18n.m.welcome);
	const hint = $derived(
		installHint === 'ios' ? m.installIos : installHint === 'desktop' ? m.installDesktop : installHint === 'android' ? m.installAndroid : ''
	);

	onMount(() => {
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (standalone) return;
		const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const mobile = /Android|Mobi/.test(navigator.userAgent);
		installHint = ios ? 'ios' : mobile ? 'android' : 'desktop';
	});

	async function addGoal() {
		shown += 1;
		await tick();
		document.getElementById(`goal-${shown - 1}`)?.focus();
	}

	async function setLanguage(lang: Lang) {
		i18n.set(lang);
		await repos.settings.get();
		await repos.settings.update({ language: lang });
	}

	async function start(event: SubmitEvent) {
		event.preventDefault();
		const titles = goals.map((goal) => goal.trim()).filter(Boolean);
		if (!goals[0].trim()) {
			missingGoal = true;
			document.getElementById('goal-0')?.focus();
			return;
		}
		saving = true;
		try {
			for (const title of titles) await repos.goals.add(title);
			const settings = await repos.settings.get();
			await repos.settings.update({
				onboardingDone: true,
				language: i18n.lang,
				model: { ...settings.model, wifiOnly }
			});
			// Ask the browser not to evict our data (docs/02, "Persistencia").
			try {
				await navigator.storage?.persist?.();
			} catch {
				// Settings > Data tells the user if it was denied.
			}
			await goto('/', { replaceState: true });
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{i18n.m.common.pageTitle(m.title)}</title>
</svelte:head>

<form class="welcome" onsubmit={start} novalidate>
	<!-- Changing language is rare: top corner, out of the thumb's way. -->
	<fieldset class="languages">
		<legend class="visually-hidden">{m.language}</legend>
		<!-- Each language named in itself, so it can be found in either. -->
		{#each [['en', 'English'], ['es', 'Español']] as [value, label] (value)}
			<label lang={value}>
				<input type="radio" name="language" {value} checked={i18n.lang === value} onchange={() => setLanguage(value as Lang)} />
				<span>{label}</span>
			</label>
		{/each}
	</fieldset>

	<div class="intro">
		<img src="/logo.svg" alt="" width="48" height="48" />
		<h1>{i18n.m.common.appName}</h1>
		<p>{m.intro}</p>
	</div>

	<div class="goals">
		<label class="main-goal" for="goal-0">{m.mainGoal}</label>
		<input
			id="goal-0"
			type="text"
			placeholder={m.goalPlaceholders[0]}
			maxlength={GOAL_SUMMARY_MAX}
			required
			aria-invalid={missingGoal}
			aria-describedby={missingGoal ? 'goal-error goal-help' : 'goal-help'}
			bind:value={goals[0]}
			oninput={() => (missingGoal = false)}
		/>
		{#if missingGoal}<p id="goal-error" class="error" role="alert">{m.goalRequired}</p>{/if}
		<p id="goal-help" class="help">{m.goalHelp}</p>
		{#each goals.slice(1, shown) as _, index (index)}
			<input
				id={`goal-${index + 1}`}
				type="text"
				aria-label={m.goal(index + 2)}
				placeholder={m.goalPlaceholders[index + 1]}
				maxlength={GOAL_SUMMARY_MAX}
				bind:value={goals[index + 1]}
			/>
		{/each}
		{#if shown < goals.length}
			<button class="add" type="button" onclick={addGoal}><Icon name="plus" size={20} />{m.addGoal}</button>
		{/if}
	</div>

	<div class="ai">
		<span class="check"><input id="welcome-wifi" type="checkbox" aria-describedby="welcome-ai" bind:checked={wifiOnly} /></span>
		<div class="ai-text">
			<label for="welcome-wifi"><AiDot />{m.wifi}</label>
			<p id="welcome-ai">{m.assistant}. {m.assistantText}</p>
		</div>
	</div>

	<div class="submit">
		{#if hint}<p class="hint">{hint}</p>{/if}
		<Button type="submit" size="lg" block disabled={saving}>{m.start}</Button>
	</div>
</form>

<style>
	.welcome {
		flex-grow: 1;
		width: 100%;
		max-width: 520px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding: var(--space-3) var(--space-5) var(--space-5);
		gap: var(--space-6);
	}
	.languages {
		align-self: flex-end;
		margin: 0;
		padding: 2px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-pill);
		display: flex;
	}
	.languages label {
		position: relative;
		display: flex;
	}
	.languages input {
		position: absolute;
		inset: 0;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.languages span {
		min-height: var(--touch);
		padding: 0 14px;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		font-size: 14px;
	}
	.languages input:checked + span {
		background: var(--cta-bg);
		color: var(--cta-text);
		font-weight: 600;
	}
	.languages input:focus-visible + span {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h1 {
		margin: 0;
		font-size: 36px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.intro p {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.goals {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.main-goal {
		font-size: 16px;
		font-weight: 600;
	}
	.goals input {
		min-height: 52px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-block);
		padding: 0 14px;
		font-size: 16px;
		background: var(--surface);
	}
	.help {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.error {
		margin: 0;
		font-size: 14px;
		color: var(--text);
		font-weight: 600;
	}
	.add {
		align-self: flex-start;
		min-height: var(--touch);
		padding: 0;
		border: 0;
		background: transparent;
		display: flex;
		align-items: center;
		gap: 6px;
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
	}
	.ai {
		display: flex;
		align-items: flex-start;
		gap: var(--space-1);
		padding: 6px var(--space-4) 6px var(--space-1);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
	}
	.check {
		width: var(--touch);
		height: var(--touch);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.check input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--cta-bg);
	}
	.ai-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2-5) 0;
	}
	.ai-text label {
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
	}
	.ai-text p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.submit {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-2-5);
	}
</style>
