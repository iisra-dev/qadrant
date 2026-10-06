/// <reference lib="webworker" />
// Model files in OPFS, written from the engine worker with createSyncAccessHandle
// (docs/02). Each part is verified with its SHA-256 before it is kept, and the
// list of verified parts is saved as it grows, so a download interrupted by a
// closed tab or a lost connection resumes where it stopped.
import { MODEL_BASE, RUNTIME_BASE, type FilePart, type ModelManifest, type RuntimeManifest } from './manifest';

const ROOT = 'qadrant-engine';
const DONE = 'done.json';
const COMPLETE = 'complete.json';

const modelDir = (version: string) => `model-${version}`;
const runtimeDir = (version: string) => `runtime-${version}`;
/** OPFS names cannot hold a slash. */
const local = (file: string) => file.replaceAll('/', '_');

async function root(): Promise<FileSystemDirectoryHandle> {
	const storage = await navigator.storage.getDirectory();
	return storage.getDirectoryHandle(ROOT, { create: true });
}

async function folder(name: string): Promise<FileSystemDirectoryHandle> {
	return (await root()).getDirectoryHandle(name, { create: true });
}

async function sha256(data: BufferSource): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function write(dir: FileSystemDirectoryHandle, name: string, data: Uint8Array): Promise<void> {
	const handle = await dir.getFileHandle(name, { create: true });
	if ('createSyncAccessHandle' in handle) {
		const access = await handle.createSyncAccessHandle();
		try {
			access.truncate(0);
			access.write(data, { at: 0 });
			access.flush();
		} finally {
			access.close();
		}
		return;
	}
	const writable = await (handle as FileSystemFileHandle).createWritable();
	await writable.write(data as Uint8Array<ArrayBuffer>);
	await writable.close();
}

async function readBytes(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array> {
	const file = await (await dir.getFileHandle(name)).getFile();
	return new Uint8Array(await file.arrayBuffer());
}

async function readJson<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
	try {
		return JSON.parse(new TextDecoder().decode(await readBytes(dir, name))) as T;
	} catch {
		return null;
	}
}

async function writeJson(dir: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
	await write(dir, name, new TextEncoder().encode(JSON.stringify(value)));
}

export async function fetchJson<T>(url: string): Promise<T | null> {
	try {
		const response = await fetch(url, { cache: 'no-cache' });
		if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

/** The model and runtime this device has complete, if any. */
export async function storedManifests(): Promise<{ model: ModelManifest; runtime: RuntimeManifest } | null> {
	try {
		const dir = await root();
		for await (const [name, entry] of dir.entries()) {
			if (entry.kind !== 'directory' || !name.startsWith('model-')) continue;
			const complete = await readJson<{ model: ModelManifest; runtime: RuntimeManifest }>(entry as FileSystemDirectoryHandle, COMPLETE);
			if (complete) return complete;
		}
	} catch {
		// No OPFS: nothing stored.
	}
	return null;
}

/** Reads a body while reporting the bytes received, so a 25 MiB part does not look stuck. */
async function readWithProgress(
	response: Response,
	expected: number,
	onBytes: (received: number) => void
): Promise<Uint8Array<ArrayBuffer>> {
	if (!response.body) return new Uint8Array(await response.arrayBuffer());
	const reader = response.body.getReader();
	const out = new Uint8Array(expected);
	let received = 0;
	let reported = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (received + value.byteLength > expected) throw new Error('part larger than the manifest says');
		out.set(value, received);
		received += value.byteLength;
		if (received - reported >= 1_000_000) {
			reported = received;
			onBytes(received);
		}
	}
	return received === expected ? out : out.subarray(0, received);
}

/** Downloads what is missing; resumes from the verified parts already stored. */
export async function download(
	model: ModelManifest,
	runtime: RuntimeManifest,
	onProgress: (bytes: number) => void
): Promise<void> {
	const jobs: { dir: string; base: string; part: FilePart }[] = [
		...model.parts.map((part) => ({ dir: modelDir(model.version), base: MODEL_BASE, part })),
		...model.tokenizer.map((part) => ({ dir: modelDir(model.version), base: MODEL_BASE, part })),
		...runtime.parts.map((part) => ({ dir: runtimeDir(runtime.version), base: RUNTIME_BASE, part }))
	];
	const doneByDir = new Map<string, Set<string>>();
	let bytes = 0;
	for (const job of jobs) {
		const dir = await folder(job.dir);
		if (!doneByDir.has(job.dir)) doneByDir.set(job.dir, new Set((await readJson<string[]>(dir, DONE)) ?? []));
		const done = doneByDir.get(job.dir)!;
		if (!done.has(job.part.sha256)) {
			const response = await fetch(job.base + job.part.file);
			if (!response.ok) throw new Error(`download ${job.part.file}: ${response.status}`);
			const data = await readWithProgress(response, job.part.bytes, (received) => onProgress(bytes + received));
			if (data.byteLength !== job.part.bytes || (await sha256(data)) !== job.part.sha256) {
				throw new Error(`${job.part.file} does not match the manifest`);
			}
			await write(dir, local(job.part.file), data);
			done.add(job.part.sha256);
			await writeJson(dir, DONE, [...done]);
		}
		bytes += job.part.bytes;
		onProgress(bytes);
	}
	await writeJson(await folder(modelDir(model.version)), COMPLETE, { model, runtime });
	await removeOthers(model.version, runtime.version);
}

/** Old versions go once the new one is complete. */
async function removeOthers(modelVersion: string, runtimeVersion: string): Promise<void> {
	const dir = await root();
	const keep = new Set([modelDir(modelVersion), runtimeDir(runtimeVersion)]);
	const names: string[] = [];
	for await (const name of dir.keys()) if (!keep.has(name)) names.push(name);
	for (const name of names) await dir.removeEntry(name, { recursive: true });
}

async function joined(dirName: string, parts: FilePart[], total: number): Promise<Uint8Array> {
	const dir = await folder(dirName);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		const data = await readBytes(dir, local(part.file));
		out.set(data, offset);
		offset += data.byteLength;
	}
	return out;
}

export function readModel(model: ModelManifest): Promise<Uint8Array> {
	return joined(modelDir(model.version), model.parts, model.bytes);
}

export function readRuntime(runtime: RuntimeManifest): Promise<Uint8Array> {
	return joined(runtimeDir(runtime.version), runtime.parts, runtime.bytes);
}

export async function readModelText(model: ModelManifest, file: string): Promise<string> {
	return new TextDecoder().decode(await readBytes(await folder(modelDir(model.version)), local(file)));
}

export async function removeAll(): Promise<void> {
	try {
		const storage = await navigator.storage.getDirectory();
		await storage.removeEntry(ROOT, { recursive: true });
	} catch {
		// Nothing stored.
	}
}
