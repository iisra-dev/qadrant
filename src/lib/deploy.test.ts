import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Cloudflare Pages reads static/_headers; the local preview server ignores it,
// so its contents are checked here (docs/02-arquitectura.md, "Cabeceras").
describe('static/_headers', () => {
	const headers = readFileSync('static/_headers', 'utf8');

	it('enables cross-origin isolation for multithreaded WASM', () => {
		expect(headers).toContain('Cross-Origin-Opener-Policy: same-origin');
		expect(headers).toContain('Cross-Origin-Embedder-Policy: require-corp');
	});

	it('forbids framing', () => {
		expect(headers).toContain("frame-ancestors 'none'");
	});

	it('never caches the service worker', () => {
		expect(headers).toMatch(/\/service-worker\.js\n\s+Cache-Control: no-cache/);
	});
});
