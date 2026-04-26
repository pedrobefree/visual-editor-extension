import { DATA_OID_ATTR } from './constants';
import { isReactFragment } from './helpers';
import { createOid } from './oid';
import { t, traverse, type T } from './packages';

/**
 * Deterministic OID: hash(filePath + ":" + line + ":" + col)
 * Usa posição no código-fonte para garantir OIDs idênticos em SSR e client,
 * independentemente de diferenças de tree-shaking entre as duas compilações.
 * Exportado para que o bridge scanner possa gerar os mesmos OIDs sem modificar arquivos.
 */
export function deterministicOid(filePath: string, line: number, col: number): string {
    const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-._:';
    const seed = `${filePath}::${line}:${col}`;
    let h = 5381;
    for (let i = 0; i < seed.length; i++) {
        h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    }
    let id = '';
    let n = Math.abs(h) || 1;
    for (let i = 0; i < 7; i++) {
        id += CHARS[n % CHARS.length];
        n = Math.floor(n / CHARS.length);
    }
    return id;
}

function generateUniqueOid(globalOids: Set<string>, localOids: Set<string>): string {
    let oid: string;
    do { oid = createOid(); } while (globalOids.has(oid) || localOids.has(oid));
    return oid;
}

function createOidAttribute(value: string): T.JSXAttribute {
    return t.jSXAttribute(t.jSXIdentifier(DATA_OID_ATTR), t.stringLiteral(value));
}

function removeAllOidAttributes(
    attributes: (T.JSXAttribute | T.JSXSpreadAttribute)[],
    indices: number[],
): void {
    indices.sort((a, b) => b - a).forEach((i) => attributes.splice(i, 1));
}

export interface AddOidsOptions {
    /** Quando fornecido, gera OIDs determinísticos (fix para SSR hydration). */
    filePath?: string;
}

export function addOidsToAst(
    ast: T.File,
    globalOids = new Set<string>(),
    options: AddOidsOptions = {},
): { ast: T.File; modified: boolean } {
    let modified = false;
    const localOids = new Set<string>();
    const { filePath } = options;

    function makeOid(node: T.JSXOpeningElement): string {
        if (filePath) {
            // Usa posição no fonte (line:col) — estável entre compilações SSR e client.
            const loc = node.loc?.start;
            const line = loc?.line ?? 0;
            const col = loc?.column ?? 0;
            return deterministicOid(filePath, line, col);
        }
        return generateUniqueOid(globalOids, localOids);
    }

    traverse(ast, {
        JSXOpeningElement(path) {
            if (isReactFragment(path.node)) { return; }

            const attributes = path.node.attributes;
            const existing = getAllExistingOids(attributes);

            if (existing.indices.length === 0) {
                // Elemento sem OID — injeta
                const oid = makeOid(path.node);
                attributes.push(createOidAttribute(oid));
                localOids.add(oid);
                modified = true;
            } else if (existing.hasMultiple || existing.hasInvalid) {
                // OIDs duplicados/inválidos — limpa e regera
                removeAllOidAttributes(attributes, existing.indices);
                const oid = makeOid(path.node);
                attributes.push(createOidAttribute(oid));
                localOids.add(oid);
                modified = true;
            } else {
                // OID único e válido — mantém (evita reescrever arquivos desnecessariamente)
                localOids.add(existing.values[0]!);
            }
        },
    });

    return { ast, modified };
}

export function getAllExistingOids(attributes: (T.JSXAttribute | T.JSXSpreadAttribute)[]): {
    indices: number[];
    values: string[];
    hasMultiple: boolean;
    hasInvalid: boolean;
} {
    const indices: number[] = [];
    const values: string[] = [];
    let hasInvalid = false;

    attributes.forEach((attr, index) => {
        if (t.isJSXAttribute(attr) && attr.name.name === DATA_OID_ATTR) {
            indices.push(index);
            const v = attr.value;
            if (!v || !t.isStringLiteral(v) || !v.value || v.value.trim() === '') {
                hasInvalid = true;
                values.push('');
            } else {
                values.push(v.value);
            }
        }
    });

    return { indices, values, hasMultiple: indices.length > 1, hasInvalid };
}
