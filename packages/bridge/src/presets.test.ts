import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createPreset, PRESETS } from './presets';

function withProject(fn: (root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), 'visual-edit-presets-'));
    try {
        fn(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

describe('PRESETS', () => {
    test('exports all five preset kinds', () => {
        const kinds = PRESETS.map(p => p.kind);
        expect(kinds).toContain('Section');
        expect(kinds).toContain('Card');
        expect(kinds).toContain('Hero');
        expect(kinds).toContain('FeatureGrid');
        expect(kinds).toContain('CTA');
    });
});

describe('createPreset', () => {
    test('creates Section preset in default destination', () => withProject(root => {
        mkdirSync(join(root, 'src'), { recursive: true });
        const result = createPreset(root, 'Section', 'MySection');

        expect(result.ok).toBe(true);
        expect(result.componentName).toBe('MySection');
        expect(result.newFilePath).toContain('visual-edit/MySection.tsx');
        expect(existsSync(result.newFilePath!)).toBe(true);

        const content = readFileSync(result.newFilePath!, 'utf-8');
        expect(content).toContain('export function MySection');
        expect(content).toContain('MySectionProps');
    }));

    test('creates Card preset with correct structure', () => withProject(root => {
        mkdirSync(join(root, 'src'), { recursive: true });
        const result = createPreset(root, 'Card', 'PricingCard');

        expect(result.ok).toBe(true);
        const content = readFileSync(result.newFilePath!, 'utf-8');
        expect(content).toContain('export function PricingCard');
        expect(content).toContain('title');
        expect(content).toContain('body');
    }));

    test('creates Hero preset with heading and CTA props', () => withProject(root => {
        mkdirSync(join(root, 'src'), { recursive: true });
        const result = createPreset(root, 'Hero', 'LandingHero');

        expect(result.ok).toBe(true);
        const content = readFileSync(result.newFilePath!, 'utf-8');
        expect(content).toContain('heading');
        expect(content).toContain('ctaLabel');
        expect(content).toContain('ctaHref');
    }));

    test('creates FeatureGrid preset', () => withProject(root => {
        mkdirSync(join(root, 'src'), { recursive: true });
        const result = createPreset(root, 'FeatureGrid', 'Features');

        expect(result.ok).toBe(true);
        const content = readFileSync(result.newFilePath!, 'utf-8');
        expect(content).toContain('export function Features');
        expect(content).toContain('grid');
    }));

    test('creates CTA preset', () => withProject(root => {
        mkdirSync(join(root, 'src'), { recursive: true });
        const result = createPreset(root, 'CTA', 'CallToAction');

        expect(result.ok).toBe(true);
        const content = readFileSync(result.newFilePath!, 'utf-8');
        expect(content).toContain('export function CallToAction');
        expect(content).toContain('label');
        expect(content).toContain('href');
    }));

    test('creates preset in custom destination', () => withProject(root => {
        const result = createPreset(root, 'Card', 'PromoCard', 'src/blocks');

        expect(result.ok).toBe(true);
        expect(result.newFilePath).toContain('src/blocks/PromoCard.tsx');
    }));

    test('blocks destination outside project root', () => withProject(root => {
        const result = createPreset(root, 'Card', 'Card', '../../outside');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('outside project root');
    }));

    test('avoids name collision with numeric suffix', () => withProject(root => {
        mkdirSync(join(root, 'src'), { recursive: true });
        // Create first one
        createPreset(root, 'Card', 'MyCard');
        // Create second with same name
        const result = createPreset(root, 'Card', 'MyCard');

        expect(result.ok).toBe(true);
        expect(result.newFilePath).toContain('MyCard2.tsx');
    }));

    test('returns error for unknown preset kind', () => withProject(root => {
        const result = createPreset(root, 'Unknown' as any, 'Foo');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('Unknown preset kind');
    }));
});
