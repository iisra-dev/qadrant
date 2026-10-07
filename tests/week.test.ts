import { expect, test, type Page } from '@playwright/test';
import { startApp } from './helpers';

/** Writes tasks straight into IndexedDB, at times of the current week (Monday = 0), and reloads. */
async function seed(page: Page, tasks: { id: string; title: string; quadrant: string; day?: number; at?: [number, number]; durationMin?: number; dueDay?: number }[]) {
	await page.evaluate(async (tasks) => {
		const now = new Date();
		const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
		const at = (day: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day, h, m).toISOString();
		const rows = tasks.map(({ day, at: time, dueDay, ...t }) => ({
			createdAt: at(0, 8),
			updatedAt: at(0, 8),
			quadrantSource: 'ai',
			status: 'open',
			rawInput: t.title,
			...t,
			...(time && { scheduledAt: at(day ?? 0, time[0], time[1]) }),
			...(dueDay !== undefined && { dueAt: at(dueDay, 12) })
		}));
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('qadrant');
			request.onsuccess = () => {
				const tx = request.result.transaction('tasks', 'readwrite');
				for (const row of rows) tx.objectStore('tasks').put(row);
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
			};
		});
	}, tasks);
	await page.goto('/agenda');
}

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
});

test('short blocks keep their title on one line and a full touch target', async ({ page }) => {
	await startApp(page);
	await seed(page, [
		{ id: 'short', title: 'Establecer un límite', quadrant: 'schedule', day: 0, at: [11, 0], durationMin: 30 },
		{ id: 'long', title: 'Leer informe', quadrant: 'schedule', day: 1, at: [10, 0], durationMin: 60 }
	]);
	const short = page.getByRole('link', { name: /Establecer un límite/ });
	await expect(short).toContainText('11:00');
	expect((await short.boundingBox())!.height).toBeGreaterThanOrEqual(44);
	await expect(short).not.toContainText('BLOQUE DE FOCO');
	await expect(page.getByRole('link', { name: /Leer informe/ })).toContainText('BLOQUE DE FOCO');
});

test('the focus block label follows the language', async ({ page }) => {
	await startApp(page, 'Q4 sales', 'en');
	await seed(page, [{ id: 'long', title: 'Read the report', quadrant: 'schedule', day: 1, at: [10, 0], durationMin: 60 }]);
	await expect(page.getByRole('link', { name: /Read the report/ })).toContainText('FOCUS BLOCK');
});

test('each day shows what falls due on it', async ({ page }) => {
	await startApp(page);
	await seed(page, [
		{ id: 'a', title: 'Enviar factura', quadrant: 'do', dueDay: 0 },
		{ id: 'b', title: 'Plan de formación', quadrant: 'schedule', dueDay: 0 }
	]);
	await expect(page.getByRole('img', { name: 'Vencen: 1 Hacer, 1 Programar' })).toBeVisible();
});

test('"No slot yet" sits beside the week on wide screens and below it on narrower ones', async ({ page }) => {
	await startApp(page);
	await seed(page, [{ id: 'p', title: 'Plan de formación', quadrant: 'schedule' }]);
	const side = page.getByRole('complementary');
	await expect(side.getByRole('heading', { name: 'Sin hueco todavía' })).toBeVisible();
	await expect(side.getByRole('link', { name: /Plan de formación/ })).toBeVisible();
	await page.setViewportSize({ width: 900, height: 900 });
	await expect(page.getByRole('complementary')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Sin hueco todavía' })).toBeVisible();
});

test('an unknown address shows the error page with a way back', async ({ page }) => {
	await startApp(page);
	await page.goto('/no-existe');
	await expect(page.getByRole('heading', { name: 'Página no encontrada', level: 1 })).toBeVisible();
	await expect(page).toHaveTitle('Página no encontrada · Qadrant');
	await page.getByRole('link', { name: 'Ir a la matriz' }).click();
	await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();
});
