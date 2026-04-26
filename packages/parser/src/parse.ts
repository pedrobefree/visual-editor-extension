import { generate, parse, t, traverse, type T } from './packages';
import { DATA_OID_ATTR } from './constants';
import { isReactFragment } from './helpers';

export function getAstFromContent(content: string, silent = false): T.File | null {
    try {
        return parse(content, {
            sourceType: 'module',
            plugins: [
                'typescript',
                'jsx',
                ['decorators', { decoratorsBeforeExport: true }],
                'classStaticBlock',
                'dynamicImport',
                'importMeta',
            ],
        });
    } catch (e) {
        if (!silent) console.error(e);
        return null;
    }
}

export function getContentFromAst(ast: T.File, originalContent?: string): string {
    return generate(
        ast,
        {
            retainLines: true,
            compact: false,
            comments: true,
            concise: false,
            minified: false,
            jsonCompatibleStrings: false,
            shouldPrintComment: () => true,
            retainFunctionParens: true,
        },
        originalContent,
    ).code;
}

export function findNodeByOid(ast: T.File, oid: string): T.JSXElement | null {
    let found: T.JSXElement | null = null;
    traverse(ast, {
        JSXOpeningElement(path) {
            if (isReactFragment(path.node)) return;
            for (const attr of path.node.attributes) {
                if (
                    t.isJSXAttribute(attr) &&
                    attr.name.name === DATA_OID_ATTR &&
                    t.isStringLiteral(attr.value) &&
                    attr.value.value === oid
                ) {
                    const parent = path.parent;
                    if (t.isJSXElement(parent)) {
                        found = parent;
                        path.stop();
                    }
                }
            }
        },
    });
    return found;
}

/**
 * Encontra o JSXElement cuja abertura começa exatamente na linha e coluna informadas.
 * Usado pelo bridge quando os arquivos fonte não têm data-oid (loader in-memory).
 */
export function findNodeByPosition(ast: T.File, line: number, col: number): T.JSXElement | null {
    let found: T.JSXElement | null = null;
    traverse(ast, {
        JSXOpeningElement(path) {
            if (isReactFragment(path.node)) return;
            const loc = path.node.loc?.start;
            if (loc && loc.line === line && loc.column === col) {
                const parent = path.parent;
                if (t.isJSXElement(parent)) {
                    found = parent;
                    path.stop();
                }
            }
        },
    });
    return found;
}
