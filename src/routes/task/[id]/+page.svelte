<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import TaskDetail from '$lib/task/TaskDetail.svelte';

	function back() {
		if (history.length > 1) history.back();
		else void goto('/');
	}
</script>

<svelte:head>
	<title>Tarea · Qadrant</title>
</svelte:head>

<TaskDetail id={page.params.id ?? ''} onclose={back} />
