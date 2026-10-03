import { addDays, dateKey, startOfDay } from './dates';

// Spanish (Spain) labels; Intl output varies between engines, so they are fixed here.
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MONTHS = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
];

export function formatTime(date: Date): string {
	return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "lun 5 oct" */
export function formatShortDate(date: Date): string {
	return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

/** "lun 5 oct, 09:00" */
export function formatShortDateTime(date: Date): string {
	return `${formatShortDate(date)}, ${formatTime(date)}`;
}

/** "viernes, 2 de octubre" */
export function formatLongDate(date: Date): string {
	return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** "hoy", "mañana", "ayer", "el martes" (within a week) or "el 20 de octubre". */
export function relativeDay(date: Date, now: Date): string {
	const key = dateKey(date);
	const today = startOfDay(now);
	if (key === dateKey(today)) return 'hoy';
	if (key === dateKey(addDays(today, 1))) return 'mañana';
	if (key === dateKey(addDays(today, -1))) return 'ayer';
	const days = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000);
	if (days > 0 && days < 7) return `el ${WEEKDAYS[date.getDay()]}`;
	return `el ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

/** "45 min", "1 h", "1 h 30 min" */
export function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatPercent(p: number): string {
	return `${Math.round(p * 100)} %`;
}
