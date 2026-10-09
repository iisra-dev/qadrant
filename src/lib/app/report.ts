import type { Messages } from '$lib/i18n/catalog';

/** Where problems are reported: the app's public repository (docs/01). */
export const ISSUES_URL = 'https://github.com/iisra-dev/qadrant/issues/new';

/** What the report says about this device. Never tasks, goals, people or the server address. */
export interface ReportInfo {
	version: string;
	language: string;
	installed: boolean;
	engine: string;
	model: string;
	sync: boolean;
	browser: string;
}

/**
 * A new GitHub issue with the template filled in. Opening it sends nothing:
 * the user reads it on GitHub and decides whether to submit it.
 */
export function reportUrl(m: Messages['report'], info: ReportInfo): string {
	const body = [
		m.intro,
		'',
		`### ${m.happened}`,
		'',
		'',
		`### ${m.expected}`,
		'',
		'',
		`### ${m.steps}`,
		'1. ',
		'',
		`### ${m.device}`,
		`- Qadrant ${info.version}`,
		`- ${m.language}: ${info.language}`,
		`- ${m.installed}: ${info.installed ? m.yes : m.no}`,
		`- ${m.assistant}: ${info.engine} (${info.model})`,
		`- ${m.sync}: ${info.sync ? m.yes : m.no}`,
		`- ${m.browser}: ${info.browser}`
	].join('\n');
	const params = new URLSearchParams({ template: 'bug_report.md', labels: 'bug', body });
	return `${ISSUES_URL}?${params}`;
}
