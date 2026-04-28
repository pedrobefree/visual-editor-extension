import { addOidsToAst, getAstFromContent, getContentFromAst } from '@visual-edit/parser';

interface LoaderContext {
    resourcePath?: string;
    cacheable?: () => void;
}

export default function visualEditNextLoader(this: LoaderContext, source: string): string {
    this.cacheable?.();

    const filePath = this.resourcePath ?? '';
    if (!/\.(tsx|jsx)$/.test(filePath)) return source;
    if (filePath.includes('node_modules')) return source;

    const ast = getAstFromContent(source, true);
    if (!ast) return source;

    const { ast: modified, modified: changed } = addOidsToAst(ast, undefined, { filePath });
    if (!changed) return source;

    return getContentFromAst(modified, source);
}
