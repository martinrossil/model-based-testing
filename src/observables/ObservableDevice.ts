export type Device = 'mobile' | 'tablet' | 'computer';

type Listener = (value: Device) => void;

export class ObservableDevice {
	private _value: Device;

	private readonly listeners: Array<(value: Device) => void>;

	public constructor() {
		this._value = this.device;
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
		const {device} = this;
		if (this._value !== device) {
			this._value = device;
			this.listeners.forEach(listener => {
				listener(this._value);
			});
		}
	}

	private get device() {
		const width = document.documentElement.clientWidth;
		if (width <= 600) {
			return 'mobile';
		}

		if (width <= 960) {
			if (this.orientation === 'landscape') {
				return 'mobile';
			}

			return 'tablet';
		}

		if (width <= 1280) {
			return 'tablet';
		}

		return 'computer';
	}

	private get orientation() {
		if (document.documentElement.clientWidth <= document.documentElement.clientHeight) {
			return 'portrait';
		}

		return 'landscape';
	}
}

export function observableDevice() {
	return new ObservableDevice();
}
