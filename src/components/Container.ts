import Component from './Component';
import IComponent from './IComponent';
import IContainer from './IContainer';
import Link from './Link';
import {
	alignChildrenHorizontalPacked,
	alignChildrenHorizontalSpaceBetween,
	alignChildrenVerticalPacked,
	alignChildrenVerticalSpaceBetween,
	applyContraints,
	applyPadding,
	resetPadding,
	setContraintsWithParentAutoLayoutGrid,
	setContraintsWithParentAutoLayoutHorizontal,
	setContraintsWithParentAutoLayoutVertical,
	setDisplayAutoLayoutGrid,
	setDisplayAutolayoutHorizontalOrVertical,
	setDisplayAutolayoutNone,
	setPositionWithParentAutoLayoutGrid,
	setPositionWithParentAutoLayoutHorizontal,
	setPositionWithParentAutoLayoutVertical,
	setSizeWithParentAutoLayoutGrid,
	setSizeWithParentAutoLayoutHorizontal,
	setSizeWithParentAutoLayoutNone,
	setSizeWithParentAutoLayoutVertical,
} from './helpers';

export default class Container extends Component implements IContainer {
	public constructor() {
		super();
	}

	protected commitProperties(): void {
		super.commitProperties();
		if (this._autoLayoutChanged || this._visibleChanged) {
			this.autoLayoutChanged();
		}

		if (this._alignChanged || this._spacingModeChanged) {
			this.alignOrSpacingModeChanged();
		}
	}

	private alignOrSpacingModeChanged() {
		this._alignChanged = false;
		this._spacingModeChanged = false;
		if (this.autoLayout === 'HORIZONTAL') {
			this.alignHorizontal();
		} else if (this.autoLayout === 'VERTICAL') {
			this.alignVertical();
		} else {
			this.alignNone();
		}
	}

	private autoLayoutChanged() {
		this._autoLayoutChanged = false;
		this._visibleChanged = false;
		if (this.visible) {
			this.applyAutoLayout();
		} else {
			this.applyVisibleFalse();
		}
	}

	private applyAutoLayout() {
		if (this.autoLayout === 'HORIZONTAL') {
			this.updateAutoLayoutHorizontal();
		} else if (this.autoLayout === 'VERTICAL') {
			this.updateAutoLayoutVertical();
		} else if (this.autoLayout === 'GRID') {
			this.updateAutoLayoutGrid();
		} else {
			this.updateAutoLayoutNone();
		}
	}

	private applyVisibleFalse() {
		this.style.display = 'none';
	}

	private updateAutoLayoutHorizontal() {
		setDisplayAutolayoutHorizontalOrVertical(this, this.parent);
		applyPadding(this, this);
		this.style.flexDirection = 'row';
		this.updateChildrenHorizontal();
		this.alignHorizontal();
	}

	private updateAutoLayoutVertical() {
		setDisplayAutolayoutHorizontalOrVertical(this, this.parent);
		applyPadding(this, this);
		this.style.flexDirection = 'column';
		this.updateChildrenVertical();
		this.alignVertical();
	}

	private updateAutoLayoutGrid() {
		setDisplayAutoLayoutGrid(this, this.parent);
		applyPadding(this, this);
		this.style.flexDirection = '';
		this.updateChildrenGrid();
		this.alignGrid();
	}

	private updateAutoLayoutNone() {
		setDisplayAutolayoutNone(this, this.parent);
		resetPadding(this);
		this.updateChildrenNone();
		this.alignNone();
	}

	private updateChildrenHorizontal() {
		let child: IComponent & ElementCSSInlineStyle;
		this.childNodes.forEach(node => {
			child = node as unknown as IComponent & ElementCSSInlineStyle;
			if (child instanceof Link) {
				setSizeWithParentAutoLayoutHorizontal(child, child.anchor);
				setContraintsWithParentAutoLayoutHorizontal(child, child.anchor);
				setPositionWithParentAutoLayoutHorizontal(child, child.anchor);
			} else {
				setSizeWithParentAutoLayoutHorizontal(child, child);
				setContraintsWithParentAutoLayoutHorizontal(child, child);
				setPositionWithParentAutoLayoutHorizontal(child, child);
			}
		});
	}

	private updateChildrenVertical() {
		let child: IComponent & ElementCSSInlineStyle;
		this.childNodes.forEach(node => {
			child = node as unknown as IComponent & ElementCSSInlineStyle;
			if (child instanceof Link) {
				setSizeWithParentAutoLayoutVertical(child, child.anchor);
				setContraintsWithParentAutoLayoutVertical(child, child.anchor);
				setPositionWithParentAutoLayoutVertical(child, child.anchor);
			} else {
				setSizeWithParentAutoLayoutVertical(child, child);
				setContraintsWithParentAutoLayoutVertical(child, child);
				setPositionWithParentAutoLayoutVertical(child, child);
			}
		});
	}

	private updateChildrenGrid() {
		let child: IComponent & ElementCSSInlineStyle;
		this.childNodes.forEach(node => {
			child = node as unknown as IComponent & ElementCSSInlineStyle;
			if (child instanceof Link) {
				setSizeWithParentAutoLayoutGrid(child, child.anchor);
				setContraintsWithParentAutoLayoutGrid(child, child.anchor);
				setPositionWithParentAutoLayoutGrid(child, child.anchor);
			} else {
				setSizeWithParentAutoLayoutGrid(child, child);
				setContraintsWithParentAutoLayoutGrid(child, child);
				setPositionWithParentAutoLayoutGrid(child, child);
			}
		});
	}

	private updateChildrenNone() {
		let child: IComponent & ElementCSSInlineStyle;
		this.childNodes.forEach(node => {
			child = node as unknown as IComponent & ElementCSSInlineStyle;
			if (child instanceof Link) {
				if (child.position === 'SCROLL_WITH_PARENT') {
					child.anchor.style.position = 'absolute';
				}

				setSizeWithParentAutoLayoutNone(child, child.anchor);
				applyContraints(child, child.anchor);
			} else {
				if (child.position === 'SCROLL_WITH_PARENT') {
					child.style.position = 'absolute';
				}

				setSizeWithParentAutoLayoutNone(child, child);
				applyContraints(child, child);
			}
		});
	}

	private alignHorizontal() {
		if (this.spacingMode === 'PACKED') {
			alignChildrenHorizontalPacked(this, this);
		} else {
			alignChildrenHorizontalSpaceBetween(this, this);
		}
	}

	private alignVertical() {
		if (this.spacingMode === 'PACKED') {
			alignChildrenVerticalPacked(this, this);
		} else {
			alignChildrenVerticalSpaceBetween(this, this);
		}
	}

	private alignGrid() {
		this.style.alignItems = 'start';
		this.style.alignContent = 'start';
	}

	private alignNone() {
		this.style.alignItems = '';
		this.style.justifyContent = '';
	}

	public addComponent(component: IComponent) {
		this.appendChild(component as unknown as Node);
	}

	public addComponents(components: IComponent[]) {
		const frag: DocumentFragment = document.createDocumentFragment();
		components.forEach(component => frag.appendChild(component as unknown as Node));
		this.appendChild(frag);
	}

	public removeComponent(component: IComponent) {
		if (this.containsComponent(component)) {
			this.removeChild(component as unknown as Node);
		}
	}

	public containsComponent(component: IComponent): boolean {
		return this.contains(component as unknown as Node);
	}

	public removeAllComponents() {
		while (this.firstChild) {
			this.removeChild(this.firstChild);
		}
	}

	private _spacingMode: 'PACKED' | 'SPACE_BETWEEN' = 'PACKED';

	private _spacingModeChanged = true;

	public get spacingMode() {
		return this._spacingMode;
	}

	public set spacingMode(value: 'PACKED' | 'SPACE_BETWEEN') {
		if (this._spacingMode === value) {
			return;
		}

		this._spacingMode = value;
		this._spacingModeChanged = true;
		this.invalidateProperties();
	}

	private _align: 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT' | 'LEFT' | 'CENTER' | 'RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_CENTER' | 'BOTTOM_RIGHT' = 'TOP_LEFT';

	private _alignChanged = true;

	public get align() {
		return this._align;
	}

	public set align(value: 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT' | 'LEFT' | 'CENTER' | 'RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_CENTER' | 'BOTTOM_RIGHT') {
		if (this._align === value) {
			return;
		}

		this._align = value;
		this._alignChanged = true;
		this.invalidateProperties();
	}

	private _itemSpacing = 0;

	public get itemSpacing() {
		return this._itemSpacing;
	}

	public set itemSpacing(value: number) {
		if (this._itemSpacing === value) {
			return;
		}

		if (Number.isNaN(value) || value < 0) {
			if (this._itemSpacing !== 0) {
				this._itemSpacing = 0;
				this.style['gap'] = '';
			}

			return;
		}

		this._itemSpacing = value;
		this.style['gap'] = value + 'px';
	}

	private _autoLayout: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID' = 'HORIZONTAL';

	private _autoLayoutChanged = true;

	public get autoLayout() {
		return this._autoLayout;
	}

	public set autoLayout(value: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | 'GRID') {
		if (this._autoLayout === value) {
			return;
		}

		this._autoLayout = value;
		this._autoLayoutChanged = true;
		this.invalidateProperties();
	}

	private _padding = 0;

	public get padding() {
		return this._padding;
	}

	public set padding(value: number) {
		if (isNaN(value) || value < 0) {
			this._padding = 0;
			this.paddingLeft = 0;
			this.paddingTop = 0;
			this.paddingRight = 0;
			this.paddingBottom = 0;
			return;
		}

		this._padding = value;
		this.paddingLeft = value;
		this.paddingTop = value;
		this.paddingRight = value;
		this.paddingBottom = value;
	}

	private _paddingLeft = 0;

	public get paddingLeft() {
		return this._paddingLeft;
	}

	public set paddingLeft(value: number) {
		if (this._paddingLeft === value) {
			return;
		}

		if (Number.isNaN(value) || value < 0) {
			this._paddingLeft = 0;
			this.style.paddingLeft = '';
			return;
		}

		this._paddingLeft = value;
		this.style.paddingLeft = value + 'px';
	}

	private _paddingTop = 0;

	public get paddingTop() {
		return this._paddingTop;
	}

	public set paddingTop(value: number) {
		if (this._paddingTop === value) {
			return;
		}

		if (Number.isNaN(value) || value < 0) {
			this._paddingTop = 0;
			this.style.paddingTop = '';
			return;
		}

		this._paddingTop = value;
		this.style.paddingTop = value + 'px';
	}

	private _paddingRight = 0;

	public get paddingRight() {
		return this._paddingRight;
	}

	public set paddingRight(value: number) {
		if (this._paddingRight === value) {
			return;
		}

		if (Number.isNaN(value) || value < 0) {
			this._paddingRight = 0;
			this.style.paddingRight = '';
			return;
		}

		this._paddingRight = value;
		this.style.paddingRight = value + 'px';
	}

	private _paddingBottom = 0;

	public get paddingBottom() {
		return this._paddingBottom;
	}

	public set paddingBottom(value: number) {
		if (this._paddingBottom === value) {
			return;
		}

		if (Number.isNaN(value) || value < 0) {
			this._paddingBottom = 0;
			this.style.paddingBottom = '';
			return;
		}

		this._paddingBottom = value;
		this.style.paddingBottom = value + 'px';
	}

	private _minGridColumnWidth = NaN;

	public get minGridColumnWidth() {
		return this._minGridColumnWidth;
	}

	public set minGridColumnWidth(value: number) {
		if (this._minGridColumnWidth === value) {
			return;
		}

		if (Number.isNaN(this._minGridColumnWidth) && Number.isNaN(value)) {
			return;
		}

		if (isNaN(value) || value < 0) {
			this._minGridColumnWidth = NaN;
			this.style.gridTemplateColumns = '';
			return;
		}

		this._minGridColumnWidth = value;
		this.style['gridTemplateColumns'] = 'repeat(auto-fill, minmax(' + value + 'px, 1fr))';
	}

	private _visible = true;

	private _visibleChanged = false;

	public get visible() {
		return this._visible;
	}

	public set visible(value: boolean) {
		if (this._visible === value) {
			return;
		}

		this._visible = value;
		this._visibleChanged = true;
		this.invalidateProperties();
	}
}
customElements.define('container-element', Container);
