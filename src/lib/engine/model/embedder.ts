// Sentence embeddings with the ONNX session and the model's own tokenizer
// (docs/03, step 6): mean of the token vectors, unit length. Shared by the
// worker and the parity test, so both run exactly the same code.
import type * as ort from 'onnxruntime-web';
import { meanPool } from './vector';

export const MAX_TOKENS = 128;

interface Encoded {
	data: BigInt64Array;
	dims: number[];
}

/** What the code needs from a Transformers.js tokenizer. */
export type TokenizerLike = (
	text: string,
	options: { truncation: boolean; max_length: number }
) => { input_ids: unknown; attention_mask: unknown };

export type Embed = (text: string) => Promise<Float32Array>;

export function createEmbedder(
	session: Pick<ort.InferenceSession, 'run'>,
	tokenizer: TokenizerLike,
	Tensor: typeof ort.Tensor
): Embed {
	// One run at a time: training and a capture may ask together, and a session
	// does not take overlapping runs.
	let queue: Promise<unknown> = Promise.resolve();
	const run = (feeds: Parameters<typeof session.run>[0]) => {
		const next = queue.then(() => session.run(feeds));
		queue = next.catch(() => undefined);
		return next;
	};
	return async (text) => {
		const encoded = tokenizer(text, { truncation: true, max_length: MAX_TOKENS });
		const ids = encoded.input_ids as Encoded;
		const mask = encoded.attention_mask as Encoded;
		const feeds = {
			input_ids: new Tensor('int64', ids.data, ids.dims),
			attention_mask: new Tensor('int64', mask.data, mask.dims),
			token_type_ids: new Tensor('int64', new BigInt64Array(ids.data.length), ids.dims)
		};
		const out = (await run(feeds)).last_hidden_state;
		const [, tokens, dim] = out.dims;
		return meanPool(out.data as Float32Array, mask.data, tokens, dim);
	};
}

/** Remembers recent embeddings: goals are embedded once, and a capture re-sends the same title. */
export function withCache(embed: Embed, max = 512): Embed {
	const cache = new Map<string, Float32Array>();
	return async (text) => {
		const hit = cache.get(text);
		if (hit) {
			cache.delete(text);
			cache.set(text, hit);
			return hit;
		}
		const vector = await embed(text);
		cache.set(text, vector);
		if (cache.size > max) cache.delete(cache.keys().next().value!);
		return vector;
	};
}
