import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { getAstFromContent, t, traverse } from '@visual-edit/parser';
import { applyEdit } from './editor';
import type { OidLocation } from './scanner';

function withProject(fn: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'visual-edit-editor-'));
    try {
        fn(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

function write(root: string, relPath: string, content: string): string {
    const filePath = join(root, relPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

function findOpeningLoc(filePath: string, tagName: string): OidLocation {
    const content = readFileSync(filePath, 'utf-8');
    const ast = getAstFromContent(content);
    if (!ast) throw new Error(`Could not parse ${filePath}`);

    let found: OidLocation | null = null;
    traverse(ast, {
        JSXOpeningElement(path) {
            const name = path.node.name;
            const loc = path.node.loc?.start;
            if (!loc || !t.isJSXIdentifier(name) || name.name !== tagName) return;
            found = { filePath, line: loc.line, col: loc.column };
            path.stop();
        },
    });

    if (!found) throw new Error(`Could not find <${tagName}> in ${filePath}`);
    return found;
}

describe('applyEdit', () => {
    test('persists instance text edits through a single-usage intermediary component', () => withProject(root => {
        const buttonFile = write(root, 'components/Button.tsx', `export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}
`);
        const cardFile = write(root, 'components/Card.tsx', `import { Button } from "./Button";

export function Card({ ctaLabel }: { ctaLabel: string }) {
  return (
    <section>
      <Button label={ctaLabel} />
    </section>
  );
}
`);
        const pageFile = write(root, 'app/Page.tsx', `import { Card } from "../components/Card";

export default function Page() {
  return (
    <>
      <Card ctaLabel="First" />
      <Card ctaLabel="Second" />
    </>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(buttonFile, 'button'),
            {
                oid: 'test-oid',
                kind: 'text',
                payload: 'Updated',
                currentText: 'Second',
                scope: 'instance',
                instanceIndex: 1,
                sourceFileHints: [cardFile, pageFile],
            },
            root,
        );

        expect(result.ok).toBe(true);
        expect(readFileSync(pageFile, 'utf-8')).toContain('<Card ctaLabel="Updated" />');
        expect(readFileSync(pageFile, 'utf-8')).toContain('<Card ctaLabel="First" />');
        expect(readFileSync(cardFile, 'utf-8')).toContain('<Button label={ctaLabel} />');
        expect(readFileSync(buttonFile, 'utf-8')).toContain('<button>{label}</button>');
    }));

    test('persists instance text edits for static nested button text inside an exported component', () => withProject(root => {
        const heroFile = write(root, 'components/Hero.tsx', `export function Hero() {
  return (
    <section>
      <button>Novo botao</button>
    </section>
  );
}
`);
        const pageFile = write(root, 'app/Page.tsx', `import { Hero } from "../components/Hero";

export default function Page() {
  return (
    <>
      <Hero />
      <Hero />
    </>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(heroFile, 'button'),
            {
                oid: 'hero-button',
                kind: 'text',
                payload: 'Rótulo do Botão X',
                currentText: 'Novo botao',
                scope: 'instance',
                instanceIndex: 1,
                sourceFileHints: [pageFile],
            },
            root,
        );

        expect(result.ok).toBe(true);
        const heroContent = readFileSync(heroFile, 'utf-8');
        const pageContent = readFileSync(pageFile, 'utf-8');
        expect(heroContent).toContain('export function Hero({ buttonText = "Novo botao" }');
        expect(heroContent).toContain('buttonText?: string');
        expect(heroContent).toContain('<button>{buttonText}</button>');
        expect(pageContent).toContain('<Hero />');
        expect(pageContent).toContain('<Hero buttonText=');
        expect(pageContent).toContain('Rótulo do Botão X');
    }));

    test('repairs existing instance text props without defaults when editing application scope', () => withProject(root => {
        const heroFile = write(root, 'components/Hero.tsx', `export function Hero({ buttonText }: { buttonText?: string }) {
  return (
    <section>
      <button>{buttonText}</button>
    </section>
  );
}
`);
        const pageFile = write(root, 'app/Page.tsx', `import { Hero } from "../components/Hero";

export default function Page() {
  return (
    <>
      <Hero />
      <Hero />
    </>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(heroFile, 'button'),
            {
                oid: 'hero-button',
                kind: 'text',
                payload: 'Rótulo do Botão 1',
                currentText: 'Rótulo do Botão',
                scope: 'instance',
                instanceIndex: 1,
                sourceFileHints: [pageFile],
            },
            root,
        );

        expect(result.ok).toBe(true);
        const heroContent = readFileSync(heroFile, 'utf-8');
        const pageContent = readFileSync(pageFile, 'utf-8');
        expect(heroContent).toContain('buttonText = "Rótulo do Botão"');
        expect(heroContent).toContain('<button>{buttonText}</button>');
        expect(pageContent).toContain('<Hero />');
        expect(pageContent).toContain('Rótulo do Botão 1');
    }));

    test('edits custom component usage labels as children in application scope', () => withProject(root => {
        const pageFile = write(root, 'components/LandingPage.tsx', `import { Button } from "./Button";

export const LandingPage = () => {
  return (
    <section>
      <Button variant="secondary"></Button>
    </section>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(pageFile, 'Button'),
            {
                oid: 'button-usage',
                kind: 'text',
                payload: 'Rótulo do Botão 1',
                currentText: '',
                scope: 'instance',
                instanceIndex: 0,
            },
            root,
        );

        expect(result.ok).toBe(true);
        const pageContent = readFileSync(pageFile, 'utf-8');
        expect(pageContent).toContain('<Button variant="secondary">Rótulo do Botão 1</Button>');
        expect(pageContent).not.toContain('text=');
    }));

    test('edits reusable component template children through the selected application usage', () => withProject(root => {
        const buttonFile = write(root, 'components/Button.tsx', `export function Button({ children }: { children?: React.ReactNode }) {
  return (
    <AriaButton>
      <>
        {children}
      </>
    </AriaButton>
  );
}
`);
        const pageFile = write(root, 'components/LandingPage.tsx', `import { Button } from "./Button";

export const LandingPage = () => {
  return (
    <section>
      <Button>Get started free</Button>
      <Button>View components</Button>
    </section>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(buttonFile, 'AriaButton'),
            {
                oid: 'button-template',
                kind: 'text',
                payload: 'Get started free X',
                currentText: 'Get started free',
                scope: 'instance',
                instanceIndex: 0,
                sourceFileHints: [pageFile],
            },
            root,
        );

        expect(result.ok).toBe(true);
        const pageContent = readFileSync(pageFile, 'utf-8');
        expect(pageContent).toContain('<Button>Get started free X</Button>');
        expect(pageContent).toContain('<Button>View components</Button>');
        expect(pageContent).not.toContain('text=');
        expect(readFileSync(buttonFile, 'utf-8')).toContain('{children}');
    }));

    test('keeps page-local class edits in application scope for non-component elements', () => withProject(root => {
        const pageFile = write(root, 'app/Page.tsx', `export default function Page() {
  return (
    <section>
      <img className="w-full h-full object-contain" src="/logo.png" alt="Logo" />
    </section>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(pageFile, 'img'),
            {
                oid: 'page-image',
                kind: 'class',
                payload: 'w-full h-full object-cover rounded-xl',
                scope: 'instance',
                instanceIndex: 0,
                instanceCount: 1,
            },
            root,
        );

        expect(result.ok).toBe(true);
        const pageContent = readFileSync(pageFile, 'utf-8');
        expect(pageContent).toContain('className="w-full h-full object-cover rounded-xl"');
    }));

    test('persists instance-scoped class edits for nested elements in components without props yet', () => withProject(root => {
        const cardFile = write(root, 'components/FeatureCard.tsx', `export function FeatureCard() {
  return (
    <div>
      <img className="w-24 h-24 object-contain" src="/logo.png" alt="Logo" />
    </div>
  );
}
`);
        const pageFile = write(root, 'app/Page.tsx', `import { FeatureCard } from "../components/FeatureCard";

export default function Page() {
  return (
    <section>
      <FeatureCard />
      <FeatureCard />
    </section>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(cardFile, 'img'),
            {
                oid: 'feature-card-image',
                kind: 'class',
                payload: 'w-full h-full object-cover rounded-xl',
                scope: 'instance',
                instanceIndex: 0,
                instanceCount: 2,
                sourceFileHints: [pageFile],
                isComponentRoot: false,
            },
            root,
        );

        expect(result.ok).toBe(true);
        const nextCard = readFileSync(cardFile, 'utf-8');
        const nextPage = readFileSync(pageFile, 'utf-8');
        expect(nextCard).toContain('veFeaturecardimageClassName');
        expect(nextCard).toContain('className={veFeaturecardimageClassName || "w-24 h-24 object-contain"}');
        expect(nextPage).toContain('<FeatureCard veFeaturecardimageClassName="w-full h-full object-cover rounded-xl" />');
        expect(nextPage).toContain('<FeatureCard />');
    }));

    test('keeps page-local class edits inside app router pages even when layout hints are present', () => withProject(root => {
        const layoutFile = write(root, 'app/(marketing)/layout.tsx', `export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="layout-shell">{children}</div>;
}
`);
        const pageFile = write(root, 'app/(marketing)/test-page-1/page.tsx', `export default function TestPage1Page() {
  return (
    <main className="min-h-screen px-4 py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <img className="h-full w-auto object-contain" src="/favicon-befree.png" alt="Imagem de teste" />
      </div>
    </main>
  );
}
`);

        const result = applyEdit(
            findOpeningLoc(pageFile, 'img'),
            {
                oid: 'page-image',
                kind: 'class',
                payload: 'h-full w-auto object-contain max-w-xs self-center self-end',
                scope: 'instance',
                instanceIndex: 0,
                instanceCount: 1,
                sourceFileHints: [layoutFile],
                isComponentRoot: false,
            },
            root,
        );

        expect(result.ok).toBe(true);
        expect(readFileSync(pageFile, 'utf-8')).toContain('className="h-full w-auto object-contain max-w-xs self-center self-end"');
        expect(readFileSync(layoutFile, 'utf-8')).toContain('layout-shell');
    }));

    test('refuses to remove a nested element inside a reused component instance', () => withProject(root => {
        const cardFile = write(root, 'components/FeatureCard.tsx', `export function FeatureCard() {
  return (
    <div>
      <p>Analytics</p>
    </div>
  );
}
`);
        const pageFile = write(root, 'app/Page.tsx', `import { FeatureCard } from "../components/FeatureCard";

export default function Page() {
  return (
    <section>
      <FeatureCard />
      <FeatureCard />
    </section>
  );
}
`);

        const beforeCard = readFileSync(cardFile, 'utf-8');
        const beforePage = readFileSync(pageFile, 'utf-8');
        const result = applyEdit(
            findOpeningLoc(cardFile, 'p'),
            {
                oid: 'feature-card-text',
                kind: 'remove',
                payload: null,
                scope: 'instance',
                instanceIndex: 0,
                instanceCount: 2,
                sourceFileHints: [pageFile],
                currentText: 'Analytics',
                isComponentRoot: false,
            },
            root,
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Nao consigo remover apenas este elemento');
        expect(readFileSync(cardFile, 'utf-8')).toBe(beforeCard);
        expect(readFileSync(pageFile, 'utf-8')).toBe(beforePage);
    }));

    test('componentize: extracts element to default destination', () => withProject(root => {
        const srcDir = join(root, 'src');
        mkdirSync(srcDir, { recursive: true });
        const pageFile = write(root, 'src/pages/Home.tsx', `export function Home() {
  return (
    <section data-oid="sec-1" className="hero">
      <button data-oid="btn-1" className="cta">Click</button>
    </section>
  );
}
`);
        const loc = findOpeningLoc(pageFile, 'section');
        const result = applyEdit(loc, { oid: 'sec-1', kind: 'componentize', payload: { name: 'HeroBlock' } }, root);

        expect(result.ok).toBe(true);
        expect(result.componentName).toBe('HeroBlock');
        expect(result.newFilePath).toContain('components/visual-edit/HeroBlock.tsx');

        const newContent = readFileSync(result.newFilePath!, 'utf-8');
        expect(newContent).toContain('export function HeroBlock');
        expect(newContent).not.toContain('data-oid');

        const updatedPage = readFileSync(pageFile, 'utf-8');
        expect(updatedPage).toContain('<HeroBlock');
        expect(updatedPage).toContain('components/visual-edit/HeroBlock');
    }));

    test('componentize: extracts element to custom subdir with correct import path', () => withProject(root => {
        const srcDir = join(root, 'src');
        mkdirSync(srcDir, { recursive: true });
        const pageFile = write(root, 'src/pages/Home.tsx', `export function Home() {
  return (
    <div data-oid="card-1" className="card">
      <p data-oid="txt-1">Hello</p>
    </div>
  );
}
`);
        const loc = findOpeningLoc(pageFile, 'div');
        const result = applyEdit(
            loc,
            { oid: 'card-1', kind: 'componentize', payload: { name: 'Card', destinationDir: 'src/components/sections' } },
            root,
        );

        expect(result.ok).toBe(true);
        expect(result.newFilePath).toContain('src/components/sections/Card.tsx');

        const updatedPage = readFileSync(pageFile, 'utf-8');
        expect(updatedPage).toContain('../components/sections/Card');
    }));

    test('componentize: blocks destination outside project root', () => withProject(root => {
        const pageFile = write(root, 'src/Page.tsx', `export function Page() {
  return <div data-oid="d-1" className="x">Hello</div>;
}
`);
        const loc = findOpeningLoc(pageFile, 'div');
        const result = applyEdit(
            loc,
            { oid: 'd-1', kind: 'componentize', payload: { name: 'Evil', destinationDir: '../../outside' } },
            root,
        );

        expect(result.ok).toBe(false);
        expect(result.error).toContain('outside project root');
    }));

    test('componentize: avoids name collision with numeric suffix', () => withProject(root => {
        const srcDir = join(root, 'src');
        mkdirSync(srcDir, { recursive: true });
        const pageFile = write(root, 'src/Page.tsx', `export function Page() {
  return (
    <section data-oid="s-1" className="a">
      <section data-oid="s-2" className="b">Inner</section>
    </section>
  );
}
`);
        // Create a file that already occupies the default name
        write(root, 'src/components/visual-edit/MyBlock.tsx', 'export function MyBlock() { return null; }');

        const loc = findOpeningLoc(pageFile, 'section');
        const result = applyEdit(loc, { oid: 's-1', kind: 'componentize', payload: { name: 'MyBlock' } }, root);

        expect(result.ok).toBe(true);
        expect(result.newFilePath).toContain('MyBlock2.tsx');
    }));
});
