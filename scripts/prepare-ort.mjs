// Copies ONNX Runtime Web's runtime to static/ort/ so the app serves it from our
// origin (CLAUDE.md, "Local-first"). Its .wasm (≈ 27 MB) is over the 25 MiB
// Cloudflare Pages limit, so it goes in parts listed in wasm-parts.json with their
// SHA-256; the engine worker joins them and keeps a copy in OPFS for offline use.
// Generated on every dev and build run from node_modules, so it always matches
// the bundled onnxruntime-web; not in git.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PART_BYTES } from './chunk-model.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const out = join(root, 'static', 'ort');
const BASE = 'ort-wasm-simd-threaded.asyncify';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(dist, `${BASE}.mjs`), join(out, `${BASE}.mjs`));
const wasm = readFileSync(join(dist, `${BASE}.wasm`));
const parts = [];
for (let offset = 0, i = 0; offset < wasm.length; offset += PART_BYTES, i++) {
	const data = wasm.subarray(offset, Math.min(offset + PART_BYTES, wasm.length));
	const file = `${BASE}.wasm.${i}`;
	writeFileSync(join(out, file), data);
	parts.push({ file, bytes: data.length, sha256: sha256(data) });
}
const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8'));
writeFileSync(join(out, 'wasm-parts.json'), JSON.stringify({ version, bytes: wasm.length, sha256: sha256(wasm), parts }, null, 2));
console.log(`static/ort ready: onnxruntime-web ${version}, ${parts.length} parts`);
