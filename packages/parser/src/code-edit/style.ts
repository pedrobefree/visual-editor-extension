import { t, type T } from '../packages';
import { customTwMerge } from '../tw-merge';

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
