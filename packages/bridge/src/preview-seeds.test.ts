import { describe, expect, test } from 'bun:test';
import { getCompoundPreviewSeed } from './preview-seeds';

describe('getCompoundPreviewSeed', () => {
    test('returns a seeded preview for accordion-like compound components', () => {
        const seed = getCompoundPreviewSeed(
            'Accordion',
            ['Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent'],
            '@/components/visual-edit/shadcn/ui/accordion',
        );

        expect(seed).not.toBeNull();
        expect(seed?.imports).toContain('AccordionItem as PreviewAccordionItem');
        expect(seed?.componentTag).toContain('<PreviewComponent type="single" collapsible {...previewProps}>');
        expect(seed?.componentTag).not.toContain('defaultValue=');
    });

    test('returns a seeded preview for hover-card compounds', () => {
        const seed = getCompoundPreviewSeed(
            'HoverCard',
            ['HoverCard', 'HoverCardTrigger', 'HoverCardContent'],
            '@/components/visual-edit/shadcn/ui/hover-card',
        );

        expect(seed).not.toBeNull();
        expect(seed?.imports).toContain('HoverCardTrigger as PreviewHoverCardTrigger');
        expect(seed?.componentTag).toContain('@visual-edit');
        expect(seed?.componentTag).not.toContain('open');
        expect(seed?.componentTag).not.toContain('openDelay');
    });

    test('returns null when required compound exports are missing', () => {
        const seed = getCompoundPreviewSeed(
            'HoverCard',
            ['HoverCard', 'HoverCardTrigger'],
            '@/components/visual-edit/shadcn/ui/hover-card',
        );

        expect(seed).toBeNull();
    });
});
