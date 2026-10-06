// Writes static/licenses.txt: the license of every package shipped to the
// browser, the fonts and the model, so the footer can link to them offline.
// Generated on every dev and build run from node_modules; not in git.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHIPPED = [
	'svelte',
	'@sveltejs/kit',
	'dexie',
	'chrono-node',
	'onnxruntime-web',
	'@huggingface/transformers',
	'workbox-precaching',
	'workbox-routing',
	'workbox-window',
	'@fontsource/bricolage-grotesque',
	'@fontsource/ibm-plex-sans',
	'@fontsource/ibm-plex-mono'
];

const MODEL = `paraphrase-multilingual-MiniLM-L12-v2 (sentence-transformers), ONNX int8 conversion by Xenova
https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
License: Apache-2.0 (full text under @huggingface/transformers above)`;

const rule = '='.repeat(72);
const parts = [
	'Qadrant · by iisra-dev · https://github.com/iisra-dev',
	'',
	'Third-party software and assets / Software y recursos de terceros'
];
for (const name of SHIPPED) {
	const dir = join(root, 'node_modules', name);
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
	parts.push('', rule, `${name} ${pkg.version} · ${pkg.license}`, pkg.homepage ?? '', rule, '');
	parts.push(file ? readFileSync(join(dir, file), 'utf8').trim() : `License: ${pkg.license}`);
}
parts.push('', rule, 'Language model', rule, '', MODEL, '');
const out = join(root, 'static', 'licenses.txt');
if (!existsSync(dirname(out))) throw new Error('static/ not found');
writeFileSync(out, parts.join('\n'));
console.log(`static/licenses.txt ready: ${SHIPPED.length} packages and the model`);
