import type { LabeledTask } from '$lib/domain/learning';
import type { ClassifyContext, Decision, Engine, Goal } from '$lib/domain/types';

export type Backend = 'webgpu' | 'wasm';

/** What Settings shows about the assistant (docs/01, "Ajustes"). */
export interface EngineStatus {
	/** unavailable = this server publishes no model. */
	model: 'checking' | 'unavailable' | 'absent' | 'downloading' | 'ready' | 'error';
	/** 0..1 while downloading. */
	progress?: number;
	sizeBytes?: number;
	version?: string;
	/** What classifies right now. */
	engine: Engine;
	error?: string;
}

export interface ClassifyRequest {
	type: 'classify';
	id: number;
	text: string;
	ctx: ClassifyContext;
}

export type EngineRequest =
	| ClassifyRequest
	| {
			type: 'start';
			/** Backends that closed the tab while loading on this device. */
			blocked: Backend[];
			/** Download on its own (the welcome's checkbox), on Wi-Fi if wifiOnly. */
			autoDownload: boolean;
			wifiOnly: boolean;
	  }
	| { type: 'download' }
	| { type: 'remove' }
	| { type: 'train'; examples: LabeledTask[]; goals: Goal[] };

export type ClassifyResponse =
	| { type: 'decision'; id: number; decision: Decision }
	| { type: 'error'; id: number; message: string };

export type EngineEvent =
	| ClassifyResponse
	| { type: 'status'; status: EngineStatus }
	/** Sent right before and after creating a session, for the crash guard. */
	| { type: 'loading'; backend: Backend }
	| { type: 'loaded' };
