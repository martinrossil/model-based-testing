import { createActor } from 'xstate';
import { feedbackMachine } from './FeedbackMachine';

export const feedbackActor = createActor(feedbackMachine);

