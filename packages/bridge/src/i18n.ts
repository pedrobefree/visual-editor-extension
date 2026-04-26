import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getAstFromContent, t, traverse, DATA_OID_ATTR } from '@visual-edit/parser';

/* ── Localizar arquivos de mensagens ─────────────────────────────────────── */

const I18N_DIRS = [
    'messages', 'locales', 'public/locales',
    'src/messages', 'src/locales', 'src/i18n',
    'i18n', 'translations', 'lang',
];

export interface I18nFiles {
    dir: string;
    locales: string[];               // e.g. ['pt', 'en', 'es']
    files: Record<string, string>;  // locale → absolute path
}

export function findI18nFiles(projectRoot: string): I18nFiles | null {
    for (const rel of I18N_DIRS) {
        const dir = join(projectRoot, rel);
        if (!existsSync(dir)) continue;

        let entries: string[];
        try { entries = readdirSync(dir); } catch { continue; }

        const jsonFiles = entries.filter(f => f.endsWith('.json'));
        if (!jsonFiles.length) continue;

        const files: Record<string, string> = {};
        for (const f of jsonFiles) {
            const locale = f.replace('.json', '');
            files[locale] = join(dir, f);
        }

        return { dir, locales: Object.keys(files), files };
    }
    return null;
}

/* ── Ler valor de uma chave aninhada num JSON ───────────────────────────── */

function getNestedValue(obj: Record<string, unknown>, key: string): string | null {
    const parts = key.split('.');
    let cur: unknown = obj;
    for (const p of parts) {
        if (typeof cur !== 'object' || cur === null) return null;
        cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === 'string' ? cur : null;
}

function setNestedValue(obj: Record<string, unknown>, key: string, value: string): boolean {
    const parts = key.split('.');
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i]!;
        if (typeof cur[p] !== 'object' || cur[p] === null) return false;
        cur = cur[p] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1]!;
    if (!(last in cur)) return false;
    cur[last] = value;
    return true;
}

/* ── Detectar chave i18n na JSX do elemento ─────────────────────────────── */

/**
 * Dado um arquivo fonte e um OID, verifica se o elemento usa t('chave').
 * Suporta: {t('key')}, {t('ns.key')}, children diretos com chamada de tradução.
 */
export function detectI18nKey(filePath: string, oid: string): string | null {
    let source: string;
    try { source = readFileSync(filePath, 'utf-8'); } catch { return null; }

    const ast = getAstFromContent(source);
    if (!ast) return null;

    let foundKey: string | null = null;

    traverse(ast, {
        JSXOpeningElement(path) {
            // Verifica se este elemento tem o OID que procuramos
            const hasOid = path.node.attributes.some(
                attr =>
                    t.isJSXAttribute(attr) &&
                    attr.name.name === DATA_OID_ATTR &&
                    t.isStringLiteral(attr.value) &&
                    attr.value.value === oid,
            );
            if (!hasOid) return;

            const parent = path.parent;
            if (!t.isJSXElement(parent)) { path.stop(); return; }

            // Procura t('key') ou translate('key') nos filhos diretos
            for (const child of parent.children) {
                if (!t.isJSXExpressionContainer(child)) continue;
                const expr = child.expression;
                if (!t.isCallExpression(expr)) continue;

                const callee = expr.callee;
                const isT =
                    (t.isIdentifier(callee) &&
                        ['t', 'translate', '__', '_t', 'i18n'].includes(callee.name)) ||
                    (t.isMemberExpression(callee) &&
                        t.isIdentifier(callee.property) &&
                        ['t', 'translate'].includes(callee.property.name));

                if (!isT) continue;

                // Primeiro argumento string = a chave
                const firstArg = expr.arguments[0];
                if (firstArg && t.isStringLiteral(firstArg)) {
                    foundKey = firstArg.value;
                    break;
                }
            }

            path.stop();
        },
    });

    return foundKey;
}

/* ── Ler traduções de uma chave em todos os idiomas ─────────────────────── */

export interface I18nKeyInfo {
    key: string;
    translations: Record<string, string>;   // locale → value
    files: Record<string, string>;          // locale → filePath (para escrita)
}

export function getTranslations(key: string, i18n: I18nFiles): I18nKeyInfo {
    const translations: Record<string, string> = {};
    for (const [locale, filePath] of Object.entries(i18n.files)) {
        try {
            const json = JSON.parse(readFileSync(filePath, 'utf-8'));
            const val = getNestedValue(json, key);
            if (val !== null) translations[locale] = val;
        } catch { /* arquivo inválido */ }
    }
    return { key, translations, files: i18n.files };
}

/* ── Atualizar tradução ──────────────────────────────────────────────────── */

export interface UpdateI18nRequest {
    key: string;
    locale: string;
    value: string;
    filePath: string;
}

export function updateTranslation(req: UpdateI18nRequest): boolean {
    try {
        const json: Record<string, unknown> = JSON.parse(readFileSync(req.filePath, 'utf-8'));
        if (!setNestedValue(json, req.key, req.value)) return false;
        writeFileSync(req.filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
        return true;
    } catch {
        return false;
    }
}
