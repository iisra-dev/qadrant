<script lang="ts">
	import { repos } from '$lib/db/repositories';
	import type { Settings } from '$lib/domain/types';
	import { normaliseUrl, ServerError, serverApi } from '$lib/ownserver/client';
	import { disablePush, enablePush } from '$lib/ownserver/push';
	import { Button } from '$lib/ui';

	let { server }: { server: Settings['server'] } = $props();

	let url = $state('');
	let token = $state('');
	let message = $state('');
	let busy = $state(false);

	const PUSH_MESSAGES = {
		enabled: 'Conectado. Recibirás avisos en este dispositivo.',
		denied: 'Conectado, pero sin permiso para avisos. Puedes darlo en los ajustes del navegador.',
		unsupported: 'Conectado. Este navegador no admite avisos; en iPhone, instala la app primero.',
		failed: 'Conectado, pero no se pudieron activar los avisos en este navegador.'
	} as const;

	async function connect(event: SubmitEvent) {
		event.preventDefault();
		const clean = normaliseUrl(url);
		if (!clean) {
			message = 'Escribe una dirección que empiece por https://';
			return;
		}
		busy = true;
		message = 'Conectando…';
		try {
			const config = { url: clean, token: token.trim() };
			await serverApi.ping(config);
			await repos.settings.update({ server: config });
			message = PUSH_MESSAGES[await enablePush(config)];
			url = token = '';
		} catch (error) {
			message = error instanceof ServerError ? error.message : 'No se pudo conectar.';
		} finally {
			busy = false;
		}
	}

	async function disconnect() {
		if (!server) return;
		busy = true;
		try {
			await disablePush(server).catch(() => {});
			await serverApi.putReminders(server, []).catch(() => {});
			await repos.settings.update({ server: undefined });
			message = 'Servidor quitado. Los avisos dejan de llegar a este dispositivo.';
		} finally {
			busy = false;
		}
	}
</script>

<section aria-labelledby="s-server">
	<h2 id="s-server">Servidor propio (opcional)</h2>
	<div class="card">
		{#if server}
			<div class="row">
				<span class="url">{server.url}</span>
				<Button variant="text" onclick={disconnect} disabled={busy}>Quitar</Button>
			</div>
		{:else}
			<form onsubmit={connect}>
				<label for="server-url">Dirección</label>
				<input id="server-url" type="url" inputmode="url" autocomplete="off" placeholder="https://cuadrante.tudominio.es" bind:value={url} required />
				<label for="server-token">Clave de acceso</label>
				<input id="server-token" type="password" autocomplete="off" bind:value={token} required />
				<Button type="submit" variant="secondary" disabled={busy}>Conectar</Button>
			</form>
		{/if}
	</div>
	<p class="note" role="status">{message}</p>
	<p class="note">
		Tus tareas no salen del dispositivo. El servidor solo recibe, para avisarte, el título y la fecha de las tareas con aviso; más adelante
		servirá también para sincronizar y para clasificar cuando el asistente no esté en el dispositivo.
	</p>
</section>

<style>
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
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		padding: var(--space-3) var(--space-4);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: 14px;
	}
	.url {
		font-family: var(--font-mono);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: stretch;
		font-size: 14px;
	}
	input {
		min-height: var(--touch);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		padding: 0 var(--space-3);
		background: var(--surface);
		font-size: 14px;
	}
	.note {
		margin: 0 var(--space-1);
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.note:empty {
		display: none;
	}
</style>
