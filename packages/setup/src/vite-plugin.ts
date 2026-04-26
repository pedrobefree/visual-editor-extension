import type { Plugin } from 'vite';
import { addOidsToAst, getAstFromContent, getContentFromAst } from '@visual-edit/parser';

/**
 * Vite plugin that injects data-oid attributes into every JSX element at build time.
 * Add to vite.config.ts:
 *
 *   import { visualEditPlugin } from '@visual-edit/setup/vite';
 *   export default defineConfig({ plugins: [react(), visualEditPlugin()] });
 */
export function visualEditPlugin(): Plugin {
    return {
        name: 'visual-edit:inject-oids',
        enforce: 'pre',
        transform(code, id) {
            if (!/\.(tsx|jsx)$/.test(id)) return null;
            if (id.includes('node_modules')) return null;

            const ast = getAstFromContent(code);
            if (!ast) return null;

            const { ast: modified, modified: changed } = addOidsToAst(ast);
            if (!changed) return null;

            const newCode = getContentFromAst(modified, code);
            return { code: newCode, map: null };
        },
    };
}
