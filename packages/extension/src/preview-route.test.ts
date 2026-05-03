import { describe, expect, test } from 'bun:test';
import { isComponentPreviewPath, shouldInterceptEditorClick } from './preview-route';

describe('preview-route helpers', () => {
    test('detects component preview paths', () => {
        expect(isComponentPreviewPath('/visual-edit-kit-component-preview/demo')).toBe(true);
        expect(isComponentPreviewPath('/products')).toBe(false);
    });

    test('does not intercept clicks on preview pages when there is no editable oid target', () => {
        expect(shouldInterceptEditorClick('/visual-edit-kit-component-preview/demo', false)).toBe(false);
    });

    test('still intercepts clicks for editable targets and normal pages', () => {
        expect(shouldInterceptEditorClick('/visual-edit-kit-component-preview/demo', true)).toBe(true);
        expect(shouldInterceptEditorClick('/products', false)).toBe(true);
    });
});
