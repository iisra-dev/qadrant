<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { repos } from '$lib/db/repositories';
	import { GOAL_SUMMARY_MAX } from '$lib/db/defaults';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { Lang } from '$lib/i18n/lang';
	import { AiDot, Button } from '$lib/ui';

	let goals = $state(['', '', '']);
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
	<div class="intro">
		<img src="/logo.svg" alt="" width="48" height="48" />
		<h1>{i18n.m.common.appName}</h1>
		<p>{m.intro}</p>
	</div>

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

	<section aria-labelledby="welcome-goals" class="goals">
		<h2 id="welcome-goals">{m.goals}</h2>
		{#each goals as _, index (index)}
			<input
				id={`goal-${index}`}
				type="text"
				aria-label={m.goal(index + 1)}
				placeholder={m.goalPlaceholders[index]}
				maxlength={GOAL_SUMMARY_MAX}
				required={index === 0}
				aria-invalid={index === 0 && missingGoal}
				aria-describedby={index === 0 && missingGoal ? 'goal-error' : undefined}
				bind:value={goals[index]}
				oninput={() => (missingGoal = false)}
			/>
		{/each}
		{#if missingGoal}<p id="goal-error" class="error" role="alert">{m.goalRequired}</p>{/if}
	</section>

	<section aria-labelledby="welcome-ai" class="ai">
		<h2 id="welcome-ai"><AiDot />{m.assistant}</h2>
		<p>{m.assistantText}</p>
		<div class="check">
			<input id="welcome-wifi" type="checkbox" bind:checked={wifiOnly} />
			<label for="welcome-wifi">{m.wifi}</label>
		</div>
	</section>

	{#if hint}<p class="hint">{hint}</p>{/if}

	<div class="submit">
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
		padding: 40px var(--space-5) var(--space-6);
		gap: var(--space-6);
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
	.intro p,
	.ai p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 600;
	}
	.languages {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
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
	.languages input:checked + span {
		background: var(--cta-bg);
		color: var(--cta-text);
		border-color: var(--cta-bg);
		font-weight: 600;
	}
	.languages input:focus-visible + span {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.goals {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.goals input {
		min-height: 48px;
		border: 1px solid var(--border-control);
		border-radius: var(--radius-block);
		padding: 0 14px;
		font-size: 14px;
		background: var(--surface);
	}
	.error {
		margin: 0;
		font-size: 13px;
		color: var(--text);
		font-weight: 600;
	}
	.ai {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2-5);
	}
	.ai p {
		font-size: 13px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2-5);
		min-height: var(--touch);
	}
	.check input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--cta-bg);
	}
	.check label {
		font-size: 14px;
	}
	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.submit {
		margin-top: auto;
	}
</style>
