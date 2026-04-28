import { t, traverse, type NodePath, type T } from '../packages';

/**
 * If the named JSX attribute's value is a single identifier expression like
 * {placeholder}, returns the identifier name. Returns null for string literals
 * or complex expressions.
 */
export function getAttrIdentifier(node: T.JSXElement, attrName: string): string | null {
    const opening = node.openingElement;
    for (const attr of opening.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name) || attr.name.name !== attrName) continue;
        if (!t.isJSXExpressionContainer(attr.value)) return null;
        if (!t.isIdentifier((attr.value as T.JSXExpressionContainer).expression)) return null;
        return ((attr.value as T.JSXExpressionContainer).expression as T.Identifier).name;
    }
    return null;
}

/**
 * Finds the named attribute on the JSX element and replaces its string-literal
 * value with newValue. Dynamic attributes are converted to a string literal
 * when the caller explicitly edits the component/template. If the attribute is
 * missing, creates it as a string literal.
 */
export function updateNodeAttrValue(node: T.JSXElement, attrName: string, newValue: string): boolean {
    const opening = node.openingElement;
    for (const attr of opening.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name) || attr.name.name !== attrName) continue;
        attr.value = t.stringLiteral(newValue);
        if (attr.value.extra) {
            (attr.value.extra as Record<string, unknown>).rawValue = newValue;
            (attr.value.extra as Record<string, unknown>).raw = `"${newValue}"`;
        }
        return true;
    }
    opening.attributes.push(t.jsxAttribute(t.jsxIdentifier(attrName), t.stringLiteral(newValue)));
    return true;
}

/**
 * If the JSXElement's only meaningful child is a single identifier expression
 * like {label} or {children}, returns the identifier name.
 * Returns null for static text, complex expressions, or mixed content.
 */
export function getSinglePropIdentifier(node: T.JSXElement): string | null {
    const meaningful = node.children.filter(child => {
        if (t.isJSXText(child)) return child.value.trim() !== '';
        if (t.isJSXExpressionContainer(child)) {
            // Skip empty expressions {/* comment */}
            return !t.isJSXEmptyExpression(child.expression);
        }
        return false;
    });

    if (meaningful.length !== 1) return null;
    const child = meaningful[0]!;
    if (!t.isJSXExpressionContainer(child)) return null;
    if (!t.isIdentifier(child.expression)) return null;
    return child.expression.name;
}

/**
 * Returns all exported PascalCase names (React component names) from an AST.
 */
export function getExportedComponentNames(ast: T.File): string[] {
    const names: string[] = [];

    traverse(ast, {
        ExportNamedDeclaration(path) {
            const decl = path.node.declaration;
            if (!decl) return;

            if (t.isVariableDeclaration(decl)) {
                for (const declarator of decl.declarations) {
                    if (t.isIdentifier(declarator.id) && /^[A-Z]/.test(declarator.id.name)) {
                        names.push(declarator.id.name);
                    }
                }
            } else if (t.isFunctionDeclaration(decl) && decl.id && /^[A-Z]/.test(decl.id.name)) {
                names.push(decl.id.name);
            }
        },
        ExportDefaultDeclaration(path) {
            const decl = path.node.declaration;
            if (t.isFunctionDeclaration(decl) && decl.id && /^[A-Z]/.test(decl.id.name)) {
                names.push(decl.id.name);
            }
        },
    });

    return names;
}

/**
 * Finds all JSX usages of any of the given component names where a specific
 * string-literal prop matches the given value. Returns the locations of the
 * matching JSXAttribute value nodes.
 */
export function findPropUsages(
    ast: T.File,
    componentNames: string[],
    propName: string,
    propValue: string,
): Array<{ line: number; col: number }> {
    const results: Array<{ line: number; col: number }> = [];
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXOpeningElement(path) {
            const nameNode = path.node.name;
            if (!t.isJSXIdentifier(nameNode)) return;
            if (!nameSet.has(nameNode.name)) return;

            for (const attr of path.node.attributes) {
                if (!t.isJSXAttribute(attr)) continue;
                if (!t.isJSXIdentifier(attr.name) || attr.name.name !== propName) continue;
                if (!t.isStringLiteral(attr.value) || attr.value.value !== propValue) continue;

                const loc = attr.value.loc?.start;
                if (loc) results.push({ line: loc.line, col: loc.column });
            }
        },
    });

    return results;
}

/**
 * Updates all string-literal prop values that match oldValue on the given
 * component names in the AST. Returns true if at least one change was made.
 */
export function updatePropValues(
    ast: T.File,
    componentNames: string[],
    propName: string,
    oldValue: string,
    newValue: string,
): boolean {
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXOpeningElement(path) {
            const nameNode = path.node.name;
            if (!t.isJSXIdentifier(nameNode)) return;
            if (!nameSet.has(nameNode.name)) return;

            for (const attr of path.node.attributes) {
                if (!t.isJSXAttribute(attr)) continue;
                if (!t.isJSXIdentifier(attr.name) || attr.name.name !== propName) continue;
                if (!t.isStringLiteral(attr.value) || attr.value.value !== oldValue) continue;

                attr.value.value = newValue;
                if (attr.value.extra) {
                    (attr.value.extra as Record<string, unknown>).rawValue = newValue;
                    (attr.value.extra as Record<string, unknown>).raw = `"${newValue}"`;
                }
                changed = true;
            }
        },
    });

    return changed;
}

export function updatePropValueAtIndex(
    ast: T.File,
    componentNames: string[],
    propName: string,
    oldValue: string | undefined,
    newValue: string,
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXOpeningElement(path) {
            if (changed) return;
            const nameNode = path.node.name;
            if (!t.isJSXIdentifier(nameNode)) return;
            if (!nameSet.has(nameNode.name)) return;

            const matchingAttr = path.node.attributes.find(attr =>
                t.isJSXAttribute(attr) &&
                t.isJSXIdentifier(attr.name) &&
                attr.name.name === propName,
            ) as T.JSXAttribute | undefined;

            if (seen !== matchIndex) {
                seen += 1;
                return;
            }

            if (matchingAttr) {
                if (!t.isStringLiteral(matchingAttr.value)) return;
                if (oldValue !== undefined && matchingAttr.value.value !== oldValue) return;

                matchingAttr.value.value = newValue;
                if (matchingAttr.value.extra) {
                    (matchingAttr.value.extra as Record<string, unknown>).rawValue = newValue;
                    (matchingAttr.value.extra as Record<string, unknown>).raw = `"${newValue}"`;
                }
            } else {
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier(propName), t.stringLiteral(newValue)));
            }
            changed = true;
            path.stop();
        },
    });

    return changed;
}

export function updatePropValueMatchingAtIndex(
    ast: T.File,
    componentNames: string[],
    propName: string,
    oldValue: string,
    newValue: string,
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXOpeningElement(path) {
            if (changed) return;
            const nameNode = path.node.name;
            if (!t.isJSXIdentifier(nameNode)) return;
            if (!nameSet.has(nameNode.name)) return;

            for (const attr of path.node.attributes) {
                if (!t.isJSXAttribute(attr)) continue;
                if (!t.isJSXIdentifier(attr.name) || attr.name.name !== propName) continue;
                if (!t.isStringLiteral(attr.value) || attr.value.value !== oldValue) continue;

                if (seen !== matchIndex) {
                    seen += 1;
                    continue;
                }

                attr.value.value = newValue;
                if (attr.value.extra) {
                    (attr.value.extra as Record<string, unknown>).rawValue = newValue;
                    (attr.value.extra as Record<string, unknown>).raw = `"${newValue}"`;
                }
                changed = true;
                path.stop();
                return;
            }
        },
    });

    return changed;
}

export function updateComponentUsageClassNameAtIndex(
    ast: T.File,
    componentNames: string[],
    className: string,
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXOpeningElement(path) {
            if (changed) return;
            const nameNode = path.node.name;
            if (!t.isJSXIdentifier(nameNode)) return;
            if (!nameSet.has(nameNode.name)) return;

            if (seen !== matchIndex) {
                seen += 1;
                return;
            }

            const attr = path.node.attributes.find(candidate =>
                t.isJSXAttribute(candidate) &&
                t.isJSXIdentifier(candidate.name) &&
                candidate.name.name === 'className',
            ) as T.JSXAttribute | undefined;

            if (attr) {
                attr.value = t.stringLiteral(className);
            } else {
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(className)));
            }
            changed = true;
            path.stop();
        },
    });

    return changed;
}

export function updateComponentUsageStringPropAtIndex(
    ast: T.File,
    componentNames: string[],
    propName: string,
    value: string,
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXOpeningElement(path) {
            if (changed) return;
            const nameNode = path.node.name;
            if (!t.isJSXIdentifier(nameNode)) return;
            if (!nameSet.has(nameNode.name)) return;

            if (seen !== matchIndex) {
                seen += 1;
                return;
            }

            const attr = path.node.attributes.find(candidate =>
                t.isJSXAttribute(candidate) &&
                t.isJSXIdentifier(candidate.name) &&
                candidate.name.name === propName,
            ) as T.JSXAttribute | undefined;

            if (attr) {
                attr.value = t.stringLiteral(value);
            } else {
                path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier(propName), t.stringLiteral(value)));
            }
            changed = true;
            path.stop();
        },
    });

    return changed;
}

function replaceUsageTextChildren(node: T.JSXElement, value: string): void {
    node.openingElement.selfClosing = false;
    const name = node.openingElement.name;
    node.closingElement = t.jsxClosingElement(t.isJSXIdentifier(name) ? t.jsxIdentifier(name.name) : t.jsxIdentifier('Component'));
    node.children = [t.jsxText(value)];
}

function usageTextContent(node: T.JSXElement): string {
    return node.children
        .map(child => t.isJSXText(child) ? child.value : '')
        .join('')
        .trim();
}

export function updateComponentUsageChildrenAtIndex(
    ast: T.File,
    componentNames: string[],
    value: string,
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXElement(path) {
            if (changed) return;
            if (!isNamedComponentUsage(path, nameSet)) return;

            if (seen !== matchIndex) {
                seen += 1;
                return;
            }

            replaceUsageTextChildren(path.node, value);
            changed = true;
            path.stop();
        },
    });

    return changed;
}

function componentUsageChildren(path: NodePath<T.JSXElement>): Array<T.JSXElement['children'][number]> | null {
    const parentPath = path.parentPath;
    if (!parentPath) return null;
    if (parentPath.isJSXElement()) return parentPath.node.children;
    if (parentPath.isJSXFragment()) return parentPath.node.children;
    return null;
}

function hasMatchingText(path: NodePath<T.JSXElement>, text?: string): boolean {
    if (!text?.trim()) return false;
    return usageTextContent(path.node) === text.trim();
}

function isNamedComponentUsage(path: NodePath<T.JSXElement>, componentNames: Set<string>): boolean {
    const nameNode = path.node.openingElement.name;
    return t.isJSXIdentifier(nameNode) && componentNames.has(nameNode.name);
}

function stripUsageOidAttributes(node: T.JSXElement): void {
    node.openingElement.attributes = node.openingElement.attributes.filter(attr =>
        !(t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'data-oid'),
    );
}

export function duplicateComponentUsageAtIndex(
    ast: T.File,
    componentNames: string[],
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXElement(path) {
            if (changed) return;
            if (!isNamedComponentUsage(path, nameSet)) return;

            if (seen !== matchIndex) {
                seen += 1;
                return;
            }

            const children = componentUsageChildren(path);
            if (!children) return;
            const currentIndex = children.findIndex(child => child === path.node);
            if (currentIndex === -1) return;

            const clone = t.cloneNode(path.node, true);
            stripUsageOidAttributes(clone);
            children.splice(currentIndex + 1, 0, clone);
            changed = true;
            path.stop();
        },
    });

    return changed;
}

export function removeComponentUsageAtIndex(
    ast: T.File,
    componentNames: string[],
    matchIndex: number,
): boolean {
    let seen = 0;
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXElement(path) {
            if (changed) return;
            if (!isNamedComponentUsage(path, nameSet)) return;

            if (seen !== matchIndex) {
                seen += 1;
                return;
            }

            const children = componentUsageChildren(path);
            if (!children) return;
            const currentIndex = children.findIndex(child => child === path.node);
            if (currentIndex === -1) return;
            children.splice(currentIndex, 1);
            changed = true;
            path.stop();
        },
    });

    return changed;
}

export function removeComponentUsageByText(
    ast: T.File,
    componentNames: string[],
    text: string,
): boolean {
    let changed = false;
    const nameSet = new Set(componentNames);

    traverse(ast, {
        JSXElement(path) {
            if (changed) return;
            if (!isNamedComponentUsage(path, nameSet)) return;
            if (!hasMatchingText(path, text)) return;

            const children = componentUsageChildren(path);
            if (!children) return;
            const currentIndex = children.findIndex(child => child === path.node);
            if (currentIndex === -1) return;
            children.splice(currentIndex, 1);
            changed = true;
            path.stop();
        },
    });

    return changed;
}
