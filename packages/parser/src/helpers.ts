import { t, type T } from './packages';

export function isReactFragment(openingElement: T.JSXOpeningElement): boolean {
    const name = openingElement.name;
    if (t.isJSXIdentifier(name)) {
        return name.name === 'Fragment';
    }
    if (t.isJSXMemberExpression(name)) {
        return (
            t.isJSXIdentifier(name.object) &&
            name.object.name === 'React' &&
            t.isJSXIdentifier(name.property) &&
            name.property.name === 'Fragment'
        );
    }
    return false;
}
