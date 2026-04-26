import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { listComponents } from './components';

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
