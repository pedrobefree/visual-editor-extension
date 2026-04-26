import { readFileSync, writeFileSync } from 'fs';
import {
    getAstFromContent,
    getContentFromAst,
    findNodeByPosition,
    replaceNodeClasses,
    addClassToNode,
    updateNodeTextContent,
    getSinglePropIdentifier,
    getAttrIdentifier,
    updateNodeAttrValue,
    getExportedComponentNames,
    updatePropValues,
} from '@visual-edit/parser';
import { getSourceFiles } from './scanner';
import type { OidLocation } from './scanner';

export type EditKind = 'text' | 'class' | 'class-add' | 'attr';

export interface EditRequest {
    oid: string;
    kind: EditKind;
    payload: string;
    /** For kind='text': original DOM text used to locate the prop in parent files. */
    currentText?: string;
    /** For kind='attr': the JSX attribute name to update (e.g. 'placeholder'). */
    propName?: string;
}

export interface EditResult {
    ok: boolean;
    error?: string;
    filePath?: string;
}

/**
 * Tries to edit the string-literal prop in the parent component files rather
 * than the template that owns the OID.
 *
 * Flow:
 *  1. Parse the template file (e.g. Input.tsx).
 *  2. Find the JSXElement at loc → check if its text content is a single
 *     identifier expression like {label}.
 *  3. Collect the exported PascalCase component names from that file.
 *  4. Scan all project source files for usages of those components where the
 *     identified prop has the value `currentText` (e.g. label="First name").
 *  5. Update every matching occurrence to `newText`.
 *
 * Returns the list of files that were modified, or an empty array if nothing
 * could be resolved (caller should fall back to template edit).
 */
function tryPropEdit(
    loc: OidLocation,
    propName: string,
    currentText: string,
    newText: string,
    projectRoot: string,
): string[] {
    const { filePath, line, col } = loc;

    // -- 1. Get exported component names from the template file ---------
    let templateContent: string;
    try { templateContent = readFileSync(filePath, 'utf-8'); } catch { return []; }

    const templateAst = getAstFromContent(templateContent, true);
    if (!templateAst) return [];

    const componentNames = getExportedComponentNames(templateAst);
    if (!componentNames.length) return [];

    // -- 2. Scan project files for matching prop usages ------------------
    const sourceFiles = getSourceFiles(projectRoot);
    const modified: string[] = [];

    for (const srcFile of sourceFiles) {
        if (srcFile === filePath) continue; // skip the template itself
        let content: string;
        try { content = readFileSync(srcFile, 'utf-8'); } catch { continue; }

        const ast = getAstFromContent(content, true);
        if (!ast) continue;

        const changed = updatePropValues(ast, componentNames, propName, currentText, newText);
        if (!changed) continue;

        const newContent = getContentFromAst(ast, content);
        try {
            writeFileSync(srcFile, newContent, 'utf-8');
            modified.push(srcFile);
        } catch { /* skip unwritable files */ }
    }

    return modified;
}

export function applyEdit(loc: OidLocation, req: EditRequest, projectRoot = ''): EditResult {
    const { filePath, line, col } = loc;

    let content: string;
    try {
        content = readFileSync(filePath, 'utf-8');
    } catch (e) {
        return { ok: false, error: `Cannot read file: ${filePath}` };
    }

    const ast = getAstFromContent(content);
    if (!ast) return { ok: false, error: 'AST parse failed' };

    const node = findNodeByPosition(ast, line, col);
    if (!node) return { ok: false, error: `Node not found at ${filePath}:${line}:${col}` };

    if (req.kind === 'text') {
        // Check if this element's text content is a single identifier prop
        // expression like {label} or {children}.
        const propIdentifier = getSinglePropIdentifier(node);

        if (propIdentifier && req.currentText !== undefined && projectRoot) {
            // Attempt to edit the prop value in the parent component files
            // rather than the template. This way "First name" and "Last name"
            // stay independent even though they share the same OID.
            const modified = tryPropEdit(loc, propIdentifier, req.currentText, req.payload, projectRoot);
            if (modified.length > 0) {
                const relPaths = modified.map(f => f.replace(projectRoot + '/', '')).join(', ');
                console.log(`[visual-edit] prop "${propIdentifier}" edit → ${relPaths}`);
                return { ok: true, filePath: modified[0]! };
            }
            // Fall through to template edit if no parent usage found
        }

        updateNodeTextContent(node, req.payload);

    } else if (req.kind === 'class') {
        replaceNodeClasses(node, req.payload);
    } else if (req.kind === 'class-add') {
        addClassToNode(node, req.payload);
    } else if (req.kind === 'attr') {
        if (!req.propName) return { ok: false, error: 'propName required for kind=attr' };

        // If the attribute value is a dynamic identifier like {placeholder},
        // try to edit the prop in parent components instead.
        const identifier = getAttrIdentifier(node, req.propName);
        if (identifier && req.currentText !== undefined && projectRoot) {
            const modified = tryPropEdit(loc, identifier, req.currentText, req.payload, projectRoot);
            if (modified.length > 0) {
                console.log(`[visual-edit] attr "${req.propName}" (via prop "${identifier}") → ${modified.join(', ')}`);
                return { ok: true, filePath: modified[0]! };
            }
        }

        // Fallback: edit the static string-literal attribute directly in the template
        const changed = updateNodeAttrValue(node, req.propName, req.payload);
        if (!changed) return { ok: false, error: `Attr "${req.propName}" not found or not a string literal` };
    }

    const newContent = getContentFromAst(ast, content);

    try {
        writeFileSync(filePath, newContent, 'utf-8');
    } catch (e) {
        return { ok: false, error: `Cannot write file: ${filePath}` };
    }

    return { ok: true, filePath };
}
