import type { EngineStatus } from './protocol';

/** The assistant's state for Settings; filled by the engine worker. */
class EngineState {
	status = $state<EngineStatus>({ model: 'checking', engine: 'rules' });
}

export const engineState = new EngineState();
