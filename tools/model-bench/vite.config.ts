import { defineConfig, type Plugin } from 'vite';

// ONNX Runtime and Transformers.js reference their own .wasm; the bench loads the
// runtime from /ort/ in parts instead (Pages has a 25 MiB limit), so drop those copies.
const dropBundledWasm: Plugin = {
	name: 'drop-bundled-ort-wasm',
	generateBundle(_options, bundle) {
		for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
	}
};

// Standalone bench page (docs/06, phase 0). COOP/COEP so WASM can use threads.
const isolation = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
	root: import.meta.dirname,
	publicDir: 'public',
	build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
	plugins: [dropBundledWasm],
	worker: { format: 'es', plugins: () => [dropBundledWasm] },
	server: { headers: isolation },
	preview: { headers: isolation, port: 4180, strictPort: true }
});
