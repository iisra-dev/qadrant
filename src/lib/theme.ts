export type Theme = 'light' | 'dark' | 'system';

// Settings stores the theme in IndexedDB and mirrors it here so the inline
// script in app.html can apply it before the first paint (docs/05, "Tema").
export const THEME_STORAGE_KEY = 'qadrant.theme';

// Same values as --bg in design/tokens.css; meta tags cannot read CSS variables.
export const THEME_COLORS = { light: '#FAF9F6', dark: '#0E0E10' } as const;

export function parseTheme(value: string | null | undefined): Theme {
	return value === 'light' || value === 'dark' ? value : 'system';
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme {
	try {
		return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
	} catch {
		return 'system';
	}
}

/** Applies the theme to the document and mirrors it to localStorage. */
export function applyTheme(theme: Theme, doc: Document = document): void {
	const root = doc.documentElement;
	if (theme === 'system') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', theme);

	for (const meta of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		const scheme = meta.media.includes('dark') ? 'dark' : 'light';
		meta.content = THEME_COLORS[theme === 'system' ? scheme : theme];
	}

	try {
		if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
		else localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Storage can be unavailable (private mode); the theme still applies for this session.
	}
}
