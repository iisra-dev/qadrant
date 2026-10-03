/** Step 1 of docs/03: trim, collapse spaces and drop stray typographic quotes. Keeps case. */
export function normalize(text: string): string {
	return text
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^[«“"']+|[»”"']+$/g, '')
		.trim();
}

/** Lowercase without accents, same length as the input (for index-safe matching). */
export function fold(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '');
}

export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes [start, end) ranges from text. */
export function removeRanges(text: string, ranges: [number, number][]): string {
	const sorted = [...ranges].sort((a, b) => b[0] - a[0]);
	let out = text;
	for (const [start, end] of sorted) out = out.slice(0, start) + ' ' + out.slice(end);
	return out;
}

/** Tidies a title after phrases were removed: spaces, dangling punctuation, first capital. */
export function tidyTitle(text: string): string {
	const clean = text
		.replace(/\s+/g, ' ')
		.replace(/\s+([,;:.])/g, '$1')
		.replace(/([,;:])(?:\s*[,;:])+/g, '$1')
		.trim()
		.replace(/^[,;:.\-–\s]+|[,;:\-–\s]+$/g, '')
		.trim();
	return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * A date or duration said in an aside, "(venció ayer)", "(1h de preparación)":
 * the whole parenthesis goes away with it.
 */
export function widenToParentheses(text: string, [start, end]: [number, number]): [number, number] {
	const open = text.lastIndexOf('(', start);
	if (open < 0 || text.slice(open, start).includes(')')) return [start, end];
	const close = text.indexOf(')', Math.max(end - 1, open));
	if (close < 0 || text.slice(end, close).includes('(')) return [start, end];
	return [open, close + 1];
}
