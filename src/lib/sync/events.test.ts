import { describe, expect, it } from 'vitest';
import { readVersions } from './events';

function stream(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		}
	});
}

describe('readVersions', () => {
	it('reads version events split anywhere and ignores heartbeats', async () => {
		const seen: number[] = [];
		await readVersions(
			stream(['event: version\nda', 'ta: {"version":3}\n\n: ping\n\n', 'event: version\r\ndata: {"version":4}\r\n\r\n', 'data: nonsense\n\n']),
			(v) => seen.push(v)
		);
		expect(seen).toEqual([3, 4]);
	});
});
