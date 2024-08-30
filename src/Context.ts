import { IContext, Modals } from './types';
import { observable } from './observables/Observable';

export const Context: IContext = {
	modal: observable<Modals>('None'),
};
