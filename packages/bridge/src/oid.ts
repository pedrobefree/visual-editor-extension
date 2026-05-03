import { addOidsToAst, getAstFromContent, getContentFromAst } from '@visual-edit/parser';

export function instrumentSourceWithOids(filePath: string, source: string): string {
    const ast = getAstFromContent(source, true);
    if (!ast) return source;

    const { modified } = addOidsToAst(ast, new Set<string>(), { filePath });
    if (!modified) return source;

    return getContentFromAst(ast, source);
}
