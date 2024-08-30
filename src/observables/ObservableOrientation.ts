export type Orientation = 'portrait' | 'landscape';
type Listener = (value: Orientation) => void;

export class ObservableOrientation {
	private _value: Orientation;

	private readonly listeners: Array<(value: Orientation) => void>;

	public constructor() {
		this._value = this.orientation;
		this.listeners = [];
		window.addEventListener('resize', this.resize.bind(this));
	}

	public get value() {
		return this._value;
	}

	public add(listener: Listener) {
		this.listeners.push(listener);
	}

	private resize() {
		const {orientation} = this;
		if (this._value !== orientation) {
			this._value = orientation;
			this.listeners.forEach(listener => {
				listener(orientation);
			});
		}
	}

	private get orientation(): Orientation {
		if (document.documentElement.clientWidth <= document.documentElement.clientHeight) {
			return 'portrait';
		}

		return 'landscape';
	}
}

export function observableOrientation(): ObservableOrientation {
	return new ObservableOrientation();
}
