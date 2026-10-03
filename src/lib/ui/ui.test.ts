// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuadrantCard from './QuadrantCard.svelte';
import QuadrantPicker from './QuadrantPicker.svelte';
import TabBar from './TabBar.svelte';
import TaskRow from './TaskRow.svelte';

afterEach(cleanup);

describe('QuadrantPicker', () => {
	it('is a group of four toggle buttons', async () => {
		const onchange = vi.fn();
		render(QuadrantPicker, { value: 'do', onchange });
		expect(screen.getByRole('group', { name: 'Cuadrante' })).toBeTruthy();
		const buttons = screen.getAllByRole('button');
		expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Hacer', 'Programar', 'Delegar', 'Eliminar']);
		expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
		await fireEvent.click(buttons[2]);
		expect(onchange).toHaveBeenCalledWith('delegate');
	});
});

describe('TaskRow', () => {
	it('names the checkbox with the title and links the title', async () => {
		const oncomplete = vi.fn();
		render(TaskRow, { title: 'Llamar al taller', href: '/task/1', overdue: true, oncomplete });
		const checkbox = screen.getByRole('checkbox', { name: 'Completar: Llamar al taller' });
		expect(screen.getByRole('link').getAttribute('href')).toBe('/task/1');
		expect(screen.getByText('Vencida')).toBeTruthy();
		await fireEvent.click(checkbox);
		expect(oncomplete).toHaveBeenCalled();
	});
});

describe('QuadrantCard', () => {
	const row = createRawSnippet((item: () => { id: string }) => ({ render: () => `<span>${item().id}</span>` }));

	it('shows three rows and a "+N más" button with aria-expanded', async () => {
		const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
		render(QuadrantCard, { quadrant: 'schedule', items, row });
		expect(screen.getByRole('heading', { name: 'Programar' })).toBeTruthy();
		expect(screen.getAllByRole('listitem')).toHaveLength(3);
		const more = screen.getByRole('button', { name: '+2 más' });
		expect(more.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(more);
		expect(screen.getAllByRole('listitem')).toHaveLength(5);
		expect(screen.getByRole('button', { name: 'Ver menos' }).getAttribute('aria-expanded')).toBe('true');
	});

	it('shows the empty text', () => {
		render(QuadrantCard, { quadrant: 'do', items: [], row });
		expect(screen.getByText('Nada urgente. Buen momento para Programar.')).toBeTruthy();
	});
});

describe('TabBar', () => {
	it('marks the current page', () => {
		render(TabBar, { current: '/agenda' });
		const links = screen.getAllByRole('link');
		expect(links.map((l) => l.textContent?.trim())).toEqual(['Matriz', 'Agenda', 'Ajustes']);
		expect(screen.getByRole('link', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: 'Matriz' }).getAttribute('aria-current')).toBeNull();
	});
});
