<script lang="ts">
	import { currentSettings } from '$lib/app/context';
	import { exportData, exportFileName, ImportError, importData } from '$lib/db/backup';
	import { repos } from '$lib/db/repositories';
	import { i18n } from '$lib/i18n/index.svelte';
	import { taskActions } from '$lib/tasks/actions';
	import { applyTheme } from '$lib/theme';
	import { Button, SettingsGroup, Sheet } from '$lib/ui';

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
		message = i18n.m.data.exported(data.tasks.length);
	}

	async function upload(file: File | undefined) {
		if (!file) return;
		try {
			const result = await importData(JSON.parse(await file.text()));
			await taskActions.reevaluateOpenTasks(currentSettings());
			message = i18n.m.data.imported(result.added, result.updated, result.unchanged);
		} catch (error) {
			message = error instanceof ImportError ? i18n.m.data[error.code] : i18n.m.data.unreadable;
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

<SettingsGroup title={i18n.m.data.title} summary={i18n.m.settings.dataSummary}>
	<div class="actions">
		<Button variant="secondary" onclick={download}>{i18n.m.data.export}</Button>
		<Button variant="secondary" onclick={() => fileInput?.click()}>{i18n.m.data.import}</Button>
		<input
			class="visually-hidden"
			type="file"
			accept="application/json,.json"
			aria-label={i18n.m.data.importFile}
			tabindex="-1"
			bind:this={fileInput}
			onchange={(e) => upload(e.currentTarget.files?.[0])}
		/>
		<Button variant="danger" onclick={() => (step = 1)}>{i18n.m.data.clear}</Button>
	</div>
	<p class="note" role="status">{message}</p>
	{#if persisted === false}
		<p class="note">{i18n.m.data.notPersisted}</p>
	{/if}
</SettingsGroup>

<Sheet open={step > 0} label={i18n.m.data.clear} onclose={() => ((step = 0), (confirmation = ''))}>
	{#if step === 1}
		<h2 class="title">{i18n.m.data.clearAsk}</h2>
		<p class="text">{i18n.m.data.clearText}</p>
		<Button variant="danger" size="lg" block onclick={() => (step = 2)}>{i18n.m.data.continue}</Button>
		<Button variant="secondary" size="lg" block onclick={() => (step = 0)}>{i18n.m.common.cancel}</Button>
	{:else if step === 2}
		<h2 class="title">{i18n.m.data.lastConfirm}</h2>
		<label class="text" for="confirm-delete">{i18n.m.data.typeToConfirm(i18n.m.data.typeWord)}</label>
		<input id="confirm-delete" type="text" autocomplete="off" bind:value={confirmation} />
		<Button variant="danger" size="lg" block disabled={confirmation.trim().toUpperCase() !== i18n.m.data.typeWord} onclick={clearAll}>
			{i18n.m.data.clearAll}
		</Button>
		<Button variant="secondary" size="lg" block onclick={() => ((step = 0), (confirmation = ''))}>{i18n.m.common.cancel}</Button>
	{/if}
</Sheet>

<style>
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
