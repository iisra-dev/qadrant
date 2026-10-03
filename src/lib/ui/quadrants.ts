import type { Quadrant } from '$lib/domain/types';

/** CSS custom properties of a quadrant, from design/tokens.css. Names and rules live in the i18n catalogs. */
export function quadrantVars(quadrant: Quadrant): string {
	return `--q-bg: var(--q-${quadrant}-bg); --q-ink: var(--q-${quadrant}-ink);`;
}
