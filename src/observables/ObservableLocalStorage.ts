type Listener = (value: string | null) => void;

export class ObservableLocalStorage {
	private readonly key;

	private _value: string | null;

	private readonly listeners: Array<(value: string | null) => void>;

	public constructor(key: string) {
		this.key = key;
		this._value = window.localStorage.getItem(key);
		this.listeners = [];
	}

	public add(listener: Listener) {
		this.listeners.push(listener);
	}

	public get value() {
		return this._value;
	}

	public set value(value: string | null) {
		try {
			if (value === null) {
				window.localStorage.removeItem(this.key);
				if (this._value !== null) {
					this._value = null;
					this.listeners.forEach(listener => {
						listener(value);
					});
				}
			} else if (this._value !== value) {
				window.localStorage.setItem(this.key, value);
				this._value = value;
				this.listeners.forEach(listener => {
					listener(value);
				});
			}
		} catch (error) {}
	}
}

export function observableLocalStorage(key: string) {
	return new ObservableLocalStorage(key);
}
