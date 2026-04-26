import { describe, expect, test } from 'bun:test';
import {
    getAstFromContent,
    getContentFromAst,
    insertElementAtPath,
    moveElementAtPath,
    removeElementAtPath,
    traverse,
    t,
    type InsertElementSpec,
    type NodePath,
    type T,
} from '..';

function findPathByTag(ast: T.File, tagName: string): NodePath<T.JSXElement> | null {
    let found: NodePath<T.JSXElement> | null = null;
    traverse(ast, {
        JSXElement(path) {
            const name = path.node.openingElement.name;
            if (t.isJSXIdentifier(name) && name.name === tagName) {
                found = path;
                path.stop();
            }
        },
    });
    return found;
}

const source = `export function Sample() {
  return (
    <div>
      <section>
        <p>Hello</p>
        <span>World</span>
      </section>
    </div>
  );
}
`;

describe('structure edits', () => {
    test('inserts a new JSX element into a parent node', () => {
        const ast = getAstFromContent(source);
        expect(ast).not.toBeNull();
        const sectionPath = findPathByTag(ast!, 'section');
        expect(sectionPath).not.toBeNull();

        const spec: InsertElementSpec = {
            tagName: 'button',
            textContent: 'Click me',
            attributes: { className: 'btn-primary' },
        };

        insertElementAtPath(sectionPath!, spec, 'append');
        const output = getContentFromAst(ast!, source);

        expect(output).toContain('<button className="btn-primary">Click me</button>');
    });

    test('removes the selected JSX element', () => {
        const ast = getAstFromContent(source);
        expect(ast).not.toBeNull();
        const spanPath = findPathByTag(ast!, 'span');
        expect(spanPath).not.toBeNull();

        const changed = removeElementAtPath(spanPath!);
        const output = getContentFromAst(ast!, source);

        expect(changed).toBe(true);
        expect(output).not.toContain('<span>World</span>');
    });

    test('moves an element within the same parent by sibling index', () => {
        const ast = getAstFromContent(source);
        expect(ast).not.toBeNull();
        const spanPath = findPathByTag(ast!, 'span');
        expect(spanPath).not.toBeNull();

        const changed = moveElementAtPath(spanPath!, 0);
        const output = getContentFromAst(ast!, source);
        const spanIndex = output.indexOf('<span>World</span>');
        const pIndex = output.indexOf('<p>Hello</p>');

        expect(changed).toBe(true);
        expect(spanIndex).toBeGreaterThanOrEqual(0);
        expect(pIndex).toBeGreaterThanOrEqual(0);
        expect(spanIndex).toBeLessThan(pIndex);
    });
});
