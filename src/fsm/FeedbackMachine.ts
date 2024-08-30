import { createMachine } from 'xstate';
import { Context } from '../Context';
import { IContext, Events } from '../types';

export const feedbackMachine = createMachine({
	id: 'FeedbackMachine',
	types: {} as {
		context: IContext;
		events: Events;
		// guards: Guards,
	},
	context: Context,
	initial: 'Satisfied',
	states: {
		Satisfied: {
			entry: 'setModalToSatisfied',
			on: {
				SATISFIED_YES: 'Thanx',
				SATISFIED_NO: 'Feedback',
			},
		},
		Feedback: {
			entry: 'setModalToFeedback',
		},
		Thanx: {
			entry: 'setModalToThanx',
		},
		Closed: {},
	},
}, {
	actions: {
		setModalToSatisfied: ({context}) => {
			context.modal.value = 'Satisfied';
		},
		setModalToFeedback: ({context}) => {
			context.modal.value = 'Feedback';
		},
		setModalToThanx: ({context}) => {
			context.modal.value = 'Thanx';
		},
	},
});
