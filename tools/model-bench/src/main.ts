// Runs each mode in its own worker: WebGPU, WASM 1 thread, WASM threads. Each
// worker downloads (from the HTTP cache after the first time) and verifies the
// chunked model itself, so the page never holds a copy.
//
// Results are saved as soon as each mode ends. If the phone runs out of memory
// and reloads the tab, the page shows what was measured, marks the mode that was
// running as closed and can go on with the rest.
import type { BenchMessage, BenchRequest, BenchResult, Mode } from './bench.worker';

const MODES: Mode[] = ['webgpu', 'wasm1', 'wasmN'];
const LABELS: Record<Mode, string> = { webgpu: 'WebGPU', wasm1: 'WASM, 1 hilo', wasmN: 'WASM, varios hilos' };
const STORAGE_KEY = 'qadrant-bench';
const CLOSED = 'la página se cerró mientras medía (probablemente por memoria)';

interface Saved {
	startedAt: string;
	results: Partial<Record<Mode, BenchResult>>;
	running?: Mode;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const progress = $<HTMLProgressElement>('progress');
const rows = $('results');
const copy = $<HTMLTextAreaElement>('copy');
const run = $<HTMLButtonElement>('run');
const reset = $<HTMLButtonElement>('reset');

const device = [
	navigator.userAgent,
	`núcleos: ${navigator.hardwareConcurrency ?? '?'}`,
	`aislamiento entre orígenes: ${crossOriginIsolated ? 'sí' : 'no'}`,
	`WebGPU: ${'gpu' in navigator ? 'sí' : 'no'}`
];
$('device').textContent = device.join(' · ');

function load(): Saved | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Saved) : null;
	} catch {
		return null;
	}
}

function store(saved: Saved | null) {
	try {
		if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Without storage the results only live on screen.
	}
}

function line(mode: Mode, r: BenchResult): string {
	return r.ok
		? `${LABELS[mode]}: mediana ${r.median.toFixed(0)} ms, p95 ${r.p95.toFixed(0)} ms, carga ${(r.loadMs / 1000).toFixed(1)} s, paridad ${r.maxDiff.toFixed(3)} (decisiones distintas: ${r.flips}/${r.total})${r.threads ? `, ${r.threads} hilos` : ''}`
		: `${LABELS[mode]}: no disponible (${r.error})`;
}

function render(saved: Saved | null) {
	rows.textContent = '';
	if (!saved) {
		copy.value = '';
		return;
	}
	for (const mode of MODES) {
		const r = saved.results[mode];
		if (!r) continue;
		const row = document.createElement('tr');
		const cells = r.ok
			? [LABELS[mode], `${r.median.toFixed(0)} ms`, `${r.p95.toFixed(0)} ms`, `${(r.loadMs / 1000).toFixed(1)} s`, `${r.maxDiff.toFixed(3)} · ${r.flips}/${r.total}`]
			: [LABELS[mode], '—', '—', '—', r.error];
		for (const text of cells) {
			const td = document.createElement('td');
			td.textContent = text;
			row.append(td);
		}
		rows.append(row);
	}
	const lines = [`Qadrant · prueba del motor · ${saved.startedAt}`, ...device];
	for (const mode of MODES) {
		const r = saved.results[mode];
		if (r) lines.push(line(mode, r));
	}
	copy.value = lines.join('\n');
}

function runMode(mode: Mode, reference: BenchRequest['reference'], calibration: BenchRequest['calibration']): Promise<BenchResult> {
	return new Promise((resolve) => {
		const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
		progress.hidden = false;
		progress.value = 0;
		worker.onmessage = (event: MessageEvent<BenchMessage>) => {
			if (event.data.type === 'progress') {
				progress.value = event.data.value;
				if (event.data.value >= 1) progress.hidden = true;
				return;
			}
			worker.terminate();
			progress.hidden = true;
			resolve(event.data.result);
		};
		worker.onerror = (event) => {
			worker.terminate();
			progress.hidden = true;
			resolve({ mode, ok: false, error: event.message || 'error en el worker' });
		};
		worker.postMessage({ mode, reference, calibration } satisfies BenchRequest);
	});
}

function pending(saved: Saved | null): Mode[] {
	return MODES.filter((mode) => !saved?.results[mode]);
}

function updateButtons(saved: Saved | null) {
	const left = pending(saved);
	run.textContent = saved && left.length && left.length < MODES.length ? 'Continuar' : 'Empezar';
	run.hidden = Boolean(saved) && left.length === 0;
	reset.hidden = !saved;
}

async function start() {
	run.disabled = true;
	reset.disabled = true;
	let saved = load() ?? { startedAt: new Date().toISOString(), results: {} };
	try {
		const reference = await (await fetch('/reference.json')).json();
		const calibration = await (await fetch('/calibration.json')).json();
		for (const mode of pending(saved)) {
			status.textContent = `Midiendo ${LABELS[mode]} (descarga y verifica el modelo, después mide)…`;
			store({ ...saved, running: mode });
			const result = await runMode(mode, reference, calibration);
			saved = { ...saved, results: { ...saved.results, [mode]: result } };
			delete saved.running;
			store(saved);
			render(saved);
		}
		status.textContent = 'Terminado. Copia el resultado de abajo.';
	} catch (error) {
		status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
	} finally {
		run.disabled = false;
		reset.disabled = false;
		updateButtons(load());
	}
}

// Back after a reload: a mode that was running did not finish.
const saved = load();
if (saved?.running) {
	saved.results[saved.running] = { mode: saved.running, ok: false, error: CLOSED };
	delete saved.running;
	store(saved);
}
render(saved);
updateButtons(saved);
if (saved) {
	status.textContent = pending(saved).length
		? 'Se recuperaron los resultados anteriores. Pulsa «Continuar» para medir lo que falta.'
		: 'Terminado. Copia el resultado de abajo.';
}

run.addEventListener('click', start);
reset.addEventListener('click', () => {
	store(null);
	render(null);
	updateButtons(null);
	status.textContent = '';
});
