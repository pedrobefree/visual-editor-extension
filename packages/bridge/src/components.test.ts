import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { listComponents } from './components';
import { duplicateComponent } from './editor';

function withProject(fn: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'visual-edit-components-'));
    try {
        fn(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

function write(root: string, relPath: string, content: string): void {
    const filePath = join(root, relPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
}

describe('listComponents', () => {
    test('lists visual components and excludes context/provider files', () => withProject(root => {
        write(root, 'components/ui/Button.tsx', 'export function Button() { return <button />; }');
        write(root, 'components/features/auth/AuthProvider.tsx', 'export function AuthProvider({ children }: any) { return children; }');
        write(root, 'app/context/CartContext.tsx', 'export function CartProvider({ children }: any) { return children; }');
        write(root, 'components/features/charts/ChartHelpers.tsx', 'export const chartColors = {}; export function ChartShell() { return <div />; }');

        const components = listComponents(root);
        const names = components.map(component => component.name);

        expect(names).toContain('Button');
        expect(names).toContain('ChartShell');
        expect(names).not.toContain('AuthProvider');
        expect(names).not.toContain('CartContext');
        expect(names).not.toContain('CartProvider');
    }));
});

describe('duplicateComponent', () => {
    function write(root: string, relPath: string, content: string): string {
        const filePath = join(root, relPath);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }

    test('duplicates component in same directory, renaming exports', () => withProject(root => {
        const source = write(root, 'src/components/Card.tsx', `export interface CardProps { title?: string; }
export function Card({ title = "Hello" }: CardProps) {
  return <div className="card">{title}</div>;
}
`);
        const result = duplicateComponent(root, source, 'CardVariant');

        expect(result.ok).toBe(true);
        expect(result.componentName).toBe('CardVariant');
        expect(result.newFilePath).toContain('CardVariant.tsx');

        const content = readFileSync(result.newFilePath!, 'utf-8');
        expect(content).toContain('export function CardVariant');
        expect(content).toContain('CardVariantProps');
        expect(content).not.toContain('export function Card(');
        expect(content).not.toContain('export interface CardProps');
    }));

    test('preserves original file unchanged', () => withProject(root => {
        const source = write(root, 'src/components/Button.tsx', `export function Button() {
  return <button>Click</button>;
}
`);
        const originalContent = readFileSync(source, 'utf-8');
        duplicateComponent(root, source, 'ButtonVariant');

        expect(readFileSync(source, 'utf-8')).toBe(originalContent);
    }));

    test('rewrites relative imports for new location', () => withProject(root => {
        write(root, 'src/utils/cn.ts', 'export function cn(...args: string[]) { return args.join(" "); }');
        const source = write(root, 'src/components/ui/Card.tsx', `import { cn } from '../../utils/cn';
export function Card() {
  return <div className={cn("card")} />;
}
`);
        const result = duplicateComponent(root, source, 'CardVariant', 'src/components/visual-edit');
        expect(result.ok).toBe(true);

        const content = readFileSync(result.newFilePath!, 'utf-8');
        // Import should still resolve to the same utils/cn, but path is now from visual-edit/
        expect(content).toContain('../../utils/cn');
    }));

    test('blocks source path outside project root', () => withProject(root => {
        const result = duplicateComponent(root, '/tmp/external/Component.tsx', 'NewComp');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('outside project root');
    }));

    test('blocks destination outside project root', () => withProject(root => {
        const source = write(root, 'src/components/Foo.tsx', 'export function Foo() { return null; }');
        const result = duplicateComponent(root, source, 'FooVariant', '../../outside');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('outside project root');
    }));

    test('does not rename import-aliased symbols with the same name', () => withProject(root => {
        // Reproduces: import { Calendar as AriaCalendar } — the imported name "Calendar"
        // must not be rewritten to "CalendarCopy", or AriaCalendar would resolve to undefined.
        const source = write(root, 'src/components/Calendar.tsx', `import { Calendar as AriaCalendar } from 'react-aria-components';
export interface CalendarProps { className?: string; }
export function Calendar({ className }: CalendarProps) {
  return <AriaCalendar className={className} />;
}
`);
        const result = duplicateComponent(root, source, 'CalendarCopy');
        expect(result.ok).toBe(true);

        const content = readFileSync(result.newFilePath!, 'utf-8');
        // Import alias must remain intact — renaming it would make AriaCalendar undefined
        expect(content).toContain("import { Calendar as AriaCalendar }");
        // Export declaration must be renamed
        expect(content).toContain('export function CalendarCopy');
        expect(content).toContain('CalendarCopyProps');
        // JSX usage of AriaCalendar must be unchanged
        expect(content).toContain('<AriaCalendar');
    }));

    test('avoids name collision with numeric suffix', () => withProject(root => {
        const source = write(root, 'src/components/Hero.tsx', 'export function Hero() { return <section />; }');
        // Pre-create the default destination file
        write(root, 'src/components/visual-edit/HeroVariant.tsx', 'export function HeroVariant() { return null; }');

        const result = duplicateComponent(root, source, 'HeroVariant');
        expect(result.ok).toBe(true);
        expect(result.newFilePath).toContain('HeroVariant2.tsx');
        expect(existsSync(result.newFilePath!)).toBe(true);
    }));
});
