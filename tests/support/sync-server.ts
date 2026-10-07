// A fake own server over HTTPS for the e2e tests, shared by several browser
// contexts (several devices). Same rules as server/ thanks to MemorySync, with
// a real SSE stream. The app only talks to https:, so it uses a throwaway
// self-signed certificate; contexts need ignoreHTTPSErrors.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemorySync } from './memory-sync';

export const SYNC_KEY = 'clave-de-sincronizacion';

export interface FakeSyncServer {
	url: string;
	state: MemorySync;
	/** Open change streams, to check that only one tab per device listens. */
	streams: () => number;
	/** Milliseconds every pull waits before answering, to see a slow sync. */
	slowPull: number;
	close: () => Promise<void>;
}

function certificate(): { key: Buffer; cert: Buffer } {
	const dir = mkdtempSync(join(tmpdir(), 'qadrant-cert-'));
	try {
		execFileSync('openssl', [
			'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
			'-subj', '/CN=localhost', '-days', '1',
			'-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')
		], { stdio: 'ignore' });
		return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE'
};

function json(res: ServerResponse, body: unknown, status = 200) {
	res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
	res.end(JSON.stringify(body));
}

export async function startSyncServer(options: { apiVersion?: number } = {}): Promise<FakeSyncServer> {
	const state = new MemorySync();
	if (options.apiVersion) state.apiVersion = options.apiVersion;
	const open = new Set<ServerResponse>();
	const fake: FakeSyncServer = {
		url: '',
		state,
		streams: () => open.size,
		slowPull: 0,
		close: () =>
			new Promise((resolve) => {
				for (const res of open) res.destroy();
				server.close(() => resolve());
			})
	};

	const server: Server = createServer(certificate(), async (req, res) => {
		if (req.method === 'OPTIONS') {
			res.writeHead(204, CORS);
			return res.end();
		}
		if (req.headers.authorization !== `Bearer ${SYNC_KEY}`) return json(res, { error: 'unauthorized' }, 401);
		const url = new URL(req.url ?? '/', 'https://localhost');
		const path = url.pathname.replace(/^\/api\/qadrant/, '');
		let body = '';
		for await (const chunk of req) body += chunk;

		if (path === '/ping') {
			return json(res, { ok: true, version: state.apiVersion, ...(state.apiVersion >= 2 && { syncId: state.syncId }) });
		}
		if (path === '/calendar' && req.method === 'GET') return json(res, { connected: false, events: [] });
		if (path === '/reminders' && req.method === 'PUT') {
			const version = url.searchParams.get('version');
			const accepted = state.putReminders(JSON.parse(body), version === null ? undefined : Number(version));
			return json(res, { count: 0, ignored: !accepted });
		}
		if (state.apiVersion >= 2) {
			if (path === '/sync/push' && req.method === 'POST') return json(res, state.push(JSON.parse(body)));
			if (path === '/sync/pull') {
				if (fake.slowPull) await new Promise((resolve) => setTimeout(resolve, fake.slowPull));
				return json(res, state.pull(Number(url.searchParams.get('since') ?? 0)));
			}
			if (path === '/sync/events') {
				res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
				const send = (version: number) => res.write(`event: version\ndata: ${JSON.stringify({ version })}\n\n`);
				send(state.version);
				const stop = state.onChange(send);
				const beat = setInterval(() => res.write(': ping\n\n'), 5000);
				open.add(res);
				req.on('close', () => {
					stop();
					clearInterval(beat);
					open.delete(res);
				});
				return;
			}
		}
		if (path === '/subscriptions' || path === '/vapid') return json(res, { error: 'no push here' }, 404);
		return json(res, { error: 'not found' }, 404);
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	fake.url = `https://127.0.0.1:${port}`;
	return fake;
}
