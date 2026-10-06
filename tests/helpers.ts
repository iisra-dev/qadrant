import { expect, type Page } from '@playwright/test';

/** Label of the one goal the welcome asks for. */
export const MAIN_GOAL = { es: '¿Qué es lo más importante para ti ahora?', en: 'What matters most to you right now?' } as const;

/** Opens a collapsible group of Settings (closed on a phone, except Goals). */
export async function openGroup(page: Page, title: string) {
	const summary = page.locator('summary').filter({ hasText: new RegExp(`^${title}`) });
	const details = page.locator('details').filter({ has: summary });
	if ((await details.getAttribute('open')) === null) await summary.click();
	await expect(details).toHaveAttribute('open', '');
}

/**
 * Completes the first-run welcome and lands on the Matrix. The app starts in
 * English; most tests are written in Spanish, so they pick it on the welcome.
 */
/** The welcome's checkbox that downloads the model on its own. */
export const WIFI = { es: 'Descargar cuando haya wifi', en: 'Download when on Wi-Fi' } as const;

export async function startApp(page: Page, goal = 'Ventas Q4', lang: 'en' | 'es' = 'es', options: { model?: boolean } = {}) {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	if (lang === 'es') await page.getByLabel('Español').check();
	await page.getByRole('textbox', { name: MAIN_GOAL[lang] }).fill(goal);
	// Rules only unless a test wants the model: no download in the background.
	if (!options.model) await page.getByLabel(WIFI[lang]).uncheck();
	await page.getByRole('button', { name: lang === 'es' ? 'Empezar' : 'Start' }).click();
	await expect(page.getByRole('heading', { name: lang === 'es' ? 'Hoy' : 'Today', level: 1 })).toBeVisible();
}
