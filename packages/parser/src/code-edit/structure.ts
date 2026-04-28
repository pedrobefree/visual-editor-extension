import { DATA_OID_ATTR } from '../constants';
import { generate, traverse, t, type NodePath, type T } from '../packages';
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

function parentChildren(path: NodePath<T.JSXElement>): Array<T.JSXElement['children'][number]> | null {
    const parentPath = path.parentPath;
    if (!parentPath) return null;
    if (parentPath.isJSXElement()) return parentPath.node.children;
    if (parentPath.isJSXFragment()) return parentPath.node.children;
    return null;
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
    const children = parentChildren(path);
    if (!children) return false;
    path.remove();
    return true;
}

function removeOidAttributes(node: T.JSXElement | T.JSXFragment): void {
    if (t.isJSXElement(node)) {
        node.openingElement.attributes = node.openingElement.attributes.filter(attr =>
            !(t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === DATA_OID_ATTR),
        );
    }
    const children = t.isJSXElement(node) ? node.children : node.children;
    for (const child of children) {
        if (t.isJSXElement(child) || t.isJSXFragment(child)) removeOidAttributes(child);
    }
}

function removeWhitespaceOnlyJsxText(node: T.JSXElement | T.JSXFragment): void {
    const children = t.isJSXElement(node) ? node.children : node.children;
    const nextChildren = children.filter(child => !(t.isJSXText(child) && child.value.trim() === ''));
    children.splice(0, children.length, ...nextChildren);
    for (const child of children) {
        if (t.isJSXElement(child) || t.isJSXFragment(child)) removeWhitespaceOnlyJsxText(child);
    }
}

interface ExtractedProp {
    name: string;
    value: string;
    kind: 'text' | 'attr' | 'class';
}

function propName(base: string, index: number): string {
    return index <= 1 ? base : `${base}${index}`;
}

function inferComponentProps(node: T.JSXElement | T.JSXFragment): ExtractedProp[] {
    const props: ExtractedProp[] = [];
    let textCount = 0;
    let imageCount = 0;
    let classCount = 0;

    const visit = (current: T.JSXElement | T.JSXFragment) => {
        if (t.isJSXElement(current)) {
            const classAttr = current.openingElement.attributes.find(candidate =>
                t.isJSXAttribute(candidate) &&
                t.isJSXIdentifier(candidate.name) &&
                candidate.name.name === 'className' &&
                t.isStringLiteral(candidate.value),
            ) as T.JSXAttribute | undefined;
            if (classAttr && t.isStringLiteral(classAttr.value)) {
                classCount += 1;
                const name = propName('className', classCount);
                props.push({ name, value: classAttr.value.value, kind: 'class' });
                classAttr.value = t.jsxExpressionContainer(t.identifier(name));
            }

            const tag = current.openingElement.name;
            if (t.isJSXIdentifier(tag) && tag.name === 'img') {
                imageCount += 1;
                for (const attrName of ['src', 'alt']) {
                    const attr = current.openingElement.attributes.find(candidate =>
                        t.isJSXAttribute(candidate) &&
                        t.isJSXIdentifier(candidate.name) &&
                        candidate.name.name === attrName &&
                        t.isStringLiteral(candidate.value),
                    ) as T.JSXAttribute | undefined;
                    if (!attr || !t.isStringLiteral(attr.value)) continue;
                    const name = propName(attrName === 'src' ? 'imageSrc' : 'imageAlt', imageCount);
                    props.push({ name, value: attr.value.value, kind: 'attr' });
                    attr.value = t.jsxExpressionContainer(t.identifier(name));
                }
            }

            current.children = current.children.map(child => {
                if (t.isJSXText(child) && child.value.trim()) {
                    textCount += 1;
                    const name = propName('text', textCount);
                    const value = child.value.trim();
                    props.push({ name, value, kind: 'text' });
                    return t.jsxExpressionContainer(t.identifier(name));
                }
                if (t.isJSXElement(child) || t.isJSXFragment(child)) visit(child);
                return child;
            });
            return;
        }

        current.children.forEach(child => {
            if (t.isJSXElement(child) || t.isJSXFragment(child)) visit(child);
        });
    };

    visit(node);
    return props;
}

function extractedPropsInterface(componentName: string, props: ExtractedProp[]): string {
    if (!props.length) return '';
    const fields = props.map(prop => `  ${prop.name}?: string;`).join('\n');
    return `export interface ${componentName}Props {\n${fields}\n}\n\n`;
}

function extractedPropsSignature(componentName: string, props: ExtractedProp[]): string {
    if (!props.length) return '';
    const defaults = props
        .map(prop => `${prop.name} = ${JSON.stringify(prop.value)}`)
        .join(', ');
    return `{ ${defaults} }: ${componentName}Props`;
}

export function duplicateElementAtPath(path: NodePath<T.JSXElement>): boolean {
    const children = parentChildren(path);
    const currentNode = path.node;
    const clone = t.cloneNode(currentNode, true);
    removeOidAttributes(clone);

    if (children) {
        const currentChildIndex = children.findIndex(child => child === currentNode);
        if (currentChildIndex === -1) return false;
        children.splice(currentChildIndex + 1, 0, clone);
        return true;
    }

    const parentPath = path.parentPath;
    if (!parentPath) return false;
    const fragment = t.jsxFragment(
        t.jsxOpeningFragment(),
        t.jsxClosingFragment(),
        [currentNode, clone],
    );

    if (parentPath.isReturnStatement() && parentPath.node.argument === currentNode) {
        parentPath.node.argument = fragment;
        return true;
    }

    if (parentPath.isArrowFunctionExpression() && parentPath.node.body === currentNode) {
        parentPath.node.body = fragment;
        return true;
    }

    return true;
}

export function extractElementToComponentAtPath(path: NodePath<T.JSXElement>, componentName: string): string | null {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(componentName)) return null;

    const clone = t.cloneNode(path.node, true);
    removeOidAttributes(clone);
    removeWhitespaceOnlyJsxText(clone);
    const inferredProps = inferComponentProps(clone);

    const replacement = t.jsxElement(
        t.jsxOpeningElement(
            t.jsxIdentifier(componentName),
            inferredProps.map(prop => t.jsxAttribute(t.jsxIdentifier(prop.name), t.stringLiteral(prop.value))),
            true,
        ),
        null,
        [],
        true,
    );
    path.replaceWith(replacement);

    const jsx = generate(clone, { jsescOption: { minimal: true } }).code;
    const propsInterface = extractedPropsInterface(componentName, inferredProps);
    const signature = extractedPropsSignature(componentName, inferredProps);
    return `${propsInterface}export function ${componentName}(${signature}) {\n  return (\n    ${jsx}\n  );\n}\n`;
}

export function moveElementToParentPath(
    path: NodePath<T.JSXElement>,
    parentPath: NodePath<T.JSXElement>,
    placement: InsertPlacement = 'append',
    index?: number,
): boolean {
    const sourceChildren = parentChildren(path);
    if (!sourceChildren) return false;
    if (path.node === parentPath.node) return false;

    let cursor: NodePath | null = parentPath;
    while (cursor) {
        if (cursor.node === path.node) return false;
        cursor = cursor.parentPath;
    }

    const currentNode = path.node;
    const currentChildIndex = sourceChildren.findIndex(child => child === currentNode);
    if (currentChildIndex === -1) return false;

    sourceChildren.splice(currentChildIndex, 1);
    const destination = parentPath.node.children;

    if (placement === 'prepend') {
        destination.unshift(currentNode);
        return true;
    }

    if (placement === 'index') {
        const jsx = destination.filter(
            child => t.isJSXElement(child) || t.isJSXFragment(child),
        ) as Array<T.JSXElement | T.JSXFragment>;
        const safeIndex = Math.max(0, Math.min(index ?? jsx.length, jsx.length));
        const targetChild = jsx[safeIndex];
        if (!targetChild) {
            destination.push(currentNode);
            return true;
        }
        const insertionIndex = destination.indexOf(targetChild);
        destination.splice(insertionIndex === -1 ? destination.length : insertionIndex, 0, currentNode);
        return true;
    }

    destination.push(currentNode);
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
