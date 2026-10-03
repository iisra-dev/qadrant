import { combine } from '$lib/domain/quadrant';
import type { ClassifyContext, Decision } from '$lib/domain/types';
import { evaluateUrgency } from '$lib/domain/urgency';
import { extract } from './rules';

/** Rules-only mode (docs/03, step 8): no model, at most one question. */
export function classifyWithRules(text: string, ctx: ClassifyContext): Decision {
	const extraction = extract(text, ctx);
	const urgent = evaluateUrgency(extraction.dueAt, ctx.now, ctx.settings);
	const { quadrant, ask } = combine({
		urgent: urgent.value,
		assigned: Boolean(extraction.personId),
		pImportance: null,
		pDelegable: null,
		thresholds: ctx.settings.thresholds
	});
	return {
		quadrant,
		...(ask && { ask }),
		title: extraction.title,
		urgent,
		importance: { p: null },
		delegable: { p: null, ...(extraction.personId && { personId: extraction.personId }) },
		...(extraction.durationMin && { durationMin: extraction.durationMin }),
		engine: 'rules'
	};
}
