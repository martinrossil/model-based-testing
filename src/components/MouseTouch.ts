import IMouseTouch from './IMouseTouch';

export default class MouseTouch {
	private readonly host;

	public constructor(host: IMouseTouch) {
		this.host = host;
		this.host.addEventListener('mouseover', this.mouseOver.bind(this));
		this.host.addEventListener('mousedown', this.mouseDown.bind(this));
		this.host.addEventListener('mouseleave', this.mouseLeave.bind(this));
		this.host.addEventListener('mouseup', this.mouseUp.bind(this));
		this.host.addEventListener('touchstart', this.touchStart.bind(this), {passive: true});
		this.host.addEventListener('touchend', this.touchEnd.bind(this), {passive: true});
	}

	private touchEnded = false;

	private mouseOver() {
		if (this.touchEnded) {
			return;
		}

		this.host.hovered();
	}

	private mouseDown() {
		if (this.touchEnded) {
			return;
		}

		this.host.pressed();
	}

	private mouseLeave() {
		if (this.touchEnded) {
			return;
		}

		this.host.iddle();
	}

	private mouseUp() {
		if (this.touchEnded) {
			this.touchEnded = false;
			return;
		}

		this.host.hovered();
	}

	private touchStart(e: Event) {
		this.host.pressed();
	}

	private touchEnd() {
		this.host.iddle();
		this.touchEnded = true;
	}
}
