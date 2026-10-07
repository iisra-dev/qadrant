import { flip } from 'svelte/animate';
import { crossfade, type TransitionConfig } from 'svelte/transition';

/** cubic-bezier(x1, y1, x2, y2) as an easing function, solved for x with Newton's method. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
	const at = (a: number, b: number, t: number) => ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
	const slope = (a: number, b: number, t: number) => 3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
	return (x) => {
		if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1;
		let t = x;
		for (let i = 0; i < 8; i++) {
			const d = slope(x1, x2, t);
			if (Math.abs(d) < 1e-6) break;
			t -= (at(x1, x2, t) - x) / d;
		}
		return at(y1, y2, Math.min(1, Math.max(0, t)));
	};
}

/** The iOS sheet curve every entrance uses (docs/05, "Movimiento"). */
export const sheetCurve = bezier(0.32, 0.72, 0, 1);

export const MOVE_MS = 320;
const ENTER_MS = 260;
const LEAVE_MS = 220;
const REDUCED_MS = 150;

export function reducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function fadeOnly(): TransitionConfig {
	return { duration: REDUCED_MS, css: (t) => `opacity: ${t}` };
}

/** A row that appears: fades in rising 8 px. */
function enter(): TransitionConfig {
	return { duration: ENTER_MS, easing: sheetCurve, css: (t, u) => `opacity: ${t}; transform: translateY(${u * 8}px)` };
}

/** A row that goes: fades out while its height folds, so the rows below move up. */
function leave(node: Element): TransitionConfig {
	const height = (node as HTMLElement).offsetHeight;
	return {
		duration: LEAVE_MS,
		easing: sheetCurve,
		css: (t) => `opacity: ${t}; height: ${t * height}px; overflow: hidden`
	};
}

/**
 * Rows of the Matrix (docs/05, "Movimiento"): a task that changes quadrant
 * glides from one card to the other; one that only appears or goes fades in
 * or folds away. With reduced motion, plain 150 ms fades.
 */
export const [sendRow, receiveRow] = crossfade({
	duration: (distance) => (reducedMotion() ? REDUCED_MS : Math.min(480, MOVE_MS + distance / 4)),
	easing: sheetCurve,
	fallback: (node, _params, intro) => (reducedMotion() ? fadeOnly() : intro ? enter() : leave(node))
});

/** The rest of the rows make room smoothly. */
export function moveRow(node: Element, rects: { from: DOMRect; to: DOMRect }) {
	return flip(node, rects, { duration: reducedMotion() ? 0 : MOVE_MS, easing: sheetCurve });
}
