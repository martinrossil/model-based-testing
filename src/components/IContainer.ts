import IComponent from './IComponent';

export default interface IContainer extends IComponent {
	autoLayout: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID';
	itemSpacing: number;
	spacingMode: 'PACKED' | 'SPACE_BETWEEN';
	align: 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT' | 'LEFT' | 'CENTER' | 'RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_CENTER' | 'BOTTOM_RIGHT';
	padding: number;
	paddingLeft: number;
	paddingTop: number;
	paddingRight: number;
	paddingBottom: number;
	minGridColumnWidth: number;
	visible: boolean;
	addComponent(component: IComponent): void;
	addComponents(components: IComponent[]): void;
	removeComponent(component: IComponent): void;
	containsComponent(component: IComponent): boolean;
	removeAllComponents(): void;
}
