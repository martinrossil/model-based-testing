type ItemAddedListener<Item> = (value: Item) => void;
type ItemsAddedListener<Item> = (value: Item[]) => void;
type ItemsResetListener = () => void;

export class ObservableArray<Item> {
	private _value: Item[];

	private readonly itemAddedlisteners: Array<(value: Item) => void>;

	private readonly itemsAddedlisteners: Array<(value: Item[]) => void>;

	private readonly resetlisteners: Array<(value: Item[]) => void>;

	public constructor(value: Item[] = []) {
		this._value = value;
		this.itemAddedlisteners = [];
		this.itemsAddedlisteners = [];
		this.resetlisteners = [];
	}

	public itemAdded(listener: ItemAddedListener<Item>) {
		this.itemAddedlisteners.push(listener);
	}

	public itemsAdded(listener: ItemsAddedListener<Item>) {
		this.itemsAddedlisteners.push(listener);
	}

	public itemsReset(listener: ItemsResetListener) {
		this.resetlisteners.push(listener);
	}

	public addItem(item: Item) {
		this.value.push(item);
		this.itemAddedlisteners.forEach(listener => {
			listener(item);
		});
	}

	public addItems(items: Item[]) {
		// Faster than concatination
		items.forEach(item => this.value.push(item));
		this.itemsAddedlisteners.forEach(listener => {
			listener(items);
		});
	}

	public get value() {
		return this._value;
	}

	public set value(value: Item[]) {
		if (this._value !== value) {
			this._value = value;
			this.resetlisteners.forEach(listener => {
				listener(value);
			});
		}
	}
}

export function observableArray<Item>(value: Item[] = []): ObservableArray<Item> {
	return new ObservableArray<Item>(value);
}
