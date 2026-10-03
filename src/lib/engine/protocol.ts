import type { ClassifyContext, Decision } from '$lib/domain/types';

export interface ClassifyRequest {
	type: 'classify';
	id: number;
	text: string;
	ctx: ClassifyContext;
}

export type ClassifyResponse =
	| { type: 'decision'; id: number; decision: Decision }
	| { type: 'error'; id: number; message: string };
