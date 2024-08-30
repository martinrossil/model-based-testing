import { Observable } from './observables/Observable';

export type Modals = 'None' | 'Satisfied' | 'Feedback' | 'Thanx' | 'Closed';

export type IContext = {
	modal: Observable<Modals>;
};

declare global {
	interface WindowEventMap {
		'SATISFIED_YES': { type: 'SATISFIED_YES' };
		'SATISFIED_NO': { type: 'SATISFIED_NO' };
	}
}

export type Events = { type: 'SATISFIED_YES' } | { type: 'SATISFIED_NO' };
