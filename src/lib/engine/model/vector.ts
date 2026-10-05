// Small vector helpers for the embedding model (docs/03, step 6). Pure, no ONNX.

/** Mean of the token vectors where the mask is set, scaled to unit length. */
export function meanPool(
	hidden: Float32Array,
	mask: ArrayLike<bigint | number>,
	tokens: number,
	dim: number
): Float32Array {
	const pooled = new Float32Array(dim);
	let count = 0;
	for (let t = 0; t < tokens; t++) {
		if (Number(mask[t]) === 0) continue;
		count++;
		for (let d = 0; d < dim; d++) pooled[d] += hidden[t * dim + d];
	}
	if (count === 0) return pooled;
	let norm = 0;
	for (let d = 0; d < dim; d++) norm += (pooled[d] /= count) ** 2;
	norm = Math.sqrt(norm);
	if (norm > 0) for (let d = 0; d < dim; d++) pooled[d] /= norm;
	return pooled;
}

/** Dot product; the cosine similarity of two unit vectors. */
export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
	return sum;
}

export function sigmoid(x: number): number {
	return 1 / (1 + Math.exp(-x));
}
