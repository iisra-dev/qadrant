// Downloads the chunked model (verified with the manifest, as the app will),
// then runs each mode in its own worker: WebGPU, WASM 1 thread, WASM threads.
import type { BenchRequest, BenchResult, Mode } from './bench.worker';

interface Part {
	file: string;
	bytes: number;
	sha256: string;
}
interface Manifest {
	version: string;
	bytes: number;
	parts: Part[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
const progress = $<HTMLProgressElement>('progress');
const rows = $('results');
const copy = $<HTMLTextAreaElement>('copy');

const device = [
	navigator.userAgent,
	`núcleos: ${navigator.hardwareConcurrency ?? '?'}`,
	`aislamiento entre orígenes: ${crossOriginIsolated ? 'sí' : 'no'}`,
	`WebGPU: ${'gpu' in navigator ? 'sí' : 'no'}`
];
$('device').textContent = device.join(' · ');

async function sha256(data: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function downloadModel(): Promise<ArrayBuffer> {
	const manifest: Manifest = await (await fetch('/model/manifest.json')).json();
	const model = new Uint8Array(manifest.bytes);
	let offset = 0;
	progress.hidden = false;
	for (const part of manifest.parts) {
		status.textContent = `Descargando el modelo: ${part.file}`;
		const data = await (await fetch(`/model/${part.file}`)).arrayBuffer();
		if (data.byteLength !== part.bytes || (await sha256(data)) !== part.sha256) {
			throw new Error(`El fragmento ${part.file} no coincide con el manifiesto`);
		}
		model.set(new Uint8Array(data), offset);
		offset += data.byteLength;
		progress.value = offset / manifest.bytes;
	}
	progress.hidden = true;
	return model.buffer;
}

function runMode(
	mode: Mode,
	model: ArrayBuffer,
	reference: BenchRequest['reference'],
	calibration: BenchRequest['calibration']
): Promise<BenchResult> {
	return new Promise((resolve) => {
		const worker = new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<BenchResult>) => {
			worker.terminate();
			resolve(event.data);
		};
		worker.onerror = (event) => {
			worker.terminate();
			resolve({ mode, ok: false, error: event.message || 'error en el worker' });
		};
		const request: BenchRequest = { mode, model: model.slice(0), reference, calibration };
		worker.postMessage(request, [request.model]);
	});
}

const LABELS: Record<Mode, string> = { webgpu: 'WebGPU', wasm1: 'WASM, 1 hilo', wasmN: 'WASM, varios hilos' };

$('run').addEventListener('click', async () => {
	const button = $<HTMLButtonElement>('run');
	button.disabled = true;
	rows.textContent = '';
	try {
		const reference = await (await fetch('/reference.json')).json();
		const calibration = await (await fetch('/calibration.json')).json();
		const model = await downloadModel();
		const lines = [`Qadrant · prueba del motor · ${new Date().toISOString()}`, ...device];
		for (const mode of ['webgpu', 'wasm1', 'wasmN'] as Mode[]) {
			status.textContent = `Midiendo ${LABELS[mode]}…`;
			const r = await runMode(mode, model, reference, calibration);
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
			lines.push(
				r.ok
					? `${LABELS[mode]}: mediana ${r.median.toFixed(0)} ms, p95 ${r.p95.toFixed(0)} ms, carga ${(r.loadMs / 1000).toFixed(1)} s, paridad ${r.maxDiff.toFixed(3)} (decisiones distintas: ${r.flips}/${r.total})${r.threads ? `, ${r.threads} hilos` : ''}`
					: `${LABELS[mode]}: no disponible (${r.error})`
			);
		}
		copy.value = lines.join('\n');
		status.textContent = 'Terminado. Copia el resultado de abajo.';
	} catch (error) {
		status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
	} finally {
		button.disabled = false;
	}
});
