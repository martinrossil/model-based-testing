import IBase from './IBase';

export default interface IComponent extends IBase {
	cursor: 'default' | 'pointer';
	opacity: number;
	cornerRadius: number;
	fill: string;
	clipContent: boolean;
}
