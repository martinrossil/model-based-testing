import IComponent from './IComponent';
import IContainer from './IContainer';

export function resetPadding(target: ElementCSSInlineStyle) {
	target.style.padding = '';
}

export function applyPadding(container: IContainer, target: ElementCSSInlineStyle) {
	target.style.paddingLeft = container.paddingLeft + 'px';
	target.style.paddingTop = container.paddingTop + 'px';
	target.style.paddingRight = container.paddingRight + 'px';
	target.style.paddingBottom = container.paddingBottom + 'px';
}

export function setDisplayAutolayoutHorizontalOrVertical(target: ElementCSSInlineStyle, parent: IContainer) {
	const parentElement = parent as unknown as HTMLElement;
	if (parentElement === document.body) {
		target.style.display = 'flex';
	} else {
		target.style.display = 'inline-flex';
	}
}

export function setDisplayAutoLayoutGrid(target: ElementCSSInlineStyle, parent: IContainer) {
	const parentElement = parent as unknown as HTMLElement;
	if (parentElement === document.body) {
		target.style.display = 'grid';
	} else {
		target.style.display = 'inline-grid';
	}
}

export function setDisplayAutolayoutNone(target: ElementCSSInlineStyle, parent: IContainer) {
	const parentElement = parent as unknown as HTMLElement;
	if (parentElement === document.body) {
		target.style.display = 'block';
	} else {
		target.style.display = 'inline-block';
	}
}

export function setSizeWithParentAutoLayoutHorizontal(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		setSizeWithParentAutoLayoutHorizontalScrollWithParent(component, target);
	} else if (component.position === 'STICKY') {
		setSizeWithParentAutoLayoutHorizontalSticky(component, target);
	} else {
		setSizeWithParentAutoLayoutHorizontalFixed(component, target);
	}
}

export function setSizeWithParentAutoLayoutGrid(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		setSizeWithParentAutoLayoutGridScrollWithParent(target);
	}
}

function setSizeWithParentAutoLayoutGridScrollWithParent(target: ElementCSSInlineStyle) {
	target.style.width = '';
	target.style.flexGrow = '1';
	target.style.flexBasis = '0%';
	target.style.height = '';
	target.style.alignSelf = '';
}

function setSizeWithParentAutoLayoutHorizontalScrollWithParent(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width === 'FILL') {
		target.style.width = '';
		target.style.flexGrow = '1';
		target.style.flexBasis = '0%';
	} else if (component.width === 'HUG') {
		target.style.width = '';
		target.style.flexGrow = '0';
	} else {
		target.style.width = component.width + 'px';
		target.style.flexGrow = '0';
	}

	if (component.height === 'FILL') {
		target.style.height = '';
		target.style.alignSelf = 'stretch';
	} else if (component.height === 'HUG') {
		target.style.height = '';
		target.style.alignSelf = '';
	} else {
		target.style.height = component.height + 'px';
		target.style.alignSelf = '';
	}
}

function setSizeWithParentAutoLayoutHorizontalSticky(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width === 'FILL') {
		target.style.width = '';
		target.style.flexGrow = '1';
		target.style.flexBasis = '0%';
	} else if (component.width === 'HUG') {
		target.style.width = '';
		target.style.flexGrow = '0';
	} else {
		target.style.width = component.width + 'px';
		target.style.flexGrow = '0';
	}

	if (component.height === 'FILL') {
		target.style.height = '';
		target.style.alignSelf = 'stretch';
	} else if (component.height === 'HUG') {
		target.style.height = '';
		target.style.alignSelf = '';
	} else {
		target.style.height = component.height + 'px';
		target.style.alignSelf = '';
	}
}

function setSizeWithParentAutoLayoutHorizontalFixed(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width !== 'FILL' && component.width !== 'HUG' && !isNaN(component.width)) {
		target.style.width = component.width + 'px';
	} else {
		target.style.width = '';
	}

	if (component.height !== 'FILL' && component.height !== 'HUG' && !isNaN(component.height)) {
		target.style.height = component.height + 'px';
	} else {
		target.style.height = '';
	}
}

export function setSizeWithParentAutoLayoutVertical(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		setSizeWithParentAutoLayoutVerticalScrollWithParent(component, target);
	} else if (component.position === 'STICKY') {
		setSizeWithParentAutoLayoutVerticalSticky(component, target);
	} else {
		setSizeWithParentAutoLayoutVerticalFixed(component, target);
	}
}

function setSizeWithParentAutoLayoutVerticalScrollWithParent(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width === 'FILL') {
		target.style.width = '';
		target.style.alignSelf = 'stretch';
	} else if (component.width === 'HUG') {
		target.style.width = '';
		target.style.alignSelf = '';
	} else {
		target.style.width = component.width + 'px';
		target.style.alignSelf = '';
	}

	if (component.height === 'FILL') {
		target.style.height = '';
		target.style.flexGrow = '1';
	} else if (component.height === 'HUG') {
		target.style.height = '';
		target.style.flexGrow = '0';
	} else {
		target.style.height = component.height + 'px';
		target.style.flexGrow = '0';
	}
}

function setSizeWithParentAutoLayoutVerticalSticky(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width === 'FILL') {
		target.style.width = '';
		target.style.alignSelf = 'stretch';
	} else if (component.width === 'HUG') {
		target.style.width = '';
		target.style.alignSelf = '';
	} else {
		target.style.width = component.width + 'px';
		target.style.alignSelf = '';
	}

	if (component.height === 'FILL') {
		target.style.height = '';
		target.style.flexGrow = '1';
	} else if (component.height === 'HUG') {
		target.style.height = '';
		target.style.flexGrow = '0';
	} else {
		target.style.height = component.height + 'px';
		target.style.flexGrow = '0';
	}
}

function setSizeWithParentAutoLayoutVerticalFixed(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width !== 'FILL' && component.width !== 'HUG' && !isNaN(component.width)) {
		target.style.width = component.width + 'px';
	} else {
		target.style.width = '';
	}

	if (component.height !== 'FILL' && component.height !== 'HUG' && !isNaN(component.height)) {
		target.style.height = component.height + 'px';
	} else {
		target.style.height = '';
	}
}

export function setSizeWithParentAutoLayoutNone(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.width !== 'FILL' && component.width !== 'HUG') {
		if (!isNaN(component.left) && !isNaN(component.right)) {
			target.style.width = '';
		} else {
			target.style.width = component.width + 'px';
		}
	} else {
		target.style.width = '';
	}

	if (component.height !== 'FILL' && component.height !== 'HUG') {
		if (!isNaN(component.top) && !isNaN(component.bottom)) {
			target.style.height = '';
		} else {
			target.style.height = component.height + 'px';
		}
	} else {
		target.style.height = '';
	}
}

export function setContraintsWithParentAutoLayoutHorizontal(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		resetContraints(target);
	} else {
		applyContraints(component, target);
	}
}

export function setContraintsWithParentAutoLayoutVertical(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		resetContraints(target);
	} else {
		applyContraints(component, target);
	}
}

export function setContraintsWithParentAutoLayoutGrid(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		resetContraints(target);
	} else {
		applyContraints(component, target);
	}
}

export function setPositionWithParentAutoLayoutHorizontal(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		target.style.position = 'relative';
	} else if (component.position === 'STICKY') {
		target.style.position = 'sticky';
	} else {
		target.style.position = 'fixed';
	}
}

export function setPositionWithParentAutoLayoutVertical(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		target.style.position = 'relative';
	} else if (component.position === 'STICKY') {
		target.style.position = 'sticky';
	} else {
		target.style.position = 'fixed';
	}
}

export function setPositionWithParentAutoLayoutGrid(component: IComponent, target: ElementCSSInlineStyle) {
	if (component.position === 'SCROLL_WITH_PARENT') {
		target.style.position = 'relative';
	} else if (component.position === 'STICKY') {
		target.style.position = 'sticky';
	} else {
		target.style.position = 'fixed';
	}
}

export function resetContraints(target: ElementCSSInlineStyle) {
	target.style.left = '';
	target.style.top = '';
	target.style.right = '';
	target.style.bottom = '';
}

export function applyContraints(component: IComponent, target: ElementCSSInlineStyle) {
	if (isNaN(component.left)) {
		target.style.left = '';
	} else {
		target.style.left = component.left + 'px';
	}

	if (isNaN(component.top)) {
		target.style.top = '';
	} else {
		target.style.top = component.top + 'px';
	}

	if (isNaN(component.right)) {
		target.style.right = '';
	} else {
		target.style.right = component.right + 'px';
	}

	if (isNaN(component.bottom)) {
		target.style.bottom = '';
	} else {
		target.style.bottom = component.bottom + 'px';
	}
}

export function alignChildrenHorizontalPacked(container: IContainer, target: ElementCSSInlineStyle) {
	if (container.align === 'TOP_LEFT') {
		target.style.alignItems = 'flex-start';
		target.style.justifyContent = '';
	} else if (container.align === 'TOP_CENTER') {
		target.style.alignItems = 'flex-start';
		target.style.justifyContent = 'center';
	} else if (container.align === 'TOP_RIGHT') {
		target.style.alignItems = 'flex-start';
		target.style.justifyContent = 'flex-end';
	} else if (container.align === 'LEFT') {
		target.style.alignItems = 'center';
		target.style.justifyContent = '';
	} else if (container.align === 'CENTER') {
		target.style.alignItems = 'center';
		target.style.justifyContent = 'center';
	} else if (container.align === 'RIGHT') {
		target.style.alignItems = 'center';
		target.style.justifyContent = 'flex-end';
	} else if (container.align === 'BOTTOM_LEFT') {
		target.style.alignItems = 'flex-end';
		target.style.justifyContent = '';
	} else if (container.align === 'BOTTOM_CENTER') {
		target.style.alignItems = 'flex-end';
		target.style.justifyContent = 'center';
	} else {
		target.style.alignItems = 'flex-end';
		target.style.justifyContent = 'flex-end';
	}
}

export function alignChildrenVerticalPacked(container: IContainer, target: ElementCSSInlineStyle) {
	if (container.align === 'TOP_LEFT') {
		target.style.alignItems = 'flex-start';
		target.style.justifyContent = '';
	} else if (container.align === 'TOP_CENTER') {
		target.style.alignItems = 'center';
		target.style.justifyContent = '';
	} else if (container.align === 'TOP_RIGHT') {
		target.style.alignItems = 'flex-end';
		target.style.justifyContent = '';
	} else if (container.align === 'LEFT') {
		target.style.alignItems = 'flex-start';
		target.style.justifyContent = 'center';
	} else if (container.align === 'CENTER') {
		target.style.alignItems = 'center';
		target.style.justifyContent = 'center';
	} else if (container.align === 'RIGHT') {
		target.style.alignItems = 'flex-end';
		target.style.justifyContent = 'center';
	} else if (container.align === 'BOTTOM_LEFT') {
		target.style.alignItems = 'flex-start';
		target.style.justifyContent = 'flex-end';
	} else if (container.align === 'BOTTOM_CENTER') {
		target.style.alignItems = 'center';
		target.style.justifyContent = 'flex-end';
	} else {
		target.style.alignItems = 'flex-end';
		target.style.justifyContent = 'flex-end';
	}
}

export function alignChildrenHorizontalSpaceBetween(container: IContainer, target: ElementCSSInlineStyle) {
	if (container.align === 'TOP_LEFT' || container.align === 'TOP_CENTER' || container.align === 'TOP_RIGHT') {
		target.style.alignItems = 'flex-start';
	} else if (container.align === 'LEFT' || container.align === 'CENTER' || container.align === 'RIGHT') {
		target.style.alignItems = 'center';
	} else {
		target.style.alignItems = 'flex-end';
	}

	target.style.justifyContent = 'space-between';
}

export function alignChildrenVerticalSpaceBetween(container: IContainer, target: ElementCSSInlineStyle) {
	if (container.align === 'TOP_LEFT' || container.align === 'LEFT' || container.align === 'BOTTOM_LEFT') {
		target.style.alignItems = 'flex-start';
	} else if (container.align === 'TOP_CENTER' || container.align === 'CENTER' || container.align === 'BOTTOM_CENTER') {
		target.style.alignItems = 'center';
	} else {
		target.style.alignItems = 'flex-end';
	}

	target.style.justifyContent = 'space-between';
}
