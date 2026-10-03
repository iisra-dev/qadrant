import { messages, type Messages } from './catalog';
import { DEFAULT_LANG, LANG_STORAGE_KEY, type Lang } from './lang';

// Current interface language. The layout sets it from Settings; screens read `i18n.m`.
class I18n {
	lang = $state<Lang>(DEFAULT_LANG);
	m: Messages = $derived(messages(this.lang));

	set(lang: Lang, doc: Document | undefined = globalThis.document) {
		this.lang = lang;
		if (doc) doc.documentElement.lang = lang;
		try {
			localStorage.setItem(LANG_STORAGE_KEY, lang);
		} catch {
			// Private mode: the language still applies for this session.
		}
	}
}

export const i18n = new I18n();
export type { Lang, Messages };
