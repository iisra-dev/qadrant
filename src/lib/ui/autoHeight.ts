/**
 * Svelte action: the element follows the height of its first child with a
 * transition (set in CSS), so content that appears or changes does not make
 * the layout jump. It clips only while the height is changing, so focus rings
 * inside are not cut off.
 */
export function autoHeight(node: HTMLElement) {
	const inner = node.firstElementChild as HTMLElement | null;
	if (!inner) return;
	let height = -1;

	const observer = new ResizeObserver(() => {
		const next = inner.offsetHeight;
		if (next === height) return;
		const first = height < 0;
		height = next;
		// No transition (reduced motion): no transitionend will come to unclip it.
		const animates = !first && getComputedStyle(node).transitionDuration.split(',').some((d) => parseFloat(d) > 0);
		node.style.overflow = animates ? 'hidden' : '';
		node.style.height = `${next}px`;
	});
	const settle = (event: TransitionEvent) => {
		if (event.target === node && event.propertyName === 'height') node.style.overflow = '';
	};

	observer.observe(inner);
	node.addEventListener('transitionend', settle);
	return {
		destroy() {
			observer.disconnect();
			node.removeEventListener('transitionend', settle);
		}
	};
}
