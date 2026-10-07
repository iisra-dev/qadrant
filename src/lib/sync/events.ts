/**
 * Reads the server's change stream (SSE) and calls `onVersion` with each
 * version it announces. Read with fetch because EventSource cannot send the
 * Authorization header (docs/02). Resolves when the stream ends.
 */
export async function readVersions(body: ReadableStream<Uint8Array>, onVersion: (version: number) => void): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) return;
		buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
		let end: number;
		while ((end = buffer.indexOf('\n\n')) !== -1) {
			const block = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			for (const line of block.split('\n')) {
				if (!line.startsWith('data:')) continue;
				try {
					const version = Number(JSON.parse(line.slice(5).trim())?.version);
					if (Number.isFinite(version)) onVersion(version);
				} catch {
					// Not ours: skip it.
				}
			}
		}
	}
}
