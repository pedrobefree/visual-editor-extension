import { t, traverse, type NodePath, type T } from '../packages';

export function updateNodeTextContent(node: T.JSXElement, textContent: string): void {
    const parts = textContent.split('\n');

    if (parts.length === 1) {
        // Find the first JSXText child that has actual (non-whitespace) content.
        // Whitespace-only JSXText nodes (newlines + indentation between JSX tags)
        // must be skipped; overwriting them would inject text as a sibling of
        // existing child elements and produce concatenated output like
        // "SurnameEmail".
        const textNode = node.children.find(
            (child) => t.isJSXText(child) && child.value.trim() !== '',
        );

        if (textNode && t.isJSXText(textNode)) {
            // In-place update: touch only the text node, leave everything else.
            textNode.value = textContent;
            // Also sync extra.raw so @babel/generator doesn't fall back to the
            // stale raw string that was captured at parse time.
            if (textNode.extra) {
                (textNode.extra as Record<string, unknown>).raw = textContent;
            }
            return;
        }

        // No real JSXText child found — the content may be a JSXExpressionContainer
        // like {label} or {t('key')}.  Replacing only whitespace nodes while
        // leaving the expression intact would duplicate text (new static string
        // + resolved expression = "First nameFirst name").
        // Instead, replace the entire children list with just the new static
        // text node; the user is intentionally converting a dynamic value to a
        // static one.
        node.children = [t.jsxText(textContent)];
        return;
    }

    // Multi-line text: replace all children with alternating text / <br /> nodes.
    node.children = [];
    parts.forEach((part, index) => {
        if (part) node.children.push(t.jsxText(part));
        if (index < parts.length - 1) {
            node.children.push(
                t.jsxElement(
                    t.jsxOpeningElement(t.jsxIdentifier('br'), [], true),
                    null,
                    [],
                    true,
                ),
            );
        }
    });
}

export function setNodeTextToIdentifier(node: T.JSXElement, identifier: string): void {
    node.children = [t.jsxExpressionContainer(t.identifier(identifier))];
}

function setNodeTextToExpression(node: T.JSXElement, expression: T.Expression): void {
    node.children = [t.jsxExpressionContainer(expression)];
}

function defaultedPropPatternValue(propName: string, defaultValue?: string): T.Identifier | T.AssignmentPattern {
    const identifier = t.identifier(propName);
    if (defaultValue === undefined) return identifier;
    return t.assignmentPattern(identifier, t.stringLiteral(defaultValue));
}

function addPropToPattern(pattern: T.ObjectPattern, propName: string, defaultValue?: string): void {
    const existing = pattern.properties.find(prop =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === propName
    );
    if (existing && t.isObjectProperty(existing)) {
        if (
            defaultValue !== undefined &&
            t.isIdentifier(existing.value) &&
            existing.value.name === propName
        ) {
            existing.value = defaultedPropPatternValue(propName, defaultValue);
            existing.shorthand = false;
        }
        return;
    }

    const prop = t.objectProperty(
        t.identifier(propName),
        defaultedPropPatternValue(propName, defaultValue),
        false,
        defaultValue === undefined,
    );
    const restIndex = pattern.properties.findIndex(prop => t.isRestElement(prop));
    if (restIndex >= 0) pattern.properties.splice(restIndex, 0, prop);
    else pattern.properties.push(prop);
}

function optionalStringTypeProperty(propName: string): T.TSPropertySignature {
    const signature = t.tsPropertySignature(
        t.identifier(propName),
        t.tsTypeAnnotation(t.tsStringKeyword()),
    );
    signature.optional = true;
    return signature;
}

function addPropToTypeLiteral(typeLiteral: T.TSTypeLiteral, propName: string): void {
    if (typeLiteral.members.some(member =>
        t.isTSPropertySignature(member) &&
        t.isIdentifier(member.key) &&
        member.key.name === propName
    )) return;
    typeLiteral.members.push(optionalStringTypeProperty(propName));
}

function addOptionalStringPropToNamedType(ast: T.File, componentName: string, propName: string, referencedType?: string): void {
    const candidates = new Set([referencedType, `${componentName}Props`, 'Props'].filter(Boolean));

    traverse(ast, {
        TSInterfaceDeclaration(path) {
            if (!candidates.has(path.node.id.name)) return;
            if (path.node.body.body.some(member =>
                t.isTSPropertySignature(member) &&
                t.isIdentifier(member.key) &&
                member.key.name === propName
            )) return;
            path.node.body.body.push(optionalStringTypeProperty(propName));
            path.stop();
        },
        TSTypeAliasDeclaration(path) {
            if (!candidates.has(path.node.id.name)) return;
            if (!t.isTSTypeLiteral(path.node.typeAnnotation)) return;
            addPropToTypeLiteral(path.node.typeAnnotation, propName);
            path.stop();
        },
    });
}

function ensureObjectPatternPropType(
    ast: T.File,
    componentName: string,
    pattern: T.ObjectPattern,
    propName: string,
): void {
    if (!pattern.typeAnnotation) {
        pattern.typeAnnotation = t.tsTypeAnnotation(
            t.tsTypeLiteral([optionalStringTypeProperty(propName)]),
        );
        return;
    }

    const typeAnnotation = pattern.typeAnnotation.typeAnnotation;
    if (t.isTSTypeLiteral(typeAnnotation)) {
        addPropToTypeLiteral(typeAnnotation, propName);
        return;
    }

    if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
        addOptionalStringPropToNamedType(ast, componentName, propName, typeAnnotation.typeName.name);
    }
}

function ensureIdentifierParamPropType(
    ast: T.File,
    componentName: string,
    identifier: T.Identifier,
    propName: string,
): void {
    if (!identifier.typeAnnotation) {
        identifier.typeAnnotation = t.tsTypeAnnotation(
            t.tsTypeLiteral([optionalStringTypeProperty(propName)]),
        );
        return;
    }

    const typeAnnotation = identifier.typeAnnotation.typeAnnotation;
    if (t.isTSTypeLiteral(typeAnnotation)) {
        addPropToTypeLiteral(typeAnnotation, propName);
        return;
    }

    if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
        addOptionalStringPropToNamedType(ast, componentName, propName, typeAnnotation.typeName.name);
    }
}

function componentFunctionFromDeclarator(init: T.Expression | null | undefined): T.FunctionExpression | T.ArrowFunctionExpression | null {
    if (!init) return null;
    if (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) return init;
    if (t.isCallExpression(init)) {
        const callee = init.callee;
        const isForwardRef =
            (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'forwardRef') ||
            (t.isIdentifier(callee) && callee.name === 'forwardRef');
        if (isForwardRef) {
            const first = init.arguments[0];
            if (t.isFunctionExpression(first) || t.isArrowFunctionExpression(first)) return first;
        }
    }
    return null;
}

export function enableTextPropOverride(ast: T.File, targetNode: T.JSXElement, propName: string, defaultValue?: string): boolean {
    let changed = false;

    traverse(ast, {
        JSXElement(path) {
            if (changed) return;
            const loc = path.node.openingElement.loc?.start;
            const targetLoc = targetNode.openingElement.loc?.start;
            if (!loc || !targetLoc || loc.line !== targetLoc.line || loc.column !== targetLoc.column) return;

            let componentName = '';
            let functionNode: T.FunctionDeclaration | T.FunctionExpression | T.ArrowFunctionExpression | null = null;
            let current: NodePath | null = path.parentPath;
            while (current) {
                if (current.isFunctionDeclaration() && current.node.id && /^[A-Z]/.test(current.node.id.name)) {
                    componentName = current.node.id.name;
                    functionNode = current.node;
                    break;
                }
                if (current.isVariableDeclarator() && t.isIdentifier(current.node.id) && /^[A-Z]/.test(current.node.id.name)) {
                    componentName = current.node.id.name;
                    functionNode = componentFunctionFromDeclarator(current.node.init);
                    break;
                }
                current = current.parentPath;
            }
            if (!componentName || !functionNode) return;

            let expression: T.Expression | null = null;
            const firstParam = functionNode.params[0];
            if (!firstParam) {
                const pattern = t.objectPattern([
                    t.objectProperty(
                        t.identifier(propName),
                        defaultedPropPatternValue(propName, defaultValue),
                        false,
                        defaultValue === undefined,
                    ),
                ]);
                pattern.typeAnnotation = t.tsTypeAnnotation(
                    t.tsTypeLiteral([optionalStringTypeProperty(propName)]),
                );
                functionNode.params = [pattern];
                expression = t.identifier(propName);
            } else if (t.isObjectPattern(firstParam)) {
                addPropToPattern(firstParam, propName, defaultValue);
                ensureObjectPatternPropType(ast, componentName, firstParam, propName);
                expression = t.identifier(propName);
            } else if (t.isIdentifier(firstParam)) {
                ensureIdentifierParamPropType(ast, componentName, firstParam, propName);
                const member = t.memberExpression(t.identifier(firstParam.name), t.identifier(propName));
                expression = defaultValue === undefined
                    ? member
                    : t.logicalExpression('??', member, t.stringLiteral(defaultValue));
            } else {
                return;
            }

            setNodeTextToExpression(path.node, expression);
            changed = true;
            path.stop();
        },
    });

    return changed;
}
