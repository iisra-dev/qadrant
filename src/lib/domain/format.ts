import type { Lang } from '$lib/i18n/lang';
import { addDays, dateKey, startOfDay } from './dates';

// Fixed labels: Intl output varies between engines and tests must be deterministic.
const WEEKDAYS: Record<Lang, string[]> = {
	es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
	en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};
const WEEKDAYS_SHORT: Record<Lang, string[]> = {
	es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
	en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};
const MONTHS_SHORT: Record<Lang, string[]> = {
	es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
	en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
};
const MONTHS: Record<Lang, string[]> = {
	es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
	en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

export function weekdayName(date: Date, lang: Lang = 'es'): string {
	return WEEKDAYS[lang][date.getDay()];
}

export function weekdayShort(date: Date, lang: Lang = 'es'): string {
	return WEEKDAYS_SHORT[lang][date.getDay()];
}

/** 24-hour clock in both languages, as the working hours are. */
export function formatTime(date: Date): string {
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "5 oct" / "Oct 5" */
export function formatDayMonth(date: Date, lang: Lang = 'es'): string {
	return lang === 'en'
		? `${MONTHS_SHORT.en[date.getMonth()]} ${date.getDate()}`
		: `${date.getDate()} ${MONTHS_SHORT.es[date.getMonth()]}`;
}

/** "lun 5 oct" / "Mon, Oct 5" */
export function formatShortDate(date: Date, lang: Lang = 'es'): string {
	return lang === 'en'
		? `${WEEKDAYS_SHORT.en[date.getDay()]}, ${formatDayMonth(date, 'en')}`
		: `${WEEKDAYS_SHORT.es[date.getDay()]} ${formatDayMonth(date, 'es')}`;
}

/** "lun 5 oct, 09:00" / "Mon, Oct 5, 09:00" */
export function formatShortDateTime(date: Date, lang: Lang = 'es'): string {
	return `${formatShortDate(date, lang)}, ${formatTime(date)}`;
}

/** "viernes, 2 de octubre" / "Friday, October 2" */
export function formatLongDate(date: Date, lang: Lang = 'es'): string {
	return lang === 'en'
		? `${WEEKDAYS.en[date.getDay()]}, ${MONTHS.en[date.getMonth()]} ${date.getDate()}`
		: `${WEEKDAYS.es[date.getDay()]}, ${date.getDate()} de ${MONTHS.es[date.getMonth()]}`;
}

/** "hoy", "mañana", "ayer", "el martes" or "el 20 de octubre"; in English "today", "tomorrow", "yesterday", "on Tuesday", "on October 20". */
export function relativeDay(date: Date, now: Date, lang: Lang = 'es'): string {
	const key = dateKey(date);
	const today = startOfDay(now);
	const en = lang === 'en';
	if (key === dateKey(today)) return en ? 'today' : 'hoy';
	if (key === dateKey(addDays(today, 1))) return en ? 'tomorrow' : 'mañana';
	if (key === dateKey(addDays(today, -1))) return en ? 'yesterday' : 'ayer';
	const days = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000);
	if (days > 0 && days < 7) return en ? `on ${WEEKDAYS.en[date.getDay()]}` : `el ${WEEKDAYS.es[date.getDay()]}`;
	return en
		? `on ${MONTHS.en[date.getMonth()]} ${date.getDate()}`
		: `el ${date.getDate()} de ${MONTHS.es[date.getMonth()]}`;
}

/** "45 min", "1 h", "1 h 30 min" (same in both languages) */
export function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}

/** "87 %" in Spanish, "87%" in English. */
export function formatPercent(p: number, lang: Lang = 'es'): string {
	return lang === 'en' ? `${Math.round(p * 100)}%` : `${Math.round(p * 100)} %`;
}
