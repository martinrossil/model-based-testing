import { feedbackActor } from './fsm/FeedbackActor';

export default class FeedbackLogic {
	public constructor() {
		window.addEventListener('SATISFIED_YES', feedbackActor.send);
		window.addEventListener('SATISFIED_NO', feedbackActor.send);
		feedbackActor.subscribe(snapshot => {
			console.log(snapshot.value);
		});
		feedbackActor.start();

		// feedbackActor.send({ type: 'SATISFIED_YES' });
	}
}
