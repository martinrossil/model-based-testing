import Container from '../components/Container';
import IContainer from '../components/IContainer';
import ILabel from '../components/ILabel';
import Label from '../components/Label';
import BaseButton from './BaseButton';
import BaseModal from './BaseModal';
import { ERROR_700, GREEN_700 } from './theme/Colors';

export default class SatisfiedModal extends BaseModal {
	public constructor() {
		super();
		this.autoLayout = 'VERTICAL';
		this.padding = 32;
		this.itemSpacing = 32;
		this.addComponents([
			this.titleLabel,
			this.actions,
		]);
	}

	private _titleLabel!: ILabel;

	private get titleLabel() {
		if (!this._titleLabel) {
			this._titleLabel = new Label();
			this._titleLabel.fontSize = 32;
			this._titleLabel.lineHeight = 26;
			this._titleLabel.content = 'Satisfied Modal';
		}

		return this._titleLabel;
	}

	private _actions!: IContainer;

	private get actions() {
		if (!this._actions) {
			this._actions = new Container();
			this._actions.width = 'FILL';
			this._actions.autoLayout = 'HORIZONTAL';
			this._actions.itemSpacing = 16;
			this.actions.align = 'RIGHT';
			this._actions.addComponents([
				new BaseButton('Yes', GREEN_700, 'SATISFIED_YES'),
				new BaseButton('No', ERROR_700, 'SATISFIED_NO'),
			]);
		}

		return this._actions;
	}
}
customElements.define('satisfied-modal', SatisfiedModal);
