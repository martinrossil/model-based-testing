import Base from './Base';
import IComponent from './IComponent';
import {applyContraints, resetContraints, setSizeWithParentAutoLayoutHorizontal, setSizeWithParentAutoLayoutNone, setSizeWithParentAutoLayoutVertical} from './helpers';

export default abstract class Component extends Base implements IComponent {
	public constructor() {
		super();
		this.style.boxSizing = 'border-box';
		this.style.position = 'relative';
		this.style.display = 'inline-block';
		this.style.flex = 'none';
		this.style.flexGrow = '0';
		this.style.border = 'none';
		this.style.outline = 'none';
		this.style.minWidth = '0';
		this.style.minHeight = '0';
	}

	protected sizeChanged() {
		super.sizeChanged();
		if (this.parent.autoLayout === 'HORIZONTAL') {
			setSizeWithParentAutoLayoutHorizontal(this, this);
		} else if (this.parent.autoLayout === 'VERTICAL') {
			setSizeWithParentAutoLayoutVertical(this, this);
		} else {
			setSizeWithParentAutoLayoutNone(this, this);
		}
	}

	protected positionChanged() {
		super.positionChanged();
		if (this.position === 'SCROLL_WITH_PARENT') {
			if (this.parent.autoLayout === 'NONE') {
				this.style.position = 'absolute';
			} else {
				this.style.position = 'relative';
			}
		} else if (this.position === 'FIXED') {
			this.style.position = 'fixed';
		} else {
			this.style.position = 'sticky';
		}
	}

	protected contraintsChanged() {
		super.contraintsChanged();
		if (this.parent.autoLayout === 'NONE' || this.position === 'FIXED' || this.position === 'STICKY') {
			applyContraints(this, this);
		} else {
			resetContraints(this);
		}
	}

	private _cursor: 'default' | 'pointer' = 'default';

	public get cursor() {
		return this._cursor;
	}

	public set cursor(value: 'default' | 'pointer') {
		this._cursor = value;
		this.style.cursor = value;
	}

	private _opacity = 1;

	public get opacity() {
		return this._opacity;
	}

	public set opacity(value: number) {
		if (Number.isNaN(value)) {
			this._opacity = 1;
			this.style.opacity = '';
			return;
		}

		if (value < 0) {
			this._opacity = 0;
			this.style.opacity = '0';
			return;
		}

		if (value > 1) {
			this._opacity = 1;
			this.style.opacity = '';
			return;
		}

		this._opacity = value;
		this.style.opacity = value.toString();
	}

	private _cornerRadius = 0;

	public get cornerRadius() {
		return this._cornerRadius;
	}

	public set cornerRadius(value: number) {
		if (Number.isNaN(value) || value < 0) {
			this._cornerRadius = 0;
			this.style.borderRadius = '';
			return;
		}

		this._cornerRadius = value;
		this.style.borderRadius = value + 'px';
	}

	protected _fill = '';

	public get fill() {
		return this._fill;
	}

	public set fill(value: string) {
		this._fill = value;
		this.style.background = value;
	}

	private _clipContent = false;

	public get clipContent() {
		return this._clipContent;
	}

	public set clipContent(value: boolean) {
		this._clipContent = value;
		if (value) {
			this.style.overflow = 'auto';
		} else {
			this.style.overflow = '';
		}
	}
}
