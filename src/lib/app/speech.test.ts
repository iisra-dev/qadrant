import { afterEach, describe, expect, it, vi } from 'vitest';
import { speechMode } from './speech';

describe('speechMode', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('none without the Web Speech API', async () => {
		expect(await speechMode('es')).toBe('none');
	});

	it('local when the browser recognises on the device', async () => {
		vi.stubGlobal('SpeechRecognition', Object.assign(class {}, { available: async () => 'available' }));
		expect(await speechMode('es')).toBe('local');
	});

	it("cloud when only the browser's service is there", async () => {
		vi.stubGlobal('webkitSpeechRecognition', class {});
		expect(await speechMode('es')).toBe('cloud');
		vi.stubGlobal('SpeechRecognition', Object.assign(class {}, { available: async () => 'downloadable' }));
		expect(await speechMode('en')).toBe('cloud');
	});
});
