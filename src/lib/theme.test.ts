import { describe, expect, it } from 'vitest';
import { parseTheme, readStoredTheme, THEME_STORAGE_KEY } from './theme';

describe('parseTheme', () => {
	it('keeps light and dark', () => {
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('dark')).toBe('dark');
	});

	it('falls back to system for anything else', () => {
		expect(parseTheme(null)).toBe('system');
		expect(parseTheme('system')).toBe('system');
		expect(parseTheme('sepia')).toBe('system');
	});
});

describe('readStoredTheme', () => {
	it('reads the mirrored value', () => {
		const storage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? 'dark' : null) };
		expect(readStoredTheme(storage)).toBe('dark');
	});

	it('survives storage that throws', () => {
		const storage = {
			getItem: () => {
				throw new Error('SecurityError');
			}
		};
		expect(readStoredTheme(storage)).toBe('system');
	});
});
