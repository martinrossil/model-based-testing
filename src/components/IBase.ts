export default interface IBase {
	width: number | 'FILL' | 'HUG';
	height: number | 'FILL' | 'HUG';
	position: 'SCROLL_WITH_PARENT' | 'FIXED' | 'STICKY';
	left: number;
	top: number;
	right: number;
	bottom: number;
}
