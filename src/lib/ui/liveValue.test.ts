// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { liveValue } from './liveValue';

function field() {
	const node = document.createElement('textarea');
	document.body.append(node);
	return node;
}

describe('liveValue', () => {
	it('follows the value while the field is not in use', () => {
		const node = field();
		const action = liveValue(node, 'a');
		expect(node.value).toBe('a');
		action.update('b');
		expect(node.value).toBe('b');
	});

	it('does not overwrite what the user is typing; their change wins', () => {
		const node = field();
		const action = liveValue(node, 'Pedir presupuesto');
		node.focus();
		node.value = 'Pedir presupuesto al';
		node.dispatchEvent(new Event('input'));
		action.update('Llegado de otro dispositivo');
		expect(node.value).toBe('Pedir presupuesto al');
		node.dispatchEvent(new Event('change'));
		node.blur();
		expect(node.value).toBe('Pedir presupuesto al');
	});

	it('shows what arrived while focused once the user leaves without typing', () => {
		const node = field();
		const action = liveValue(node, 'a');
		node.focus();
		action.update('b');
		expect(node.value).toBe('a');
		node.blur();
		expect(node.value).toBe('b');
	});
});
