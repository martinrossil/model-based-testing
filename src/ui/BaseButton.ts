import Container from '../components/Container';
import ILabel from '../components/ILabel';
import Label from '../components/Label';

export default class BaseButton extends Container {
	public constructor(label: string, fill: string, clickType: string) {
		super();
		this.label.content = label;
		this.fill = fill;
		this.clickType = clickType;
		this.cursor = 'pointer';
		this.cornerRadius = 4;
		this.paddingLeft = 12;
		this.paddingRight = 12;
		this.paddingTop = 8;
		this.paddingBottom = 8;
		this.addComponent(this.label);
		this.addEventListener('click', this.clicked);
	}

	private readonly clickType: string;

	private clicked() {
		this.dispatchEvent(new CustomEvent(this.clickType, { bubbles: true }));
	}

	private _label!: ILabel;

	private get label() {
		if (!this._label) {
			this._label = new Label();
			this._label.fontWeight = 600;
		}

		return this._label;
	}
}
customElements.define('base-button', BaseButton);
