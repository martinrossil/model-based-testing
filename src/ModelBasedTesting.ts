import { Context } from './Context';
import FeedbackLogic from './FeedbackLogic';
import Application from './components/Application';
import { Modals } from './types';
import SatisfiedModal from './ui/SatisfiedModal';
import { GRAY_100 } from './ui/theme/Colors';

export default class ModelBasedTesting extends Application {
	public constructor() {
		super();
		this.fill = GRAY_100;
		this.align = 'CENTER';
		Context.modal.add(this.modalChanged.bind(this));
		new FeedbackLogic();
	}

	private readonly satisfiedModal = new SatisfiedModal();

	private modalChanged(value: Modals) {
		console.log('modalChanged', value);
		this.removeAllComponents();
		if (value === 'Satisfied') {
			this.addComponent(this.satisfiedModal);
		}
	}
}
customElements.define('model-based-testing', ModelBasedTesting);
