type Listener = (value: string) => void;

export class ObservableRoute {
	private _value: string;

	private readonly listeners: Array<(value: string) => void>;

	public constructor() {
		this._value = window.location.pathname.toLowerCase();
		this.listeners = [];
		window.addEventListener('click', this.clicked.bind(this));
		window.addEventListener('popstate', this.popped.bind(this));
	}

	public get value() {
		return this._value;
	}

	public add(listener: Listener) {
		this.listeners.push(listener);
	}

	private notifyRouteChanged() {
		this.listeners.forEach(listener => {
			listener(this.value);
		});
	}

	private popped() {
		const {location} = window;
		this._value = location.pathname.toLowerCase() + location.search.toLowerCase() + location.hash.toLowerCase();
		this.notifyRouteChanged();
	}

	private clicked(e: Event) {
		const anchor: HTMLAnchorElement | null = this.getAnchorFromEventTarget(e.target);
		if (anchor) {
			e.preventDefault();
			if (window.location.href.toLowerCase() !== anchor.href) {
				const url = new URL(anchor.href);
				this._value = url.pathname.toLowerCase() + url.search.toLowerCase() + url.hash.toLocaleLowerCase();
				window.history.pushState(null, '', this._value);
				this.notifyRouteChanged();
			}
		}
	}

	private getAnchorFromEventTarget(target: EventTarget | null) {
		if (target instanceof HTMLAnchorElement) {
			return target;
		}

		if (target instanceof Document) {
			return null;
		}

		return this.getParentAnchor(target as Node);
	}

	private getParentAnchor(target: Node): HTMLAnchorElement | null {
		const targetNode: Node = target;
		if (targetNode) {
			const parent: Node | null = targetNode.parentNode;
			if (parent) {
				return this.getAnchorFromEventTarget(parent);
			}
		}

		return null;
	}
}

export function observableRoute() {
	return new ObservableRoute();
}
