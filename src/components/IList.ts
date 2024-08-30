import {ObservableArray} from '../observables/ObservableArray';
import IContainer from './IContainer';
import IDataRenderer from './IDataRenderer';

export default interface IList<Item> extends IContainer {
	dataProvider: ObservableArray<Item> | null;
	DataRenderer: new () => IDataRenderer<Item>;
}
