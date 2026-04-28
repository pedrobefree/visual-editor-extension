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

function generatedSource(root: string, routePath: string, fileName = 'page.tsx'): string {
    return readFileSync(join(root, 'app', routePath.replace(/^\//, ''), fileName), 'utf-8');
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
        const pageSource = generatedSource(root, result.path!);
        const clientSource = generatedSource(root, result.path!, 'PreviewClient.tsx');

        expect(pageSource).toContain('export const dynamic = "force-dynamic";');
        expect(pageSource).toContain('import PreviewClient from "./PreviewClient";');
        expect(clientSource).toContain('"use client";');
        expect(clientSource).toContain('import { AreaChart as PreviewComponent }');
        expect(clientSource).toContain('data: [');
        expect(clientSource).toContain('categories: ["value", "target"]');
        expect(clientSource).toContain('colors: undefined');
        expect(clientSource).toContain('valueFormatter: undefined');
        expect(clientSource).not.toContain('chartColors.success]');
    }));

    test('uses a default import for named default exports', () => withProject(root => {
        const filePath = write(root, 'components/ui/DefaultCard.tsx', `
export default function DefaultCard({ title = "Preview" }: { title?: string }) {
  return <div>{title}</div>;
}
`);

        const result = writeComponentPreview(root, { filePath, name: 'DefaultCard' });
        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!, 'PreviewClient.tsx');

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
        const source = generatedSource(root, result.path!, 'PreviewClient.tsx');

        expect(source).toContain('import { CartProvider, useCart } from "@/app/context/CartContext";');
        expect(source).toContain('<CartProvider>');
        expect(source).toContain('setIsCartOpen(true)');
        expect(source).toContain('<VisualEditPreviewErrorBoundary>');
        expect(source).toContain('state: { error: Error | null } = { error: null };');
    }));

    test('creates safe mock data for common singular props like product', () => withProject(root => {
        const filePath = write(root, 'app/(marketing)/products/ProductCard.tsx', `
export function ProductCard({ product }: { product: any }) {
  const price = product.prices?.[0];
  return <div>{product.name} {price?.currency}</div>;
}
`);

        const result = writeComponentPreview(root, { filePath, name: 'ProductCard' });
        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!, 'PreviewClient.tsx');

        expect(source).toContain('product: {');
        expect(source).toContain('prices: [');
        expect(source).toContain('currency: "usd"');
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
