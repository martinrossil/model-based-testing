import IComponent from './IComponent';

export default interface ILabel extends IComponent {
	content: string;
	fontFamily: string;
	color: string;
	fontSize: number;
	fontWeight: 400 | 500 | 600 | 700;
	letterSpacing: number;
	truncate: boolean;
	textAlign: 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | 'justify-all' | 'match-parent';
	lineHeight: number;
}
