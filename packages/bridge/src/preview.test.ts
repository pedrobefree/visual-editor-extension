import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { writeComponentPreview } from './preview';

function withProject(fn: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'visual-edit-preview-'));
    try {
        mkdirSync(join(root, 'app'), { recursive: true });
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

function generatedSource(root: string, routePath: string): string {
    return readFileSync(join(root, 'app', routePath.replace(/^\//, ''), 'page.tsx'), 'utf-8');
}

describe('writeComponentPreview', () => {
    test('handles props with defaults containing arrays, objects, and commas', () => withProject(root => {
        const filePath = write(root, 'components/features/charts/AreaChart.tsx', `
export const chartColors = { brand: "#00f", success: "#0f0" };
export const AreaChart = ({
  data,
  categories,
  index,
  colors = [chartColors.brand, chartColors.success],
  valueFormatter = (value: any) => value.toString(),
  options = { legend: true, grid: true },
  showLegend = false,
}: any) => <div />;
`);

        const result = writeComponentPreview(root, { filePath, name: 'AreaChart' });
        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!);

        expect(source).toContain('"use client";');
        expect(source).toContain('import { AreaChart as PreviewComponent }');
        expect(source).toContain('data: [');
        expect(source).toContain('categories: ["value", "target"]');
        expect(source).toContain('colors: undefined');
        expect(source).toContain('valueFormatter: undefined');
        expect(source).not.toContain('chartColors.success]');
    }));

    test('uses a default import for named default exports', () => withProject(root => {
        const filePath = write(root, 'components/ui/DefaultCard.tsx', `
export default function DefaultCard({ title = "Preview" }: { title?: string }) {
  return <div>{title}</div>;
}
`);

        const result = writeComponentPreview(root, { filePath, name: 'DefaultCard' });
        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!);

        expect(source).toContain('import PreviewComponent from');
        expect(source).not.toContain('import { DefaultCard as PreviewComponent }');
    }));

    test('wraps cart-dependent components with CartProvider and opens the sheet', () => withProject(root => {
        write(root, 'app/context/CartContext.tsx', `
export function CartProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export function useCart() { return { setIsCartOpen: (_open: boolean) => {} }; }
`);
        const filePath = write(root, 'components/features/CartSheet.tsx', `
import { useCart } from "@/app/context/CartContext";
export function CartSheet() {
  const { setIsCartOpen } = useCart();
  return <button onClick={() => setIsCartOpen(false)}>Cart</button>;
}
`);

        const result = writeComponentPreview(root, { filePath, name: 'CartSheet' });
        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!);

        expect(source).toContain('import { CartProvider, useCart } from "@/app/context/CartContext";');
        expect(source).toContain('<CartProvider>');
        expect(source).toContain('setIsCartOpen(true)');
        expect(source).toContain('<VisualEditPreviewErrorBoundary>');
    }));

    test('rejects missing exports and non-visual context/provider targets', () => withProject(root => {
        const contextFile = write(root, 'app/context/CartContext.tsx', `
export function CartProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export function useCart() { return {}; }
`);
        const componentFile = write(root, 'components/ui/Button.tsx', `
export function Button() { return <button />; }
`);

        expect(writeComponentPreview(root, { filePath: componentFile, name: 'MissingButton' }).ok).toBe(false);
        expect(writeComponentPreview(root, { filePath: contextFile, name: 'CartProvider' }).ok).toBe(false);
    }));
});
