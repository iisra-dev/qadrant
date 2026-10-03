import { en, type Messages } from './en';
import { es } from './es';
import type { Lang } from './lang';

export const catalogs: Record<Lang, Messages> = { en, es };

export function messages(lang: Lang): Messages {
	return catalogs[lang];
}

export type { Messages };
