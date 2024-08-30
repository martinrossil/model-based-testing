import ISVG from './ISVG';

export default interface ISVGPath extends ISVG {
	d: string;
	fill: string;
	fillOpacity: number;
	stroke: string;
	strokeWidth: number;
	strokeOpacity: number;
	strokeLineCap: 'butt' | 'round' | 'square';
	strokeLineJoin: 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round';
}
