import { describe, expect, it } from 'vitest';

describe('test environment', () => {
	it('runs with TZ=Europe/Madrid', () => {
		expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/Madrid');
	});
});
