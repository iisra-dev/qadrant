import type { Quadrant } from '$lib/domain/types';

export interface QuadrantMeta {
	name: string;
	rule: string;
	empty: string;
}

// Interface names and rules of docs/01, "Los cuatro cuadrantes".
export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
	do: { name: 'Hacer', rule: 'Urgente · Importante', empty: 'Nada urgente. Buen momento para Programar.' },
	schedule: { name: 'Programar', rule: 'No urgente · Importante', empty: 'Nada que planificar todavía.' },
	delegate: { name: 'Delegar', rule: 'Urgente · No importante', empty: 'Nada que encargar.' },
	eliminate: { name: 'Eliminar', rule: 'No urgente · No importante', empty: 'Nada que sobre. Bien.' }
};

/** CSS custom properties of a quadrant, from design/tokens.css. */
export function quadrantVars(quadrant: Quadrant): string {
	return `--q-bg: var(--q-${quadrant}-bg); --q-ink: var(--q-${quadrant}-ink);`;
}
