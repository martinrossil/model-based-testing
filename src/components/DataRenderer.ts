import Container from './Container';
import IDataRenderer from './IDataRenderer';

export default class DataRenderer<Item> extends Container implements IDataRenderer<Item> {
	protected dataChanged(): void {
		// Override
	}

	private _data: Item | null = null;

	public get data(): Item | null {
		return this._data;
	}

	public set data(value: Item | null) {
		if (this._data === value) {
			return;
		}

		this._data = value;
		this.dataChanged();
	}
}
customElements.define('data-renderer', DataRenderer);
