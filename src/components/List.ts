import IList from './IList';
import IDataRenderer from './IDataRenderer';
import DataRenderer from './DataRenderer';
import Container from './Container';
import {ObservableArray} from '../observables/ObservableArray';

export default abstract class List<Item> extends Container implements IList<Item> {
	private readonly dataRendererCache: Array<IDataRenderer<Item>>;

	private readonly listDataRendererLookup: Map<Item, IDataRenderer<Item> | undefined>;

	public constructor() {
		super();
		this.dataRendererCache = [];
		this.listDataRendererLookup = new Map();
	}

	private itemsAdded(items: Item[]) {
		this.addDataRenderers(items);
	}

	private reset() {
		this.listDataRendererLookup.forEach(dataRenderer => {
			if (dataRenderer) {
				dataRenderer.data = null;
				this.dataRendererCache.push(dataRenderer);
			}
		});
		this.removeAllComponents();
		this.listDataRendererLookup.clear();
		if (this.dataProvider) {
			this.addDataRenderers(this.dataProvider.value);
		}
	}

	private itemAdded(item: Item) {
		let dataRenderer: IDataRenderer<Item> | undefined = this.dataRendererCache.splice(0, 1)[0];
		if (dataRenderer === undefined) {
			dataRenderer = new this.DataRenderer();
		}

		dataRenderer.data = item;
		this.listDataRendererLookup.set(item, dataRenderer);
		this.addComponent(dataRenderer);
	}

	protected addDataRenderers(items: Item[]): void {
		const listDataRenderers: Array<IDataRenderer<Item>> = [];
		items.forEach(item => {
			let dataRenderer: IDataRenderer<Item> | undefined = this.dataRendererCache.splice(0, 1)[0];
			if (dataRenderer === undefined) {
				dataRenderer = new this.DataRenderer();
			}

			dataRenderer.data = item;
			this.listDataRendererLookup.set(item, dataRenderer);
			listDataRenderers.push(dataRenderer);
		});
		this.addComponents(listDataRenderers);
	}

	private _DataRenderer!: new () => IDataRenderer<Item>;

	public get DataRenderer(): new () => IDataRenderer<Item> {
		if (!this._DataRenderer) {
			this._DataRenderer = DataRenderer;
		}

		return this._DataRenderer;
	}

	public set DataRenderer(value: new () => IDataRenderer<Item>) {
		if (this._DataRenderer === value) {
			return;
		}

		this._DataRenderer = value;
		this.dataRendererCache.length = 0;
		this.listDataRendererLookup.clear();
		this.reset();
	}

	private _dataProvider: ObservableArray<Item> | null = null;

	public get dataProvider() {
		return this._dataProvider;
	}

	public set dataProvider(value: ObservableArray<Item> | null) {
		if (this._dataProvider === value) {
			return;
		}

		this._dataProvider = value;
		if (this._dataProvider) {
			this._dataProvider.itemAdded(this.itemAdded.bind(this));
			this._dataProvider.itemsAdded(this.itemsAdded.bind(this));
			this._dataProvider.itemsReset(this.reset.bind(this));
		}

		this.reset();
	}
}
