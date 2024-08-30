type Listener<T> = (value: T) => void;

export class Observable<T> {
	private _value: T;

	private readonly listeners: Array<(value: T) => void>;

	public constructor(value: T) {
		this._value = value;
		this.listeners = [];
	}

	public add(listener: Listener<T>) {
		this.listeners.push(listener);
	}

	public get value() {
		return this._value;
	}

	public set value(value: T) {
		if (this._value !== value) {
			this._value = value;
			this.listeners.forEach(listener => {
				listener(value);
			});
		}
	}
}

export function observable<T>(value: T) {
	return new Observable<T>(value);
}
