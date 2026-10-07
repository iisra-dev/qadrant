import type { Lang } from '$lib/i18n/lang';

/**
 * The public repository of the server, with the instructions to set one up
 * (docs/01). null hides the link.
 */
export const SERVER_REPO_URL: string | null = 'https://github.com/iisra-dev/qadrant-server';

/** The instructions in the interface language. */
export function instructionsUrl(lang: Lang): string | null {
	if (!SERVER_REPO_URL) return null;
	return lang === 'es' ? `${SERVER_REPO_URL}/blob/main/README.es.md` : `${SERVER_REPO_URL}#readme`;
}
