import IBase from './IBase';
import IContainer from './IContainer';

export default abstract class Base extends HTMLElement implements IBase {
	public constructor() {
		super();
	}

	protected commitProperties(): void {
		if (this._widthChanged || this._heightChanged) {
			this.sizeChanged();
		}

		if (this._positionChanged) {
			this.positionChanged();
		}

		if (this._leftChanged || this._topChanged || this._rightChanged || this._bottomChanged) {
			this.contraintsChanged();
		}
	}

	protected sizeChanged() {
		this._widthChanged = false;
		this._heightChanged = false;
	}

	protected positionChanged() {
		this._positionChanged = false;
	}

	protected contraintsChanged() {
		this._leftChanged = false;
		this._topChanged = false;
		this._rightChanged = false;
		this._bottomChanged = false;
	}

	private _width: number | 'FILL' | 'HUG' = 'HUG';
	private _widthChanged = true;

	public get width() {
		return this._width;
	}

	public set width(value: number | 'FILL' | 'HUG') {
		if (this._width === value) {
			return;
		}

		if (value === 'FILL' || value === 'HUG') {
			this._width = value;
			this._widthChanged = true;
			this.invalidateProperties();
			return;
		}

		if (isNaN(value) || value < 0) {
			if (this._width !== 0) {
				this._width = 0;
				this._widthChanged = true;
				this.invalidateProperties();
			}

			return;
		}

		this._width = value;
		this._widthChanged = true;
		this.invalidateProperties();
	}

	private _height: number | 'FILL' | 'HUG' = 'HUG';
	private _heightChanged = true;

	public get height() {
		return this._height;
	}

	public set height(value: number | 'FILL' | 'HUG') {
		if (this._height === value) {
			return;
		}

		if (value === 'FILL' || value === 'HUG') {
			this._height = value;
			this._heightChanged = true;
			this.invalidateProperties();
			return;
		}

		if (isNaN(value) || value < 0) {
			if (this._height !== 0) {
				this._height = 0;
				this._heightChanged = true;
				this.invalidateProperties();
			}

			return;
		}

		this._height = value;
		this._heightChanged = true;
		this.invalidateProperties();
	}

	private _position: 'SCROLL_WITH_PARENT' | 'FIXED' | 'STICKY' = 'SCROLL_WITH_PARENT';
	private _positionChanged = false;

	public get position() {
		return this._position;
	}

	public set position(value: 'SCROLL_WITH_PARENT' | 'FIXED' | 'STICKY') {
		if (this._position === value) {
			return;
		}

		this._position = value;
		this._positionChanged = true;
		this.invalidateProperties();
	}

	private _left = NaN;
	private _leftChanged = false;

	public get left() {
		return this._left;
	}

	public set left(value: number) {
		if (this._left === value) {
			return;
		}

		if (Number.isNaN(this._left) && Number.isNaN(value)) {
			return;
		}

		this._left = value;
		this._leftChanged = true;
		this.invalidateProperties();
	}

	private _top = NaN;
	private _topChanged = false;

	public get top() {
		return this._top;
	}

	public set top(value: number) {
		if (this._top === value) {
			return;
		}

		if (Number.isNaN(this._top) && Number.isNaN(value)) {
			return;
		}

		this._top = value;
		this._topChanged = true;
		this.invalidateProperties();
	}

	private _right = NaN;
	private _rightChanged = false;

	public get right() {
		return this._right;
	}

	public set right(value: number) {
		if (this._right === value) {
			return;
		}

		if (Number.isNaN(this._right) && Number.isNaN(value)) {
			return;
		}

		this._right = value;
		this._rightChanged = true;
		this.invalidateProperties();
	}

	private _bottom = NaN;
	private _bottomChanged = false;

	public get bottom() {
		return this._bottom;
	}

	public set bottom(value: number) {
		if (this._bottom === value) {
			return;
		}

		if (Number.isNaN(this._bottom) && Number.isNaN(value)) {
			return;
		}

		this._bottom = value;
		this._bottomChanged = true;
		this.invalidateProperties();
	}

	protected get parent() {
		if (this.parentNode instanceof HTMLAnchorElement) {
			return this.parentNode.parentNode as unknown as IContainer;
		}

		return this.parentNode as unknown as IContainer;
	}

	protected invalidateProperties() {
		if (this.connected) {
			this.commitProperties();
		}
	}

	private connected = false;

	public connectedCallback() {
		this.connected = true;
		this.commitProperties();
	}

	public disconnectedCallback() {
		this.connected = false;
	}
}
