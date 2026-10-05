// Fills public/ for the bench: chunked model + tokenizer, ONNX Runtime wasm files,
// the phase 0 reference and the Pages headers. Everything served from our origin.
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkModel, PART_BYTES } from '../../scripts/chunk-model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pub = join(here, 'public');
rmSync(pub, { recursive: true, force: true });
mkdirSync(join(pub, 'ort'), { recursive: true });

const manifest = chunkModel(join(root, 'tools', 'embed-eval', 'model'), join(pub, 'model'));
// ONNX Runtime with WebGPU uses the asyncify build. Its .wasm (≈ 27 MB) is over the
// 25 MiB Pages limit, so it goes in parts too and the worker passes it as wasmBinary.
const ortDist = join(root, 'node_modules', 'onnxruntime-web', 'dist');
copyFileSync(join(ortDist, 'ort-wasm-simd-threaded.asyncify.mjs'), join(pub, 'ort', 'ort-wasm-simd-threaded.asyncify.mjs'));
const wasm = readFileSync(join(ortDist, 'ort-wasm-simd-threaded.asyncify.wasm'));
const wasmParts = [];
for (let offset = 0, i = 0; offset < wasm.length; offset += PART_BYTES, i++) {
	const file = `ort-wasm-simd-threaded.asyncify.wasm.${i}`;
	writeFileSync(join(pub, 'ort', file), wasm.subarray(offset, Math.min(offset + PART_BYTES, wasm.length)));
	wasmParts.push(file);
}
writeFileSync(join(pub, 'ort', 'wasm-parts.json'), JSON.stringify({ bytes: wasm.length, parts: wasmParts }));
copyFileSync(join(root, 'tools', 'embed-eval', 'reference.json'), join(pub, 'reference.json'));
copyFileSync(join(root, 'tools', 'embed-eval', 'calibration.json'), join(pub, 'calibration.json'));
writeFileSync(
	join(pub, '_headers'),
	`/*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n  X-Content-Type-Options: nosniff\n\n/model/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/ort/*\n  Cache-Control: public, max-age=86400\n`
);
console.log(`public/ ready: model ${manifest.version.slice(0, 7)} in ${manifest.parts.length} parts`);
