import { traverse, t, type NodePath, type T } from '../packages';
import { isReactFragment } from '../helpers';

export interface InsertElementSpec {
    tagName: string;
    attributes?: Record<string, string | number | boolean | null | undefined>;
    textContent?: string | null;
    children?: InsertElementSpec[];
}

export type InsertPlacement = 'append' | 'prepend' | 'index';

const VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'track', 'area']);

function toJsxAttrValue(value: string | number | boolean | null | undefined): T.JSXAttribute['value'] {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') return t.stringLiteral(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
        return t.jsxExpressionContainer(
            typeof value === 'number' ? t.numericLiteral(value) : t.booleanLiteral(value),
        );
    }
    return t.stringLiteral(String(value));
}

export function createJsxElement(spec: InsertElementSpec): T.JSXElement {
    const tagName = spec.tagName.trim() || 'div';
    const isSelfClosing = VOID_TAGS.has(tagName.toLowerCase());
    const attrs = Object.entries(spec.attributes ?? {}).map(([key, value]) =>
        t.jsxAttribute(t.jsxIdentifier(key), toJsxAttrValue(value)),
    );

    const opening = t.jsxOpeningElement(t.jsxIdentifier(tagName), attrs, isSelfClosing);
    const closing = isSelfClosing ? null : t.jsxClosingElement(t.jsxIdentifier(tagName));
    const children: Array<T.JSXText | T.JSXElement> = [];

    if (!isSelfClosing) {
        if (spec.textContent) children.push(t.jsxText(spec.textContent));
        for (const child of spec.children ?? []) children.push(createJsxElement(child));
    }

    return t.jsxElement(opening, closing, children, isSelfClosing);
}

function jsxChildren(path: NodePath<T.JSXElement>): Array<T.JSXElement | T.JSXFragment> {
    return path.node.children.filter(
        child => t.isJSXElement(child) || t.isJSXFragment(child),
    ) as Array<T.JSXElement | T.JSXFragment>;
}

export function insertElementAtPath(
    path: NodePath<T.JSXElement>,
    spec: InsertElementSpec,
    placement: InsertPlacement,
    index?: number,
): void {
    const newElement = createJsxElement(spec);

    switch (placement) {
        case 'append':
            path.node.children.push(newElement);
            return;
        case 'prepend':
            path.node.children.unshift(newElement);
            return;
        case 'index': {
            const jsx = jsxChildren(path);
            const safeIndex = Math.max(0, Math.min(index ?? jsx.length, jsx.length));
            const targetChild = jsx[safeIndex];
            if (!targetChild) {
                path.node.children.push(newElement);
                return;
            }
            const insertionIndex = path.node.children.indexOf(targetChild);
            if (insertionIndex === -1) {
                path.node.children.push(newElement);
                return;
            }
            path.node.children.splice(insertionIndex, 0, newElement);
            return;
        }
    }
}

export function removeElementAtPath(path: NodePath<T.JSXElement>): boolean {
    if (!path.parentPath || !path.parentPath.isJSXElement()) return false;
    path.remove();
    return true;
}

export function moveElementAtPath(path: NodePath<T.JSXElement>, nextIndex: number): boolean {
    const parentPath = path.parentPath;
    if (!parentPath || !parentPath.isJSXElement()) return false;

    const parent = parentPath.node;
    const siblings = parent.children.filter(
        child => t.isJSXElement(child) || t.isJSXFragment(child),
    ) as Array<T.JSXElement | T.JSXFragment>;

    const currentNode = path.node;
    const currentSiblingIndex = siblings.findIndex(child => child === currentNode);
    if (currentSiblingIndex === -1) return false;

    const boundedIndex = Math.max(0, Math.min(nextIndex, Math.max(0, siblings.length - 1)));
    if (boundedIndex === currentSiblingIndex) return false;

    const currentChildIndex = parent.children.findIndex(child => child === currentNode);
    if (currentChildIndex === -1) return false;

    parent.children.splice(currentChildIndex, 1);

    const remainingSiblings = parent.children.filter(
        child => t.isJSXElement(child) || t.isJSXFragment(child),
    ) as Array<T.JSXElement | T.JSXFragment>;

    if (boundedIndex >= remainingSiblings.length) {
        parent.children.push(currentNode);
        return true;
    }

    const targetChild = remainingSiblings[boundedIndex];
    const targetChildIndex = parent.children.findIndex(child => child === targetChild);
    if (targetChildIndex === -1) {
        parent.children.push(currentNode);
        return true;
    }

    parent.children.splice(targetChildIndex, 0, currentNode);
    return true;
}

export function moveElementRelativeToSibling(
    path: NodePath<T.JSXElement>,
    siblingPath: NodePath<T.JSXElement>,
    position: 'before' | 'after',
): boolean {
    const parentPath = path.parentPath;
    const siblingParentPath = siblingPath.parentPath;
    if (!parentPath || !siblingParentPath || !parentPath.isJSXElement() || !siblingParentPath.isJSXElement()) return false;
    if (parentPath.node !== siblingParentPath.node) return false;

    const parent = parentPath.node;
    const currentNode = path.node;
    const siblingNode = siblingPath.node;
    if (currentNode === siblingNode) return false;

    const currentChildIndex = parent.children.findIndex(child => child === currentNode);
    const siblingChildIndex = parent.children.findIndex(child => child === siblingNode);
    if (currentChildIndex === -1 || siblingChildIndex === -1) return false;

    parent.children.splice(currentChildIndex, 1);

    const nextSiblingIndex = parent.children.findIndex(child => child === siblingNode);
    if (nextSiblingIndex === -1) return false;

    const insertIndex = position === 'before' ? nextSiblingIndex : nextSiblingIndex + 1;
    parent.children.splice(insertIndex, 0, currentNode);
    return true;
}

export function moveElementByOffset(path: NodePath<T.JSXElement>, offset: -1 | 1): boolean {
    const parentPath = path.parentPath;
    if (!parentPath || !parentPath.isJSXElement()) return false;

    const parent = parentPath.node;
    const siblings = parent.children.filter(
        child => t.isJSXElement(child) || t.isJSXFragment(child),
    ) as Array<T.JSXElement | T.JSXFragment>;

    const currentNode = path.node;
    const currentSiblingIndex = siblings.findIndex(child => child === currentNode);
    if (currentSiblingIndex === -1) return false;

    const nextIndex = currentSiblingIndex + offset;
    if (nextIndex < 0 || nextIndex >= siblings.length) return false;
    return moveElementAtPath(path, nextIndex);
}

export function findNodePathByPosition(
    ast: T.File,
    line: number,
    col: number,
): NodePath<T.JSXElement> | null {
    let found: NodePath<T.JSXElement> | null = null;
    traverse(ast, {
        JSXElement(path) {
            const opening = path.node.openingElement;
            if (isReactFragment(opening)) return;
            const loc = opening.loc?.start;
            if (loc && loc.line === line && loc.column === col) {
                found = path;
                path.stop();
            }
        },
    });
    return found;
}
