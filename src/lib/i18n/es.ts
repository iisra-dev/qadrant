import type { Messages } from './en';

// Castellano (España). Same shape as en.ts.
export const es: Messages = {
	quadrants: {
		do: { name: 'Hacer', rule: 'Urgente · Importante', empty: 'Nada urgente. Buen momento para Programar.', result: 'Urgente e importante' },
		schedule: { name: 'Programar', rule: 'No urgente · Importante', empty: 'Nada que planificar todavía.', result: 'Importante, sin prisa' },
		delegate: { name: 'Delegar', rule: 'Urgente · No importante', empty: 'Nada que encargar.', result: 'Lo puede hacer otra persona' },
		eliminate: { name: 'Eliminar', rule: 'No urgente · No importante', empty: 'Nada que sobre. Bien.', result: 'Ni urgente ni importante' }
	},
	explain: {
		window: (n) => (n === 1 ? 'el próximo día laborable' : `en los próximos ${n} días laborables`),
		noDate: 'No tiene fecha, así que no es urgente.',
		dueSoon: (window) => `Vence ${window}.`,
		overdue: (when) => `Venció ${when}.`,
		dueLater: (when) => `Vence ${when}, así que aún no es urgente.`,
		noAssistant: (quadrant) => `Sin asistente, va a ${quadrant}.`,
		importanceGoal: (percent, goal) => `Importancia ${percent} por tu objetivo «${goal}».`,
		importance: (percent) => `Importancia ${percent}.`,
		someoneElse: 'Puede hacerlo otra persona.',
		nobodyElse: 'Nadie más puede hacerlo.',
		assignedTo: (name) => `Se lo encargaste a ${name}.`,
		assignedToSomeone: 'Se lo encargaste a otra persona.',
		answeredDelegable: 'Respondiste que puede hacerlo otra persona.',
		answeredNotDelegable: 'Respondiste que nadie más puede hacerlo.',
		answeredImportant: 'Respondiste que es importante.',
		answeredNotImportant: 'Respondiste que no es importante.',
		movedByHand: 'Lo moviste tú.',
		moved: (quadrant) => `Ha pasado a ${quadrant}.`,
		movedOut: (quadrant, window) => `Ha pasado a ${quadrant} porque ya no vence ${window}.`,
		movedIn: (quadrant, overdue, when) => `Ha pasado a ${quadrant} porque ${overdue ? 'venció' : 'vence'} ${when}.`,
		doubtImportance: (urgency) => `${urgency} Solo falta saber si es importante para ti.`,
		doubtDelegable: (urgency) => `${urgency} y no parece importante. Solo falta saber si puede hacerlo otra persona.`,
		lineNoDate: 'No · sin fecha',
		lineOverdue: (when) => `Sí · venció ${when}`,
		lineDue: (urgent, when) => `${urgent ? 'Sí' : 'No'} · vence ${when}`,
		lineGoal: (percent, goal) => `${percent} · objetivo «${goal}»`,
		lineNoAssistant: 'Sin asistente',
		lineNoTime: 'Sin hora',
		today: 'Hoy',
		tomorrow: 'Mañana'
	}
};
