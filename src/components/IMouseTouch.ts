export default interface IMouseTouch extends EventTarget {
	iddle(): void;
	hovered(): void;
	pressed(): void;
}
