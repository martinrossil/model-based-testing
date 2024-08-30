import Component from './Component';
import ILabel from './ILabel';

export default class Label extends Component implements ILabel {
	public constructor() {
		super();
		this.style.userSelect = 'none';
		this.style.pointerEvents = 'none';
		this.style.lineHeight = '20px';
		this.style.fontSize = '16px';
		this.style.fontWeight = '400';
		this.style.letterSpacing = '';
	}

	private _truncate = false;

	public get truncate() {
		return this._truncate;
	}

	public set truncate(value: boolean) {
		if (this._truncate === value) {
			return;
		}

		this._truncate = value;
		if (value) {
			this.style.overflow = 'hidden';
			this.style.textOverflow = 'ellipsis';
			this.style.whiteSpace = 'nowrap';
		} else {
			if (this.clipContent) {
				this.style.overflow = 'auto';
			} else {
				this.style.overflow = '';
			}

			this.style.textOverflow = '';
			this.style.whiteSpace = '';
		}
	}

	private _content = '';

	public get content() {
		return this._content;
	}

	public set content(value: string) {
		this._content = value;
		this.innerText = this.content;
	}

	public get fontFamily(): string {
		return this.style.fontFamily;
	}

	public set fontFamily(value: string) {
		this.style.fontFamily = value;
	}

	private _color = '';

	public get color() {
		return this._color;
	}

	public set color(value: string) {
		if (this._color === value) {
			return;
		}

		this._color = value;
		this.style.color = value;
	}

	private _lineHeight = 20;

	public get lineHeight(): number {
		return this._lineHeight;
	}

	public set lineHeight(value: number) {
		if (Number.isNaN(value) || value < 0) {
			this._lineHeight = 20;
			this.style.lineHeight = '20px';
			return;
		}

		this._lineHeight = value;
		this.style.lineHeight = value + 'px';
	}

	private _fontSize = 16;

	public get fontSize(): number {
		return this._fontSize;
	}

	public set fontSize(value: number) {
		if (Number.isNaN(value) || value < 0) {
			this._fontSize = 16;
			this.style.fontSize = '16px';
			return;
		}

		this._fontSize = value;
		this.style.fontSize = value + 'px';
	}

	private _fontWeight: 400 | 500 | 600 | 700 = 400;

	public get fontWeight(): 400 | 500 | 600 | 700 {
		return this._fontWeight;
	}

	public set fontWeight(value: 400 | 500 | 600 | 700) {
		this._fontWeight = value;
		this.style.fontWeight = value.toString();
	}

	private _letterSpacing = 0;

	public get letterSpacing(): number {
		return this._letterSpacing;
	}

	public set letterSpacing(value: number) {
		if (Number.isNaN(value)) {
			this._letterSpacing = 0;
			this.style.letterSpacing = '';
			return;
		}

		this._letterSpacing = value;
		this.style.letterSpacing = value + 'px';
	}

	public get textAlign(): 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'justify-all' | 'match-parent' {
		return this.style.textAlign as 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'justify-all' | 'match-parent';
	}

	public set textAlign(value: 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'justify-all' | 'match-parent') {
		this.style.textAlign = value;
	}
}
customElements.define('label-element', Label);
