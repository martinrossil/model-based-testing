import Container from './Container';

export default abstract class Application extends Container {
	public constructor() {
		super();
		this.style.display = 'block';
		this.style.minHeight = '100%';
	}

	public get fill() {
		return this._fill;
	}

	public set fill(value: string) {
		this._fill = value;
		document.body.style.background = value;
	}
}
