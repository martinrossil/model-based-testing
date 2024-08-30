import Container from '../components/Container';
import { LARGE } from './theme/Shadows';

export default class BaseModal extends Container {
	public constructor() {
		super();
		this.fill = 'white';
		this.cornerRadius = 8;
		this.style.boxShadow = LARGE;
	}
}
customElements.define('base-modal', BaseModal);
