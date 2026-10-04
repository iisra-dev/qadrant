// Splits the engine model into parts of at most 25 MiB (Cloudflare Pages limit)
// and writes manifest.json with version, size and SHA-256 per part (docs/02).
// Usage: node scripts/chunk-model.mjs --model tools/embed-eval/model --out <dir>
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export const PART_BYTES = 25 * 1024 * 1024;
const TOKENIZER_FILES = ['tokenizer.json', 'tokenizer_config.json', 'config.json', 'special_tokens_map.json'];

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function chunkModel(modelDir, outDir) {
	const info = JSON.parse(readFileSync(join(modelDir, 'model-info.json'), 'utf8'));
	const onnx = readFileSync(join(modelDir, 'onnx', 'model_quantized.onnx'));
	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(join(outDir, 'parts'), { recursive: true });

	const parts = [];
	for (let offset = 0, i = 0; offset < onnx.length; offset += PART_BYTES, i++) {
		const data = onnx.subarray(offset, Math.min(offset + PART_BYTES, onnx.length));
		const file = `parts/model.${String(i).padStart(2, '0')}.bin`;
		writeFileSync(join(outDir, file), data);
		parts.push({ file, bytes: data.length, sha256: sha256(data) });
	}
	const tokenizer = TOKENIZER_FILES.map((name) => {
		copyFileSync(join(modelDir, name), join(outDir, name));
		const data = readFileSync(join(modelDir, name));
		return { file: name, bytes: data.length, sha256: sha256(data) };
	});
	const manifest = {
		version: info.revision,
		model: info.repo,
		bytes: onnx.length,
		sha256: sha256(onnx),
		parts,
		tokenizer
	};
	writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
	return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const { values } = parseArgs({ options: { model: { type: 'string' }, out: { type: 'string' } } });
	if (!values.model || !values.out) {
		console.error('Usage: node scripts/chunk-model.mjs --model <dir> --out <dir>');
		process.exit(1);
	}
	const manifest = chunkModel(values.model, values.out);
	console.log(`${manifest.parts.length} parts, ${(manifest.bytes / 2 ** 20).toFixed(1)} MiB, version ${manifest.version}`);
}
