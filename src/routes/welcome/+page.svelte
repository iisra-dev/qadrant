<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { repos } from '$lib/db/repositories';
	import { GOAL_SUMMARY_MAX } from '$lib/db/defaults';
	import { AiDot, Button } from '$lib/ui';

	let goals = $state(['', '', '']);
	let wifiOnly = $state(true);
	let error = $state('');
	let saving = $state(false);
	let installHint = $state('');

	const placeholders = ['Ej.: cerrar las ventas del trimestre', 'Ej.: aprobar la oposición', 'Opcional'];

	onMount(() => {
		const standalone =
			matchMedia('(display-mode: standalone)').matches ||
			(navigator as Navigator & { standalone?: boolean }).standalone === true;
		if (standalone) return;
		const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const mobile = /Android|Mobi/.test(navigator.userAgent);
		if (ios) {
			installHint =
				'En iPhone, instálala para que iOS no borre tus tareas: Compartir y luego «Añadir a pantalla de inicio».';
		} else if (!mobile) {
			installHint = 'Puedes instalarla desde la barra de direcciones para usarla sin conexión.';
		} else {
			installHint = 'Instálala desde el menú del navegador para usarla sin conexión.';
		}
	});

	async function start(event: SubmitEvent) {
		event.preventDefault();
		const titles = goals.map((goal) => goal.trim()).filter(Boolean);
		if (!goals[0].trim()) {
			error = 'Escribe al menos un objetivo.';
			document.getElementById('goal-0')?.focus();
			return;
		}
		saving = true;
		try {
			for (const title of titles) await repos.goals.add(title);
			const settings = await repos.settings.get();
			await repos.settings.update({ onboardingDone: true, model: { ...settings.model, wifiOnly } });
			// Ask the browser not to evict our data (docs/02, "Persistencia").
			try {
				await navigator.storage?.persist?.();
			} catch {
				// Settings > Datos tells the user if it was denied.
			}
			await goto('/', { replaceState: true });
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Bienvenida · Cuadrante</title>
</svelte:head>

<form class="welcome" onsubmit={start} novalidate>
	<div class="intro">
		<img src="/logo.svg" alt="" width="48" height="48" />
		<h1>Cuadrante</h1>
		<p>Dices lo que tienes pendiente y la app lo coloca: hacer, programar, delegar o eliminar.</p>
	</div>

	<section aria-labelledby="welcome-goals" class="goals">
		<h2 id="welcome-goals">¿Qué es importante para ti ahora?</h2>
		{#each goals as _, index (index)}
			<input
				id={`goal-${index}`}
				type="text"
				aria-label={`Objetivo ${index + 1}`}
				placeholder={placeholders[index]}
				maxlength={GOAL_SUMMARY_MAX}
				required={index === 0}
				aria-invalid={index === 0 && Boolean(error)}
				aria-describedby={index === 0 && error ? 'goal-error' : undefined}
				bind:value={goals[index]}
				oninput={() => (error = '')}
			/>
		{/each}
		{#if error}<p id="goal-error" class="error" role="alert">{error}</p>{/if}
	</section>

	<section aria-labelledby="welcome-ai" class="ai">
		<h2 id="welcome-ai"><AiDot />Asistente en tu dispositivo</h2>
		<p>Se descarga una vez y funciona sin conexión. Tus tareas no salen del dispositivo.</p>
		<div class="check">
			<input id="welcome-wifi" type="checkbox" bind:checked={wifiOnly} />
			<label for="welcome-wifi">Descargar cuando haya wifi</label>
		</div>
	</section>

	{#if installHint}<p class="hint">{installHint}</p>{/if}

	<div class="submit">
		<Button type="submit" size="lg" block disabled={saving}>Empezar</Button>
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
