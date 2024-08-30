import IComponent from './IComponent';

export default interface IPicture extends IComponent {
	src: string | null;
}
