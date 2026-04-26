import { t, type T } from '../packages';
import { customTwMerge } from '../tw-merge';
import { traverse, type NodePath } from '../packages';

export function addClassToNode(node: T.JSXElement, className: string): void {
    const opening = node.openingElement;
    const classNameAttr = opening.attributes.find(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === 'className',
    ) as T.JSXAttribute | undefined;

    if (classNameAttr) {
        if (t.isStringLiteral(classNameAttr.value)) {
            classNameAttr.value.value = customTwMerge(classNameAttr.value.value, className);
        } else if (
            classNameAttr.value &&
            t.isJSXExpressionContainer(classNameAttr.value) &&
            t.isCallExpression(classNameAttr.value.expression)
        ) {
            classNameAttr.value.expression.arguments.push(t.stringLiteral(className));
        }
    } else {
        opening.attributes.push(
            t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(className)),
        );
    }
}

export function replaceNodeClasses(node: T.JSXElement, className: string): void {
    const opening = node.openingElement;
    const classNameAttr = opening.attributes.find(
        (attr) => t.isJSXAttribute(attr) && attr.name.name === 'className',
    ) as T.JSXAttribute | undefined;

    if (classNameAttr) {
        classNameAttr.value = t.stringLiteral(className);
    } else {
        opening.attributes.push(
            t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(className)),
        );
    }
}

function classNameAttr(opening: T.JSXOpeningElement): T.JSXAttribute | undefined {
    return opening.attributes.find(
        (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === 'className',
    ) as T.JSXAttribute | undefined;
}

function setClassNameToSlotProp(node: T.JSXElement, propName: string): void {
    const attr = classNameAttr(node.openingElement);
    const fallback = attr?.value
        ? t.isStringLiteral(attr.value)
            ? t.stringLiteral(attr.value.value)
            : t.isJSXExpressionContainer(attr.value) && !t.isJSXEmptyExpression(attr.value.expression)
                ? attr.value.expression
                : t.stringLiteral('')
        : t.stringLiteral('');
    const value = t.jsxExpressionContainer(
        t.logicalExpression('||', t.identifier(propName), fallback as T.Expression),
    );
    if (attr) attr.value = value;
    else node.openingElement.attributes.push(t.jsxAttribute(t.jsxIdentifier('className'), value));
}

function addPropToPattern(pattern: T.ObjectPattern, propName: string): void {
    if (pattern.properties.some(prop =>
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === propName
    )) return;

    const prop = t.objectProperty(t.identifier(propName), t.identifier(propName), false, true);
    const restIndex = pattern.properties.findIndex(p => t.isRestElement(p));
    if (restIndex >= 0) pattern.properties.splice(restIndex, 0, prop);
    else pattern.properties.push(prop);
}

function addOptionalStringPropToInterface(ast: T.File, componentName: string, propName: string): void {
    const candidates = new Set([`${componentName}Props`, 'Props']);
    traverse(ast, {
        TSInterfaceDeclaration(path) {
            if (!candidates.has(path.node.id.name)) return;
            if (path.node.body.body.some(member =>
                t.isTSPropertySignature(member) &&
                t.isIdentifier(member.key) &&
                member.key.name === propName
            )) return;

            const signature = t.tsPropertySignature(
                t.identifier(propName),
                t.tsTypeAnnotation(t.tsStringKeyword()),
            );
            signature.optional = true;
            path.node.body.body.push(signature);
            path.stop();
        },
    });
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

export function enableSlotClassOverride(ast: T.File, targetNode: T.JSXElement, propName: string): boolean {
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

            const firstParam = functionNode.params[0];
            if (t.isObjectPattern(firstParam)) addPropToPattern(firstParam, propName);
            else return;

            addOptionalStringPropToInterface(ast, componentName, propName);
            setClassNameToSlotProp(path.node, propName);
            changed = true;
            path.stop();
        },
    });

    return changed;
}
