import Base from './Base';
import IComponent from './IComponent';
import IContainer from './IContainer';
import ILink from './ILink';
import {
	alignChildrenHorizontalPacked,
	alignChildrenHorizontalSpaceBetween,
	alignChildrenVerticalPacked,
	alignChildrenVerticalSpaceBetween,
	applyContraints,
	applyPadding,
	resetContraints,
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

export default abstract class Link extends Base implements ILink {
	public constructor() {
		super();
		this.style.display = 'contents';
		this.appendChild(this.anchor);
	}

	public addComponent(component: IComponent) {
		this.anchor.appendChild(component as unknown as Node);
	}

	public addComponents(components: IComponent[]) {
		const frag: DocumentFragment = document.createDocumentFragment();
		components.forEach(component => frag.appendChild(component as unknown as Node));
		this.anchor.appendChild(frag);
	}

	public removeComponent(component: IComponent) {
		if (this.containsComponent(component)) {
			this.anchor.removeChild(component as unknown as Node);
		}
	}

	public containsComponent(component: IComponent): boolean {
		return this.anchor.contains(component as unknown as Node);
	}

	public removeAllComponents() {
		while (this.anchor.firstChild) {
			this.removeChild(this.anchor.firstChild);
		}
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

	private autoLayoutChanged() {
		this._autoLayoutChanged = false;
		this._visibleChanged = false;
		if (this.visible) {
			this.applyAutoLayout();
		} else {
			this.applyVisibleFalse();
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

	private updateAutoLayoutHorizontal() {
		setDisplayAutolayoutHorizontalOrVertical(this.anchor, this.parent);
		applyPadding(this, this.anchor);
		this.anchor.style.flexDirection = 'row';
		this.updateChildrenHorizontal();
		this.alignHorizontal();
	}

	private updateAutoLayoutVertical() {
		setDisplayAutolayoutHorizontalOrVertical(this.anchor, this.parent);
		applyPadding(this, this.anchor);
		this.anchor.style.flexDirection = 'column';
		this.updateChildrenVertical();
		this.alignVertical();
	}

	private updateAutoLayoutGrid() {
		setDisplayAutoLayoutGrid(this.anchor, this.parent);
		applyPadding(this, this.anchor);
		this.anchor.style.flexDirection = '';
		this.updateChildrenGrid();
		this.alignGrid();
	}

	private updateAutoLayoutNone() {
		setDisplayAutolayoutNone(this.anchor, this.parent);
		resetPadding(this.anchor);
		this.updateChildrenNone();
		this.alignNone();
	}

	private alignHorizontal() {
		if (this.spacingMode === 'PACKED') {
			alignChildrenHorizontalPacked(this, this.anchor);
		} else {
			alignChildrenHorizontalSpaceBetween(this, this.anchor);
		}
	}

	private alignVertical() {
		if (this.spacingMode === 'PACKED') {
			alignChildrenVerticalPacked(this, this.anchor);
		} else {
			alignChildrenVerticalSpaceBetween(this, this.anchor);
		}
	}

	private alignGrid() {
		this.anchor.style.alignItems = 'start';
		this.anchor.style.alignContent = 'start';
	}

	private alignNone() {
		this.anchor.style.alignItems = '';
		this.anchor.style.justifyContent = '';
	}

	private updateChildrenHorizontal() {
		let child: IComponent & ElementCSSInlineStyle;
		this.anchor.childNodes.forEach(node => {
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
		this.anchor.childNodes.forEach(node => {
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
		this.anchor.childNodes.forEach(node => {
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
		this.anchor.childNodes.forEach(node => {
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

	private applyVisibleFalse() {
		this.anchor.style.display = 'none';
	}

	protected sizeChanged() {
		super.sizeChanged();
		if (this.parent.autoLayout === 'HORIZONTAL') {
			setSizeWithParentAutoLayoutHorizontal(this, this.anchor);
		} else if (this.parent.autoLayout === 'VERTICAL') {
			setSizeWithParentAutoLayoutVertical(this, this.anchor);
		} else {
			setSizeWithParentAutoLayoutNone(this, this.anchor);
		}
	}

	protected positionChanged() {
		super.positionChanged();
		if (this.position === 'SCROLL_WITH_PARENT') {
			if (this.parent.autoLayout === 'NONE') {
				this.anchor.style.position = 'absolute';
			} else {
				this.anchor.style.position = 'relative';
			}
		} else if (this.position === 'FIXED') {
			this.anchor.style.position = 'fixed';
		} else {
			this.anchor.style.position = 'sticky';
		}
	}

	protected contraintsChanged() {
		super.contraintsChanged();
		if (this.parent.autoLayout === 'NONE' || this.position === 'FIXED' || this.position === 'STICKY') {
			applyContraints(this, this.anchor);
		} else {
			resetContraints(this.anchor);
		}
	}

	private _anchor!: HTMLAnchorElement;

	public get anchor(): HTMLAnchorElement {
		if (!this._anchor) {
			this._anchor = document.createElement('a');
			this._anchor.style.display = 'inline-block';
			this._anchor.style.boxSizing = 'border-box';
			this._anchor.style.position = 'relative';
			this._anchor.style.display = 'inline-block';
			this._anchor.style.flex = 'none';
			this._anchor.style.flexGrow = '0';
			this._anchor.style.border = 'none';
			this._anchor.style.outline = 'none';
			this._anchor.style.minWidth = '0px';
			this._anchor.style.minHeight = '0px';
			this._anchor.style.textDecoration = 'none';
		}

		return this._anchor;
	}

	public get href(): string {
		return this.anchor.href;
	}

	public set href(value: string) {
		this.anchor.href = value;
	}

	private _target: '_self' | '_blank' | '_parent' | '_top' = '_self';

	public get target(): '_self' | '_blank' | '_parent' | '_top' {
		return this._target;
	}

	public set target(value: '_self' | '_blank' | '_parent' | '_top') {
		this._target = value;
		this.anchor.target = value;
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

	private _cursor: 'default' | 'pointer' = 'default';

	public get cursor() {
		return this._cursor;
	}

	public set cursor(value: 'default' | 'pointer') {
		this._cursor = value;
		this.anchor.style.cursor = value;
	}

	private _opacity = 1;

	public get opacity() {
		return this._opacity;
	}

	public set opacity(value: number) {
		if (Number.isNaN(value)) {
			this._opacity = 1;
			this.anchor.style.opacity = '';
			return;
		}

		if (value < 0) {
			this._opacity = 0;
			this.anchor.style.opacity = '0';
			return;
		}

		if (value > 1) {
			this._opacity = 1;
			this.anchor.style.opacity = '';
			return;
		}

		this._opacity = value;
		this.anchor.style.opacity = value.toString();
	}

	private _cornerRadius = 0;

	public get cornerRadius() {
		return this._cornerRadius;
	}

	public set cornerRadius(value: number) {
		if (Number.isNaN(value) || value < 0) {
			this._cornerRadius = 0;
			this.anchor.style.borderRadius = '';
			return;
		}

		this._cornerRadius = value;
		this.anchor.style.borderRadius = value + 'px';
	}

	protected get parent() {
		if (this.parentNode instanceof HTMLAnchorElement) {
			return this.parentNode.parentNode as unknown as IContainer;
		}

		return this.parentNode as unknown as IContainer;
	}

	protected _fill = '';

	public get fill() {
		return this._fill;
	}

	public set fill(value: string) {
		this._fill = value;
		this.anchor.style.background = value;
	}

	private _clipContent = false;

	public get clipContent() {
		return this._clipContent;
	}

	public set clipContent(value: boolean) {
		this._clipContent = value;
		if (value) {
			this.anchor.style.overflow = 'auto';
		} else {
			this.anchor.style.overflow = '';
		}
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
			this.anchor.style['gridTemplateColumns'] = '';
			return;
		}

		this._minGridColumnWidth = value;
		this.anchor.style['gridTemplateColumns'] = 'repeat(auto-fill, minmax(' + value + 'px, 1fr))';
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
			this.anchor.style.paddingLeft = '';
			return;
		}

		this._paddingLeft = value;
		this.anchor.style.paddingLeft = value + 'px';
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
			this.anchor.style.paddingTop = '';
			return;
		}

		this._paddingTop = value;
		this.anchor.style.paddingTop = value + 'px';
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
			this.anchor.style.paddingRight = '';
			return;
		}

		this._paddingRight = value;
		this.anchor.style.paddingRight = value + 'px';
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
			this.anchor.style.paddingBottom = '';
			return;
		}

		this._paddingBottom = value;
		this.anchor.style.paddingBottom = value + 'px';
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
				this.anchor.style['gap'] = '';
			}

			return;
		}

		this._itemSpacing = value;
		this.anchor.style['gap'] = value + 'px';
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
}
