import IContainer from './IContainer';

export default interface ILink extends IContainer {
	readonly anchor: HTMLAnchorElement;
	href: string;
	target: '_self' | '_blank' | '_parent' | '_top';
}
