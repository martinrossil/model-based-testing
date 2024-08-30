import IContainer from './IContainer';

export default interface IDataRenderer<Item> extends IContainer {
	data: Item | null;
}
