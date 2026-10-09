import { describe, expect, it } from 'vitest';
import { en } from '$lib/i18n/en';
import { es } from '$lib/i18n/es';
import { ISSUES_URL, reportUrl, type ReportInfo } from './report';

const info: ReportInfo = {
	version: '1.5.0',
	language: 'es',
	installed: true,
	engine: 'model-wasm',
	model: 'ready',
	sync: false,
	browser: 'Mozilla/5.0 (iPhone)'
};

describe('reportUrl', () => {
	it('opens a new issue in the app repository with the bug template', () => {
		const url = new URL(reportUrl(en.report, info));
		expect(`${url.origin}${url.pathname}`).toBe(ISSUES_URL);
		expect(url.searchParams.get('template')).toBe('bug_report.md');
		expect(url.searchParams.get('labels')).toBe('bug');
	});

	it('describes the device in the interface language', () => {
		const body = new URL(reportUrl(es.report, info)).searchParams.get('body') ?? '';
		expect(body).toContain('### Qué ha pasado');
		expect(body).toContain('- Qadrant 1.5.0');
		expect(body).toContain('- Instalada: sí');
		expect(body).toContain('- Asistente: model-wasm (ready)');
		expect(body).toContain('- Sincronización: no');
		expect(body).toContain('- Navegador: Mozilla/5.0 (iPhone)');
	});

	it('warns that the issue is public', () => {
		const body = new URL(reportUrl(en.report, info)).searchParams.get('body') ?? '';
		expect(body.startsWith(en.report.intro)).toBe(true);
	});
});
