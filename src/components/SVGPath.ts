import ISVGPath from './ISVGPath';
import SVG from './SVG';

export default class SVGPath extends SVG implements ISVGPath {
	public constructor() {
		super();
		this.svg.appendChild(this.path);
	}

	private _d = '';

	public get d(): string {
		return this._d;
	}

	public set d(value: string) {
		this._d = value;
		this.path.setAttribute('d', value);
	}

	protected _fill = '';

	public get fill(): string {
		return this._fill;
	}

	public set fill(value: string) {
		this._fill = value;
		this.path.setAttribute('fill', value);
	}

	private _fillOpacity = 1;

	public get fillOpacity(): number {
		return this._fillOpacity;
	}

	public set fillOpacity(value: number) {
		this._fillOpacity = value;
		this.path.setAttribute('fill-opacity', value.toString());
	}

	protected _stroke = '';

	public get stroke(): string {
		return this._stroke;
	}

	public set stroke(value: string) {
		this._stroke = value;
		this.path.setAttribute('stroke', value);
	}

	private _strokeWidth = NaN;

	public get strokeWidth(): number {
		return this._strokeWidth;
	}

	public set strokeWidth(value: number) {
		this._strokeWidth = value;
		this.path.setAttribute('stroke-width', value.toString());
	}

	private _strokeOpacity = 1;

	public get strokeOpacity(): number {
		return this._strokeOpacity;
	}

	public set strokeOpacity(value: number) {
		this._strokeOpacity = value;
		this.path.setAttribute('stroke-opacity', value.toString());
	}

	private _strokeLineCap: 'butt' | 'round' | 'square' = 'butt';

	public get strokeLineCap(): 'butt' | 'round' | 'square' {
		return this._strokeLineCap;
	}

	public set strokeLineCap(value: 'butt' | 'round' | 'square') {
		this._strokeLineCap = value;
		this.path.setAttribute('stroke-linecap', value);
	}

	private _strokeLineJoin: 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round' = 'miter';

	public get strokeLineJoin(): 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round' {
		return this._strokeLineJoin;
	}

	public set strokeLineJoin(value: 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round') {
		this._strokeLineJoin = value;
		this.path.setAttribute('stroke-linejoin', value);
	}

	private _path!: SVGPathElement;

	private get path(): SVGPathElement {
		if (!this._path) {
			this._path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		}

		return this._path;
	}
}
customElements.define('ft-svgpath', SVGPath);
