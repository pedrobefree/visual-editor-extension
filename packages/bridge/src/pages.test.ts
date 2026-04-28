import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { createPage, listPagePatterns } from './pages';

function withProject(fn: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'visual-edit-pages-'));
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

describe('listPagePatterns', () => {
    test('detects app router route groups and prefers marketing as default when present', () => withProject(root => {
        write(root, 'app/layout.tsx', 'export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }');
        write(root, 'app/(marketing)/layout.tsx', 'export default function MarketingLayout({ children }: any) { return <>{children}</>; }');
        write(root, 'app/(dashboard)/layout.tsx', 'export default function DashboardLayout({ children }: any) { return <>{children}</>; }');

        const patterns = listPagePatterns(root);

        expect(patterns.map(pattern => pattern.id)).toEqual([
            'app:(marketing)',
            'app:root',
            'app:(dashboard)',
        ]);
        expect(patterns[0]?.isDefault).toBe(true);
        expect(patterns[0]?.routeGroup).toBe('(marketing)');
    }));

    test('detects pages router when app router is absent', () => withProject(root => {
        write(root, 'src/pages/index.tsx', 'export default function Home() { return null; }');

        const patterns = listPagePatterns(root);

        expect(patterns).toHaveLength(1);
        expect(patterns[0]?.id).toBe('pages:root');
        expect(patterns[0]?.kind).toBe('pages');
        expect(patterns[0]?.isDefault).toBe(true);
    }));
});

describe('createPage', () => {
    test('creates an app router page inside the default route group', () => withProject(root => {
        write(root, 'app/layout.tsx', 'export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }');
        write(root, 'app/(marketing)/layout.tsx', 'export default function MarketingLayout({ children }: any) { return <>{children}</>; }');

        const result = createPage(root, { route: '/about-us' });

        expect(result.ok).toBe(true);
        expect(result.routePath).toBe('/about-us');
        expect(result.filePath).toContain('app/(marketing)/about-us/page.tsx');
        expect(existsSync(result.filePath!)).toBe(true);

        const content = readFileSync(result.filePath!, 'utf-8');
        expect(content).toContain('export default function AboutUsPage()');
        expect(content).toContain('About Us');
        expect(content).toContain('Start building this page');
    }));

    test('creates a pages router page when requested explicitly', () => withProject(root => {
        write(root, 'app/layout.tsx', 'export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }');
        write(root, 'pages/index.tsx', 'export default function Home() { return null; }');

        const result = createPage(root, { route: '/contact', patternId: 'pages:root' });

        expect(result.ok).toBe(true);
        expect(result.routePath).toBe('/contact');
        expect(result.filePath).toContain('pages/contact.tsx');
        expect(readFileSync(result.filePath!, 'utf-8')).toContain('export default function ContactPage()');
    }));

    test('blocks invalid and duplicate routes', () => withProject(root => {
        write(root, 'pages/index.tsx', 'export default function Home() { return null; }');
        write(root, 'pages/contact.tsx', 'export default function Contact() { return null; }');

        const invalid = createPage(root, { route: '/../admin' });
        expect(invalid.ok).toBe(false);
        expect(invalid.error).toContain('Invalid route');

        const duplicate = createPage(root, { route: '/contact' });
        expect(duplicate.ok).toBe(false);
        expect(duplicate.error).toContain('already exists');
    }));
});
