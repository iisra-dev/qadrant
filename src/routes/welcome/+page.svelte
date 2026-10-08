<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { repos } from '$lib/db/repositories';
	import { GOAL_SUMMARY_MAX } from '$lib/db/defaults';
	import { i18n } from '$lib/i18n/index.svelte';
	import type { Lang } from '$lib/i18n/lang';
	import { AiDot, Button, Icon } from '$lib/ui';
	import { normaliseUrl, serverApi } from '$lib/ownserver/client';
	import { serverErrorText } from '$lib/ownserver/errors';
	import { askPermission, enablePush, pushSupported } from '$lib/ownserver/push';
	import { prepareSync, SYNC_API_VERSION, syncOnce } from '$lib/sync';
	import { taskActions } from '$lib/tasks/actions';

	let goals = $state(['', '', '']);
	// One goal is asked for; up to two more appear on request (progressive disclosure).
	let shown = $state(1);
	let autoDownload = $state(true);
	let missingGoal = $state(false);
	let saving = $state(false);
	let installHint = $state<'ios' | 'desktop' | 'android' | null>(null);

	// "Ya uso Qadrant en otro dispositivo" (docs/01): connect to the own server
	// and bring everything down instead of asking for a goal.
	let joining = $state(false);
	let serverUrl = $state('');
	let serverKey = $state('');
	let joinMessage = $state('');
	let goalNotice = $state('');

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

	async function showJoin(on: boolean) {
		joining = on;
		joinMessage = '';
		await tick();
		document.getElementById(on ? 'join-url' : 'goal-0')?.focus();
	}

	/** Device-local choices of this screen, and off to the Matrix. */
	async function finish() {
		const settings = await repos.settings.get();
		await repos.settings.update({
			onboardingDone: true,
			language: i18n.lang,
			// Checked: download on its own, on Wi-Fi (docs/01, "Bienvenida").
			model: { ...settings.model, autoDownload, wifiOnly: true }
		});
		// Ask the browser not to evict our data (docs/02, "Persistencia").
		try {
			await navigator.storage?.persist?.();
		} catch {
			// Settings > Data tells the user if it was denied.
		}
		await goto('/', { replaceState: true });
	}

	async function join() {
		const sm = i18n.m.server;
		const url = normaliseUrl(serverUrl);
		if (!url) {
			joinMessage = sm.httpsOnly;
			return;
		}
		// Asked before any await: Safari only shows the prompt within the tap.
		const permission = pushSupported() ? askPermission() : null;
		saving = true;
		joinMessage = sm.connecting;
		try {
			const config = { url, token: serverKey.trim() };
			const info = await serverApi.ping(config);
			if (info.version < SYNC_API_VERSION) {
				joinMessage = sm.syncUnsupported;
				return;
			}
			joinMessage = m.joining;
			await prepareSync();
			await syncOnce(config, async () => {
				await taskActions.reevaluateOpenTasks(await repos.settings.get());
			});
			await repos.settings.update({ server: config, sync: true });
			await enablePush(config, permission ?? undefined);
			if (!(await repos.goals.listActive()).length) {
				// Nothing to classify with yet: ask for a goal after all.
				joining = false;
				joinMessage = '';
				goalNotice = m.joinNoGoals;
				await tick();
				document.getElementById('goal-0')?.focus();
				return;
			}
			await finish();
		} catch (error) {
			joinMessage = serverErrorText(sm, error, sm.genericError);
		} finally {
			saving = false;
		}
	}

	async function start(event: SubmitEvent) {
		event.preventDefault();
		if (joining) return join();
		const titles = goals.map((goal) => goal.trim()).filter(Boolean);
		if (!goals[0].trim()) {
			missingGoal = true;
			document.getElementById('goal-0')?.focus();
			return;
		}
		saving = true;
		try {
			for (const title of titles) await repos.goals.add(title);
			await finish();
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
		<!-- Dark variant chosen in CSS, so it follows the theme set in Settings too (docs/05, "Logotipo"). -->
		<img class="logo logo-light" src="/logo.svg" alt="" width="48" height="48" />
		<img class="logo logo-dark" src="/logo-dark.svg" alt="" width="48" height="48" />
		<h1>{i18n.m.common.appName}</h1>
		<p>{m.intro}</p>
	</div>

	{#if joining}
	<div class="goals">
		<p class="help">{m.joinText}</p>
		<label class="field" for="join-url">{i18n.m.server.address}</label>
		<input id="join-url" type="url" inputmode="url" autocomplete="off" placeholder="https://qadrant.example.com" bind:value={serverUrl} required />
		<label class="field" for="join-key">{i18n.m.server.key}</label>
		<input id="join-key" type="password" autocomplete="off" bind:value={serverKey} required />
		<p class="help" role="status">{joinMessage}</p>
		<button class="add" type="button" onclick={() => showJoin(false)}>{m.joinBack}</button>
	</div>
	{:else}
	<div class="goals">
		{#if goalNotice}<p class="help" role="status">{goalNotice}</p>{/if}
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
		{#if !goalNotice}
			<button class="add join" type="button" onclick={() => showJoin(true)}>{m.join}</button>
		{/if}
	</div>
	{/if}

	<div class="ai">
		<span class="check"><input id="welcome-wifi" type="checkbox" aria-describedby="welcome-ai" bind:checked={autoDownload} /></span>
		<div class="ai-text">
			<label for="welcome-wifi"><AiDot />{m.wifi}</label>
			<p id="welcome-ai">{m.assistant}. {m.assistantText}</p>
		</div>
	</div>

	<div class="submit">
		{#if hint}<p class="hint">{hint}</p>{/if}
		<Button type="submit" size="lg" block disabled={saving}>{joining ? m.joinStart : m.start}</Button>
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
	.logo-dark {
		display: none;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .logo-light {
			display: none;
		}
		:global(:root:not([data-theme='light'])) .logo-dark {
			display: block;
		}
	}
	:global(:root[data-theme='dark']) .logo-light {
		display: none;
	}
	:global(:root[data-theme='dark']) .logo-dark {
		display: block;
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
	.field {
		font-size: 14px;
		font-weight: 600;
	}
	.join {
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 3px;
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
