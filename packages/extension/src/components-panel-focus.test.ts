import { describe, expect, test } from 'bun:test';
import { captureFocusSnapshot, shouldAutofocusProjectSearch } from './components-panel-focus';

describe('components-panel focus helpers', () => {
    test('captures focus snapshot for text inputs', () => {
        const input = {
            tagName: 'INPUT',
            id: 'shadcn-search',
            selectionStart: 2,
            selectionEnd: 5,
        };

        expect(captureFocusSnapshot(input)).toEqual({
            id: 'shadcn-search',
            selectionStart: 2,
            selectionEnd: 5,
        });
    });

    test('ignores elements without stable input selection state', () => {
        const div = { tagName: 'DIV', id: 'panel' };
        const input = { tagName: 'INPUT' };

        expect(captureFocusSnapshot(div)).toBeNull();
        expect(captureFocusSnapshot(input)).toBeNull();
    });

    test('does not autofocus project search while shadcn mode is open', () => {
        expect(shouldAutofocusProjectSearch(true, 'shadcn')).toBe(false);
        expect(shouldAutofocusProjectSearch(false, 'shadcn')).toBe(true);
        expect(shouldAutofocusProjectSearch(true, 'preset')).toBe(true);
    });
});
