import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
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

function previewDirFor(root: string, relPath: string, name: string): string {
    const normalized = relPath
        .toLowerCase()
        .replace(/\.(tsx|jsx)$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72);
    const hash = createHash('sha1').update(`${name}:${relPath}`).digest('hex').slice(0, 8);
    return join(root, 'app/visual-edit-kit-component-preview', `${name.toLowerCase()}-${normalized}-${hash}`);
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
        expect(source).toContain('data-oid=');
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
        expect(source).toContain('<CartProvider ');
        expect(source).toContain('setIsCartOpen(true)');
        expect(source).toContain('<VisualEditPreviewErrorBoundary');
        expect(source).toContain('state: {error: Error | null;} = { error: null };');
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

    test('returns structured dependency guidance when runtime dependencies are missing', () => withProject(root => {
        write(root, 'package.json', JSON.stringify({
            name: 'preview-app',
            packageManager: 'pnpm@10.0.0',
            dependencies: {
                react: '^19.0.0',
            },
        }, null, 2));
        const filePath = write(root, 'components/visual-edit/shadcn/ui/accordion.tsx', `
import * as React from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import { ChevronDownIcon } from "lucide-react";

export function Accordion() {
  return <AccordionPrimitive.Root><ChevronDownIcon /></AccordionPrimitive.Root>;
}
`);

        const result = writeComponentPreview(root, { filePath, name: 'Accordion' });

        expect(result.ok).toBe(false);
        expect(result.code).toBe('missing-preview-dependencies');
        expect(result.packageManager).toBe('pnpm');
        expect(result.missingDependencies).toEqual(['radix-ui', 'lucide-react']);
        expect(result.installCommand).toBe('pnpm add radix-ui lucide-react');
        expect(result.error).toContain('Missing runtime dependencies for preview');
        expect(result.error).toContain('radix-ui');
        expect(result.error).toContain('lucide-react');
        expect(result.error).toContain('pnpm add radix-ui lucide-react');
        expect(result.error).toContain('Compatibility warning');
    }));

    test('seeds compound accordion previews with placeholder items', () => withProject(root => {
        const filePath = write(root, 'components/visual-edit/shadcn/ui/accordion.tsx', `
export function Accordion({ children }: any) { return <div>{children}</div>; }
export function AccordionItem({ children }: any) { return <section>{children}</section>; }
export function AccordionTrigger({ children }: any) { return <button>{children}</button>; }
export function AccordionContent({ children }: any) { return <div>{children}</div>; }
`);

        const result = writeComponentPreview(root, { filePath, name: 'Accordion' });

        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!, 'PreviewClient.tsx');
        expect(source).toContain('AccordionItem as PreviewAccordionItem');
        expect(source).toContain('<PreviewComponent type="single" collapsible {...previewProps}');
        expect(source).not.toContain('defaultValue=');
        expect(source).toContain('<PreviewAccordionItem value="item-1"');
        expect(source).toContain('What is included in this preview?');
        expect(source).toContain('Placeholder content generated by Visual Edit');
        expect(source).not.toContain('<PreviewComponent {...previewProps} />');
        expect(source).toContain('data-oid=');
    }));

    test('seeds hover-card previews with trigger and content placeholders', () => withProject(root => {
        const filePath = write(root, 'components/visual-edit/shadcn/ui/hover-card.tsx', `
export function HoverCard({ children }: any) { return <div>{children}</div>; }
export function HoverCardTrigger({ children }: any) { return <button>{children}</button>; }
export function HoverCardContent({ children }: any) { return <div>{children}</div>; }
`);

        const result = writeComponentPreview(root, { filePath, name: 'HoverCard' });

        expect(result.ok).toBe(true);
        const source = generatedSource(root, result.path!, 'PreviewClient.tsx');
        expect(source).toContain('HoverCardTrigger as PreviewHoverCardTrigger');
        expect(source).toContain('@visual-edit');
        expect(source).toContain('This seeded content keeps the component intelligible');
        expect(source).not.toContain('openDelay=');
        expect(source).not.toContain('closeDelay=');
        expect(source).not.toContain('<PreviewComponent open');
        expect(source).toContain('data-oid=');
    }));

    test('does not leave behind a routable page when PreviewClient cannot be written', () => withProject(root => {
        const filePath = write(root, 'components/ui/Accordion.tsx', `
export function Accordion() { return <div />; }
`);
        const previewDir = previewDirFor(root, 'components/ui/Accordion.tsx', 'Accordion');
        mkdirSync(previewDir, { recursive: true });
        mkdirSync(join(previewDir, 'PreviewClient.tsx'), { recursive: true });

        const result = writeComponentPreview(root, { filePath, name: 'Accordion' });

        expect(result.ok).toBe(false);
        expect(() => readFileSync(join(previewDir, 'page.tsx'), 'utf-8')).toThrow();
    }));
});
