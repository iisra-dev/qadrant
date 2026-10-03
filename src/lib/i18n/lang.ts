/** Interface languages: English (US) by default, Spanish (Spain) second (docs/07). */
export type Lang = 'en' | 'es';

export const LANGS: readonly Lang[] = ['en', 'es'];
export const DEFAULT_LANG: Lang = 'en';

/** Mirrors the setting so app.html can set <html lang> before the app starts. */
export const LANG_STORAGE_KEY = 'qadrant.lang';

export function parseLang(value: string | null | undefined): Lang {
	return value === 'es' ? 'es' : 'en';
}
