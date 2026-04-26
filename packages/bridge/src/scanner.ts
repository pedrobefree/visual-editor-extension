import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { getAstFromContent, deterministicOid, traverse } from '@visual-edit/parser';

// Apenas arquivos que podem conter JSX — .ts/.js puros não têm elementos JSX
// e frequentemente causam erros de parse quando o plugin JSX está ativo.
const SUPPORTED_EXTS = new Set(['.tsx', '.jsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'build', 'out']);

export interface OidLocation {
    filePath: string;
    line: number;
    col: number;
}

/** oid → localização no fonte (filePath + posição da abertura do JSXOpeningElement) */
export type OidIndex = Map<string, OidLocation>;

/**
 * Escaneia o conteúdo de um arquivo e registra os OIDs que o webpack loader geraria
 * (deterministicOid com base em filePath + linha + coluna), sem modificar os arquivos.
 */
export function scanFileForOids(content: string, filePath: string, index: OidIndex): void {
    // silent=true: erros de parse são esperados (arquivos de config, d.ts, etc.) — não poluem o terminal
    const ast = getAstFromContent(content, true);
    if (!ast) return;

    traverse(ast, {
        JSXOpeningElement(path) {
            const loc = path.node.loc?.start;
            if (!loc) return;
            const oid = deterministicOid(filePath, loc.line, loc.column);
            index.set(oid, { filePath, line: loc.line, col: loc.column });
        },
    });
}

function walkDir(dir: string, index: OidIndex): void {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        let stat;
        try { stat = statSync(full); } catch { continue; }
        if (stat.isDirectory()) {
            walkDir(full, index);
        } else if (SUPPORTED_EXTS.has(extname(entry))) {
            try {
                const content = readFileSync(full, 'utf-8');
                scanFileForOids(content, full, index);
            } catch { /* skip unreadable files */ }
        }
    }
}

/** Returns all .tsx/.jsx source file paths under projectRoot. */
export function getSourceFiles(projectRoot: string): string[] {
    const files: string[] = [];
    function walk(dir: string) {
        let entries: string[];
        try { entries = readdirSync(dir); } catch { return; }
        for (const entry of entries) {
            if (IGNORE_DIRS.has(entry)) continue;
            const full = join(dir, entry);
            let stat;
            try { stat = statSync(full); } catch { continue; }
            if (stat.isDirectory()) walk(full);
            else if (SUPPORTED_EXTS.has(extname(entry))) files.push(full);
        }
    }
    walk(projectRoot);
    return files;
}

export function buildIndex(projectRoot: string): OidIndex {
    const index: OidIndex = new Map();
    walkDir(projectRoot, index);
    return index;
}

export function refreshFile(filePath: string, index: OidIndex): void {
    // Remove entradas antigas deste arquivo
    for (const [oid, loc] of index) {
        if (loc.filePath === filePath) index.delete(oid);
    }
    // Re-escaneia
    try {
        const content = readFileSync(filePath, 'utf-8');
        scanFileForOids(content, filePath, index);
    } catch { /* arquivo deletado ou ilegível */ }
}
