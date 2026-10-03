<script lang="ts">
	import { currentSettings } from '$lib/app/context';
	import { exportData, exportFileName, ImportError, importData } from '$lib/db/backup';
	import { repos } from '$lib/db/repositories';
	import { taskActions } from '$lib/tasks/actions';
	import { applyTheme } from '$lib/theme';
	import { Button, Sheet } from '$lib/ui';

	let { persisted }: { persisted: boolean | null } = $props();

	// Double confirmation (docs/01): a sheet, then typing a word.
	let step = $state<0 | 1 | 2>(0);
	let confirmation = $state('');

	let message = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	async function download() {
		const data = await exportData();
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = exportFileName();
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		message = `Exportadas ${data.tasks.length} tareas.`;
	}

	async function upload(file: File | undefined) {
		if (!file) return;
		try {
			const result = await importData(JSON.parse(await file.text()));
			await taskActions.reevaluateOpenTasks(currentSettings());
			message = `Importado: ${result.added} nuevos, ${result.updated} actualizados, ${result.unchanged} sin cambios.`;
		} catch (error) {
			message =
				error instanceof ImportError ? error.message : 'No se pudo leer el fichero. ¿Es una exportación de Qadrant?';
		} finally {
			if (fileInput) fileInput.value = '';
		}
	}

	async function clearAll() {
		await repos.clearAll();
		applyTheme('system');
		location.assign('/welcome');
	}
</script>

<section aria-labelledby="s-data">
	<h2 id="s-data">Datos</h2>
	<div class="actions">
		<Button variant="secondary" onclick={download}>Exportar tareas</Button>
		<Button variant="secondary" onclick={() => fileInput?.click()}>Importar tareas</Button>
		<input
			class="visually-hidden"
			type="file"
			accept="application/json,.json"
			aria-label="Fichero para importar"
			tabindex="-1"
			bind:this={fileInput}
			onchange={(e) => upload(e.currentTarget.files?.[0])}
		/>
		<Button variant="danger" onclick={() => (step = 1)}>Borrar todos los datos</Button>
	</div>
	<p class="note" role="status">{message}</p>
	{#if persisted === false}
		<p class="note">
			El navegador no garantiza que guarde tus tareas. Instala la app y exporta tus tareas de vez en cuando.
		</p>
	{/if}
</section>

<Sheet open={step > 0} label="Borrar todos los datos" onclose={() => ((step = 0), (confirmation = ''))}>
	{#if step === 1}
		<h2 class="title">¿Borrar todos los datos?</h2>
		<p class="text">Se borran tareas, objetivos, personas, correcciones y ajustes de este dispositivo. El asistente descargado se conserva.</p>
		<Button variant="danger" size="lg" block onclick={() => (step = 2)}>Continuar</Button>
		<Button variant="secondary" size="lg" block onclick={() => (step = 0)}>Cancelar</Button>
	{:else if step === 2}
		<h2 class="title">Última confirmación</h2>
		<label class="text" for="confirm-delete">Escribe BORRAR para confirmar.</label>
		<input id="confirm-delete" type="text" autocomplete="off" bind:value={confirmation} />
		<Button variant="danger" size="lg" block disabled={confirmation.trim().toUpperCase() !== 'BORRAR'} onclick={clearAll}>
			Borrar todo
		</Button>
		<Button variant="secondary" size="lg" block onclick={() => ((step = 0), (confirmation = ''))}>Cancelar</Button>
	{/if}
</Sheet>

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
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.note {
		margin: 0 var(--space-1);
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.title {
		margin: 0;
		font-size: 22px;
	}
	.text {
		margin: 0;
		font-size: 14px;
		color: var(--text-muted);
	}
	input {
		min-height: var(--touch);
		border: 1px solid var(--border-control);
		border-radius: var(--radius-control);
		padding: 0 var(--space-3);
		background: var(--surface);
	}
</style>
