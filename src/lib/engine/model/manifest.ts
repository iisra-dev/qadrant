// Shapes of the manifests published with the model (scripts/chunk-model.mjs)
// and with ONNX Runtime (scripts/prepare-ort.mjs). docs/02, "Modelo".

export interface FilePart {
	file: string;
	bytes: number;
	sha256: string;
}

export interface ModelManifest {
	version: string;
	model: string;
	bytes: number;
	sha256: string;
	parts: FilePart[];
	tokenizer: FilePart[];
	calibration?: { importance: { a: number; b: number } };
}

export interface RuntimeManifest {
	version: string;
	bytes: number;
	sha256: string;
	parts: FilePart[];
}

export const MODEL_BASE = '/models/';
export const RUNTIME_BASE = '/ort/';

/** Bytes to download: model, tokenizer and runtime. */
export function totalBytes(model: ModelManifest, runtime: RuntimeManifest): number {
	return model.bytes + model.tokenizer.reduce((sum, f) => sum + f.bytes, 0) + runtime.bytes;
}
