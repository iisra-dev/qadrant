<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/index.svelte';
	import TaskDetail from '$lib/task/TaskDetail.svelte';

	function back() {
		if (history.length > 1) history.back();
		else void goto('/');
	}
</script>

<svelte:head>
	<title>{i18n.m.common.pageTitle(i18n.m.detail.task)}</title>
</svelte:head>

<TaskDetail id={page.params.id ?? ''} onclose={back} />
