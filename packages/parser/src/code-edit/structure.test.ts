import { describe, expect, test } from 'bun:test';
import {
    getAstFromContent,
    getContentFromAst,
    duplicateElementAtPath,
    extractElementToComponentAtPath,
    insertElementAtPath,
    moveElementAtPath,
    moveElementToParentPath,
    duplicateComponentUsageAtIndex,
    removeElementAtPath,
    removeComponentUsageAtIndex,
    traverse,
    t,
    updateNodeAttrValue,
    type InsertElementSpec,
    type NodePath,
    type T,
    updatePropValueAtIndex,
    updateComponentUsageChildrenAtIndex,
    removeComponentUsageByText,
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

    test('adds a missing string attribute when updating an attr value', () => {
        const imgSource = `export function Sample() {
  return <img src="/logo.png" />;
}
`;
        const ast = getAstFromContent(imgSource);
        expect(ast).not.toBeNull();
        const imgPath = findPathByTag(ast!, 'img');
        expect(imgPath).not.toBeNull();

        const changed = updateNodeAttrValue(imgPath!.node, 'alt', 'Brand logo');
        const output = getContentFromAst(ast!, imgSource);

        expect(changed).toBe(true);
        expect(output).toContain('alt="Brand logo"');
    });

    test('converts a dynamic attr expression to a string attribute when updating component attr value', () => {
        const imgSource = `export function Logo({ name }) {
  return <img src="/logo.png" alt={name} />;
}
`;
        const ast = getAstFromContent(imgSource);
        expect(ast).not.toBeNull();
        const imgPath = findPathByTag(ast!, 'img');
        expect(imgPath).not.toBeNull();

        const changed = updateNodeAttrValue(imgPath!.node, 'alt', 'Befree');
        const output = getContentFromAst(ast!, imgSource);

        expect(changed).toBe(true);
        expect(output).toContain('alt="Befree"');
    });

    test('adds a missing component usage string prop at index', () => {
        const usageSource = `export function Page() {
  return (
    <>
      <Logo />
      <Logo />
    </>
  );
}
`;
        const ast = getAstFromContent(usageSource);
        expect(ast).not.toBeNull();

        const changed = updatePropValueAtIndex(ast!, ['Logo'], 'name', 'Previous', 'Befree', 1);
        const output = getContentFromAst(ast!, usageSource);

        expect(changed).toBe(true);
        expect(output).toContain('<Logo name="Befree" />');
    });

    test('duplicates an element after itself and removes duplicated OIDs', () => {
        const duplicateSource = `export function Sample() {
  return (
    <section>
      <button data-oid="abc">Click</button>
    </section>
  );
}
`;
        const ast = getAstFromContent(duplicateSource);
        expect(ast).not.toBeNull();
        const buttonPath = findPathByTag(ast!, 'button');
        expect(buttonPath).not.toBeNull();

        const changed = duplicateElementAtPath(buttonPath!);
        const output = getContentFromAst(ast!, duplicateSource);

        expect(changed).toBe(true);
        expect(output.match(/<button/g)?.length).toBe(2);
        expect(output.match(/data-oid=/g)?.length).toBe(1);
    });

    test('extracts an element into component source and replaces original node', () => {
        const extractSource = `export function Sample() {
  return (
    <section data-oid="root" className="root">
      <button data-oid="button" className="primary">Click</button>
    </section>
  );
}
`;
        const ast = getAstFromContent(extractSource);
        expect(ast).not.toBeNull();
        const sectionPath = findPathByTag(ast!, 'section');
        expect(sectionPath).not.toBeNull();

        const componentSource = extractElementToComponentAtPath(sectionPath!, 'HeroBlock');
        const output = getContentFromAst(ast!, extractSource);

        expect(componentSource).toContain('export interface HeroBlockProps');
        expect(componentSource).toContain('className =');
        expect(componentSource).toContain('className2 =');
        expect(componentSource).toContain('text = "Click"');
        expect(componentSource).toContain('<section className={className}>');
        expect(componentSource).toContain('<button className={className2}>{text}</button>');
        expect(componentSource).not.toContain('data-oid');
        expect(output).toContain('<HeroBlock className="root" className2="primary" text="Click" />');
    });

    test('extracts image src and alt into component props', () => {
        const extractSource = `export function Sample() {
  return <img data-oid="img" src="/logo.png" alt="Logo" />;
}
`;
        const ast = getAstFromContent(extractSource);
        expect(ast).not.toBeNull();
        const imgPath = findPathByTag(ast!, 'img');
        expect(imgPath).not.toBeNull();

        const componentSource = extractElementToComponentAtPath(imgPath!, 'LogoImage');
        const output = getContentFromAst(ast!, extractSource);

        expect(componentSource).toContain('imageSrc = "/logo.png"');
        expect(componentSource).toContain('imageAlt = "Logo"');
        expect(componentSource).toContain('src={imageSrc}');
        expect(componentSource).toContain('alt={imageAlt}');
        expect(output).toContain('<LogoImage imageSrc="/logo.png" imageAlt="Logo" />');
    });

    test('duplicates an element whose parent is a fragment', () => {
        const duplicateSource = `export function Sample() {
  return (
    <>
      <button data-oid="abc">Click</button>
    </>
  );
}
`;
        const ast = getAstFromContent(duplicateSource);
        expect(ast).not.toBeNull();
        const buttonPath = findPathByTag(ast!, 'button');
        expect(buttonPath).not.toBeNull();

        const changed = duplicateElementAtPath(buttonPath!);
        const output = getContentFromAst(ast!, duplicateSource);

        expect(changed).toBe(true);
        expect(output.match(/<button/g)?.length).toBe(2);
        expect(output.match(/data-oid=/g)?.length).toBe(1);
    });

    test('duplicates an element returned directly by a component', () => {
        const duplicateSource = `export function Sample() {
  return <Button data-oid="abc">Click</Button>;
}
`;
        const ast = getAstFromContent(duplicateSource);
        expect(ast).not.toBeNull();
        const buttonPath = findPathByTag(ast!, 'Button');
        expect(buttonPath).not.toBeNull();

        const changed = duplicateElementAtPath(buttonPath!);
        const output = getContentFromAst(ast!, duplicateSource);

        expect(changed).toBe(true);
        expect(output.match(/<Button/g)?.length).toBe(2);
        expect(output).toContain('<>');
        expect(output.match(/data-oid=/g)?.length).toBe(1);
    });

    test('duplicates an element returned directly by an arrow component', () => {
        const duplicateSource = `export const Sample = () => <Button data-oid="abc">Click</Button>;
`;
        const ast = getAstFromContent(duplicateSource);
        expect(ast).not.toBeNull();
        const buttonPath = findPathByTag(ast!, 'Button');
        expect(buttonPath).not.toBeNull();

        const changed = duplicateElementAtPath(buttonPath!);
        const output = getContentFromAst(ast!, duplicateSource);

        expect(changed).toBe(true);
        expect(output.match(/<Button/g)?.length).toBe(2);
        expect(output).toContain('<>');
        expect(output.match(/data-oid=/g)?.length).toBe(1);
    });

    test('moves an element into another container', () => {
        const moveSource = `export function Sample() {
  return (
    <main>
      <section>
        <span>Move me</span>
      </section>
      <div></div>
    </main>
  );
}
`;
        const ast = getAstFromContent(moveSource);
        expect(ast).not.toBeNull();
        const spanPath = findPathByTag(ast!, 'span');
        const divPath = findPathByTag(ast!, 'div');
        expect(spanPath).not.toBeNull();
        expect(divPath).not.toBeNull();

        const changed = moveElementToParentPath(spanPath!, divPath!, 'append');
        const output = getContentFromAst(ast!, moveSource);

        expect(changed).toBe(true);
        expect(output).toContain('<div><span>Move me</span></div>');
    });

    test('duplicates a single component usage by rendered instance index', () => {
        const usageSource = `export function Page() {
  return (
    <div>
      <Button>Primary</Button>
      <Button>Secondary</Button>
    </div>
  );
}
`;
        const ast = getAstFromContent(usageSource);
        expect(ast).not.toBeNull();

        const changed = duplicateComponentUsageAtIndex(ast!, ['Button'], 0);
        const output = getContentFromAst(ast!, usageSource);

        expect(changed).toBe(true);
        expect(output.match(/<Button/g)?.length).toBe(3);
        expect(output.indexOf('Primary')).toBeLessThan(output.lastIndexOf('Primary'));
        expect(output.match(/Secondary/g)?.length).toBe(1);
    });

    test('removes a single component usage by rendered instance index', () => {
        const usageSource = `export function Page() {
  return (
    <div>
      <Button>Primary</Button>
      <Button>Secondary</Button>
    </div>
  );
}
`;
        const ast = getAstFromContent(usageSource);
        expect(ast).not.toBeNull();

        const changed = removeComponentUsageAtIndex(ast!, ['Button'], 0);
        const output = getContentFromAst(ast!, usageSource);

        expect(changed).toBe(true);
        expect(output.match(/<Button/g)?.length).toBe(1);
        expect(output).not.toContain('Primary');
        expect(output).toContain('Secondary');
    });

    test('updates component usage text children by rendered instance index', () => {
        const usageSource = `export function Page() {
  return (
    <div>
      <Button>Primary</Button>
      <Button />
    </div>
  );
}
`;
        const ast = getAstFromContent(usageSource);
        expect(ast).not.toBeNull();

        const changed = updateComponentUsageChildrenAtIndex(ast!, ['Button'], 'Novo botao', 1);
        const output = getContentFromAst(ast!, usageSource);

        expect(changed).toBe(true);
        expect(output).toContain('<Button>Novo botao</Button>');
    });

    test('removes component usage by text fallback', () => {
        const usageSource = `export function Page() {
  return (
    <div>
      <Button>Keep</Button>
      <Button>Remove me</Button>
    </div>
  );
}
`;
        const ast = getAstFromContent(usageSource);
        expect(ast).not.toBeNull();

        const changed = removeComponentUsageByText(ast!, ['Button'], 'Remove me');
        const output = getContentFromAst(ast!, usageSource);

        expect(changed).toBe(true);
        expect(output).toContain('Keep');
        expect(output).not.toContain('Remove me');
    });
});
