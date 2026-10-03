import type { Decision, Quadrant, Settings } from './types';

export interface CombineInput {
	urgent: boolean;
	/** The text assigns the task to someone ("Que Ana...", "Pedirle a Luis que..."). */
	assigned: boolean;
	/** null in rules-only mode. */
	pImportance: number | null;
	/** null when not computed or in rules-only mode. */
	pDelegable: number | null;
	thresholds: Settings['thresholds'];
}

export type CombineResult = Pick<Decision, 'quadrant' | 'ask'>;

/** Delegability tie-break used when there is no second question (docs/03, step 7). */
export const DELEGABLE_TIE = 0.5;

/** Step 7 of docs/03: urgency x importance x delegability -> quadrant or one question. */
export function combine({ urgent, assigned, pImportance, pDelegable, thresholds }: CombineInput): CombineResult {
	// The user already decided who does it.
	if (assigned) return { quadrant: 'delegate' };

	// Rules-only mode (step 8): ask only when the answer changes the result.
	if (pImportance === null) return urgent ? { quadrant: 'do' } : { quadrant: null, ask: 'importance' };

	// Thresholds are inclusive: high counts as high and low as low.
	const high = pImportance >= thresholds.high;
	const low = pImportance <= thresholds.low;

	if (!high && !low) return { quadrant: null, ask: 'importance' };
	if (!urgent) return { quadrant: high ? 'schedule' : 'eliminate' };
	if (high) return { quadrant: 'do' };

	// Urgent and not important: delegate only if someone else can do it.
	if (pDelegable === null || pDelegable <= thresholds.low) return { quadrant: 'do' };
	if (pDelegable >= thresholds.high) return { quadrant: 'delegate' };
	return { quadrant: null, ask: 'delegable' };
}

/** Quadrant once importance is known, without asking (used by answers and the passage of time). */
export function resolveKnown(urgent: boolean, important: boolean, pDelegable: number | null): Quadrant {
	if (!urgent) return important ? 'schedule' : 'eliminate';
	if (important) return 'do';
	return (pDelegable ?? 0) >= DELEGABLE_TIE ? 'delegate' : 'do';
}

/** Where each button of the doubt sends the task; there is never a second question. */
export function doubtOutcomes(input: {
	ask: NonNullable<Decision['ask']>;
	urgent: boolean;
	pDelegable: number | null;
}): { yes: Quadrant; no: Quadrant } {
	if (input.ask === 'delegable') return { yes: 'delegate', no: 'do' };
	return {
		yes: resolveKnown(input.urgent, true, input.pDelegable),
		no: resolveKnown(input.urgent, false, input.pDelegable)
	};
}

export type SaveKind =
	| { kind: 'accepted'; decision: Decision; thresholds: Settings['thresholds'] }
	| { kind: 'answer'; ask: NonNullable<Decision['ask']>; answer: boolean }
	| { kind: 'manual'; quadrant: Quadrant; urgent: boolean };

/** Value of Task.important when saving (docs/03, end of "Pasos"); undefined = unknown. */
export function importantOnSave(input: SaveKind): boolean | undefined {
	switch (input.kind) {
		case 'accepted': {
			const p = input.decision.importance.p;
			if (p === null) return undefined;
			if (p >= input.thresholds.high) return true;
			if (p <= input.thresholds.low) return false;
			return undefined;
		}
		case 'answer':
			return input.ask === 'importance' ? input.answer : false;
		case 'manual':
			if (input.quadrant === 'schedule') return true;
			if (input.quadrant === 'eliminate') return false;
			if (input.quadrant === 'do') return input.urgent ? undefined : true;
			return undefined;
	}
}
