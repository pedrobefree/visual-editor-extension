import { t, traverse, type T } from '../packages';

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
 * value with newValue. Returns true if the attribute was found and changed.
 */
export function updateNodeAttrValue(node: T.JSXElement, attrName: string, newValue: string): boolean {
    const opening = node.openingElement;
    for (const attr of opening.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name) || attr.name.name !== attrName) continue;
        if (!t.isStringLiteral(attr.value)) return false;

        attr.value.value = newValue;
        if (attr.value.extra) {
            (attr.value.extra as Record<string, unknown>).rawValue = newValue;
            (attr.value.extra as Record<string, unknown>).raw = `"${newValue}"`;
        }
        return true;
    }
    return false;
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
