import Component from './Component';
import IPicture from './IPicture';

export default abstract class Picture extends Component implements IPicture {
	public constructor() {
		super();
		this.appendChild(this.img);
	}

	private _src: string | null = null;

	public get src(): string | null {
		return this._src;
	}

	public set src(value: string | null) {
		if (this._src === value) {
			return;
		}

		this._src = value;
		this.img.style.opacity = '0';
		if (value) {
			this.img.src = value;
		}
	}

	private _img!: HTMLImageElement;

	private get img(): HTMLImageElement {
		if (!this._img) {
			this._img = document.createElement('img');
			this._img.style.appearance = 'none';
			this._img.style.border = 'none';
			this._img.style.outline = 'none';
			this._img.style.position = 'absolute';
			this._img.style.width = '100%';
			this._img.style.height = '100%';
			this._img.style.objectFit = 'cover';
			this._img.addEventListener('load', this.imageLoadComplete.bind(this));
			this._img.addEventListener('error', this.imageLoadError.bind(this));
			this._img.style.opacity = '0';
		}

		return this._img;
	}

	private imageLoadComplete(): void {
		this.img.style.opacity = '1';
	}

	private imageLoadError(): void {
		this.img.style.opacity = '0';
	}
}
