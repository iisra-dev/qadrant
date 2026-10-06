import { expect, test } from '@playwright/test';
import { MAIN_GOAL, openGroup, startApp } from './helpers';

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+02:00')); // Monday
});

test('first run is in English', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/welcome$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('textbox', { name: MAIN_GOAL.en })).toBeVisible();
	await page.getByRole('button', { name: 'Start' }).click();
	await expect(page.getByRole('alert')).toHaveText('Write at least one goal.');
});

test('main flows in English: capture, doubt, correct, complete', async ({ page }) => {
	await startApp(page, 'Pass my exams', 'en');
	await expect(page.getByText('Monday, October 5')).toBeVisible();

	// Capture: proposal with date, duration and slot.
	await page.getByRole('button', { name: "What's on your mind?" }).click();
	const sheet = page.getByRole('dialog', { name: 'New task' });
	await sheet.getByRole('textbox', { name: 'Task' }).fill('Call the garage tomorrow, half an hour');
	await expect(sheet.getByText('Goes to', { exact: true })).toBeVisible();
	await expect(sheet.getByText('Yes · due Tue, Oct 6, 18:00')).toBeVisible();
	await expect(sheet.getByText('Today 10:00 · 30 min')).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Do', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await sheet.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('region', { name: 'Do' }).getByRole('link', { name: 'Call the garage' })).toBeVisible();

	// Doubt: no date, rules only.
	await page.getByRole('button', { name: "What's on your mind?" }).click();
	await sheet.getByRole('textbox', { name: 'Task' }).fill('Look at English courses');
	await expect(sheet.getByText('Does it bring you closer to any of your goals?')).toBeVisible();
	await sheet.getByRole('button', { name: /Yes, it matters.*goes to Schedule/ }).click();
	await expect(page.getByRole('region', { name: 'Schedule' }).getByRole('link', { name: 'Look at English courses' })).toBeVisible();

	// Correct in the detail and read the explanation.
	await page.getByRole('region', { name: 'Do' }).getByRole('link', { name: 'Call the garage' }).click();
	await expect(page.getByText('WHY IT IS IN DO')).toBeVisible();
	await expect(page.getByText('Due within the next 2 working days. No assistant, goes to Do.')).toBeVisible();
	await page.getByRole('group', { name: 'Quadrant' }).getByRole('button', { name: 'Delegate' }).click();
	await expect(page.getByText('You moved it.')).toBeVisible();
	await page.getByRole('button', { name: 'Back' }).click();

	// Complete.
	await page.getByRole('region', { name: 'Delegate' }).getByRole('checkbox', { name: 'Complete: Call the garage' }).check();
	await expect(page.getByRole('region', { name: 'Delegate' }).getByLabel('0 tasks')).toBeVisible();
});

test('switching to Spanish in Settings applies at once and is kept', async ({ page }) => {
	await startApp(page, 'Pass my exams', 'en');
	await page.getByRole('link', { name: 'Settings' }).click();
	await openGroup(page, 'Appearance');
	await page.getByLabel('Español').check();
	await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'es');
	await page.getByRole('link', { name: 'Matriz' }).click();
	await expect(page).toHaveURL(/\/$/);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Hoy', level: 1 })).toBeVisible();
	await page.getByRole('link', { name: 'Ajustes' }).click();
	await openGroup(page, 'Apariencia');
	await page.getByLabel('English').check();
	await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});
