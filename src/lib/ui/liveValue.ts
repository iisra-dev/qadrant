type Editable = HTMLInputElement | HTMLTextAreaElement;

/**
 * Keeps a field in step with a value that may change from elsewhere (another
 * tab, another device) without overwriting what the user is typing: while the
 * field has focus and has been edited, new values wait; on leaving it without
 * a change, the latest one is shown.
 */
export function liveValue(node: Editable, value: string) {
	let latest = value;
	let dirty = false;
	node.value = value;

	const onInput = () => (dirty = true);
	// What the user committed is the newest value until the store echoes it.
	const onChange = () => {
		dirty = false;
		latest = node.value;
	};
	const onBlur = () => {
		if (!dirty && node.value !== latest) node.value = latest;
	};
	node.addEventListener('input', onInput);
	node.addEventListener('change', onChange);
	node.addEventListener('blur', onBlur);

	return {
		update(next: string) {
			latest = next;
			if (node.ownerDocument.activeElement !== node) node.value = next;
		},
		destroy() {
			node.removeEventListener('input', onInput);
			node.removeEventListener('change', onChange);
			node.removeEventListener('blur', onBlur);
		}
	};
}
