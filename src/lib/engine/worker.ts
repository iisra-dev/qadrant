/// <reference lib="webworker" />
import type { ClassifyRequest, ClassifyResponse } from './protocol';
import { classifyWithRules } from './rules-classifier';

// Inference runs here, never on the main thread. Phase 1: rules only;
// phase 2 adds the embedding model session behind the same messages.
self.onmessage = (event: MessageEvent<ClassifyRequest>) => {
	const request = event.data;
	if (request.type !== 'classify') return;
	let response: ClassifyResponse;
	try {
		response = { type: 'decision', id: request.id, decision: classifyWithRules(request.text, request.ctx) };
	} catch (error) {
		response = { type: 'error', id: request.id, message: String(error) };
	}
	self.postMessage(response);
};
