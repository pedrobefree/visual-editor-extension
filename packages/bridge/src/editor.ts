import { readFileSync, writeFileSync } from 'fs';
import {
    getAstFromContent,
    getContentFromAst,
    findNodeByPosition,
    findNodePathByPosition,
    replaceNodeClasses,
    addClassToNode,
    updateNodeTextContent,
    setNodeTextToIdentifier,
    getSinglePropIdentifier,
    getAttrIdentifier,
    updateNodeAttrValue,
    getExportedComponentNames,
    updatePropValues,
    updatePropValueAtIndex,
    updateComponentUsageStringPropAtIndex,
    enableSlotClassOverride,
    insertElementAtPath,
    moveElementByOffset,
    moveElementAtPath,
    moveElementRelativeToSibling,
    removeElementAtPath,
    type InsertElementSpec,
    type InsertPlacement,
    t,
} from '@visual-edit/parser';
import { getSourceFiles, type OidLocation } from './scanner';

export type EditKind = 'text' | 'class' | 'class-add' | 'attr' | 'insert' | 'remove' | 'move';

export interface InsertPayload {
    parentOid: string;
    element: InsertElementSpec;
    placement?: InsertPlacement;
    index?: number;
}

export interface MovePayload {
    index: number;
    direction?: 'up' | 'down';
    targetOid?: string;
    position?: 'before' | 'after';
}

export interface EditRequest {
    oid: string;
    kind: EditKind;
    payload: string | InsertPayload | MovePayload | null;
    /** instance = edit component usage props when possible; component = edit source template globally. */
    scope?: 'instance' | 'component';
    /** Zero-based index of this rendered OID among same-OID elements on the active page. */
    instanceIndex?: number;
    /** Number of rendered elements sharing this OID on the active page. */
    instanceCount?: number;
    /** Ancestor OIDs from the rendered DOM, used to infer the active page/source file. */
    ancestorOids?: string[];
    /** Absolute source files that should be scanned before the rest of the project. */
    sourceFileHints?: string[];
    /** For kind='text': original DOM text used to locate the prop in parent files. */
    currentText?: string;
    /** For kind='attr': the JSX attribute name to update (e.g. 'placeholder'). */
    propName?: string;
    /** Resolved by the bridge when a structural insert targets a parent OID. */
    parentLoc?: OidLocation;
    /** Resolved by the bridge when a move targets a sibling OID. */
    targetLoc?: OidLocation;
}

function orderedSourceFiles(projectRoot: string, hints?: string[]): string[] {
    const files = getSourceFiles(projectRoot);
    const uniqueHints = Array.from(new Set(hints ?? [])).filter(Boolean);
    return [
        ...uniqueHints.filter(file => files.includes(file)),
        ...files.filter(file => !uniqueHints.includes(file)),
    ];
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
    currentText: string | undefined,
    newText: string,
    projectRoot: string,
    instanceIndex?: number,
    sourceFileHints?: string[],
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
    const sourceFiles = orderedSourceFiles(projectRoot, sourceFileHints);
    const modified: string[] = [];

    for (const srcFile of sourceFiles) {
        if (srcFile === filePath) continue; // skip the template itself
        let content: string;
        try { content = readFileSync(srcFile, 'utf-8'); } catch { continue; }

        const ast = getAstFromContent(content, true);
        if (!ast) continue;

        const changed = instanceIndex === undefined
            ? currentText !== undefined && updatePropValues(ast, componentNames, propName, currentText, newText)
            : updatePropValueAtIndex(ast, componentNames, propName, currentText, newText, instanceIndex);
        if (!changed) continue;

        const newContent = getContentFromAst(ast, content);
        try {
            writeFileSync(srcFile, newContent, 'utf-8');
            modified.push(srcFile);
        } catch { /* skip unwritable files */ }
    }

    return modified;
}

function slotClassPropName(oid: string): string {
    const clean = oid.replace(/[^a-z0-9]/gi, '');
    return `ve${clean.charAt(0).toUpperCase()}${clean.slice(1)}ClassName`;
}

function inferTextPropName(node: ReturnType<typeof findNodeByPosition>): string | null {
    if (!node) return null;
    const name = node.openingElement.name;
    if (t.isJSXIdentifier(name) && name.name === 'label') return 'label';
    return null;
}

function tryInstanceClassEdit(
    loc: OidLocation,
    node: NonNullable<ReturnType<typeof findNodeByPosition>>,
    className: string,
    projectRoot: string,
    oid: string,
    instanceIndex?: number,
    sourceFileHints?: string[],
): string[] {
    if (instanceIndex === undefined) return [];
    const { filePath } = loc;

    let templateContent: string;
    try { templateContent = readFileSync(filePath, 'utf-8'); } catch { return []; }

    const templateAst = getAstFromContent(templateContent, true);
    if (!templateAst) return [];

    const componentNames = getExportedComponentNames(templateAst);
    if (!componentNames.length) return [];
    const slotProp = slotClassPropName(oid);
    const changedTemplate = enableSlotClassOverride(templateAst, node, slotProp);
    if (!changedTemplate) return [];

    const sourceFiles = orderedSourceFiles(projectRoot, sourceFileHints);
    const modified: string[] = [];

    for (const srcFile of sourceFiles) {
        if (srcFile === filePath) continue;
        let content: string;
        try { content = readFileSync(srcFile, 'utf-8'); } catch { continue; }

        const ast = getAstFromContent(content, true);
        if (!ast) continue;

        const changed = updateComponentUsageStringPropAtIndex(ast, componentNames, slotProp, className, instanceIndex);
        if (!changed) continue;

        const newContent = getContentFromAst(ast, content);
        try {
            writeFileSync(srcFile, newContent, 'utf-8');
            modified.push(srcFile);
        } catch { /* skip unwritable files */ }
        break;
    }

    if (modified.length > 0) {
        try {
            writeFileSync(filePath, getContentFromAst(templateAst, templateContent), 'utf-8');
            modified.push(filePath);
        } catch { /* skip unwritable template */ }
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
    const nodePath = findNodePathByPosition(ast, line, col);
    if (!node || !nodePath) return { ok: false, error: `Node not found at ${filePath}:${line}:${col}` };

    if (req.kind === 'text') {
        if (typeof req.payload !== 'string') return { ok: false, error: 'String payload required for text edit' };
        // Check if this element's text content is a single identifier prop
        // expression like {label} or {children}.
        const propIdentifier = getSinglePropIdentifier(node);
        const propName = propIdentifier ?? inferTextPropName(node);

        if (propName && req.scope !== 'component' && projectRoot) {
            // Attempt to edit the prop value in the parent component files
            // rather than the template. This way "First name" and "Last name"
            // stay independent even though they share the same OID.
            const modified = tryPropEdit(loc, propName, propIdentifier ? req.currentText : undefined, req.payload, projectRoot, req.instanceIndex, req.sourceFileHints);
            if (modified.length > 0) {
                if (!propIdentifier) {
                    setNodeTextToIdentifier(node, propName);
                    try {
                        writeFileSync(filePath, getContentFromAst(ast, content), 'utf-8');
                        modified.push(filePath);
                    } catch { /* keep usage edit even if template write fails */ }
                }
                const relPaths = modified.map(f => f.replace(projectRoot + '/', '')).join(', ');
                console.log(`[visual-edit] prop "${propName}" edit → ${relPaths}`);
                return { ok: true, filePath: modified[0]! };
            }
            return {
                ok: false,
                error: `Não consegui localizar com segurança esta instância de "${propName}". Use "Componente" para editar globalmente.`,
            };
        }

        updateNodeTextContent(node, req.payload);

    } else if (req.kind === 'class') {
        if (typeof req.payload !== 'string') return { ok: false, error: 'String payload required for class edit' };
        if (req.scope !== 'component' && projectRoot && (req.instanceCount ?? 1) > 1) {
            const modified = tryInstanceClassEdit(loc, node, req.payload, projectRoot, req.oid, req.instanceIndex, req.sourceFileHints);
            if (modified.length > 0) {
                const relPaths = modified.map(f => f.replace(projectRoot + '/', '')).join(', ');
                console.log(`[visual-edit] instance class edit → ${relPaths}`);
                return { ok: true, filePath: modified[0]! };
            }
            return {
                ok: false,
                error: 'Não consegui persistir classes nesta aplicação do componente. Use "Componente" para editar o template global.',
            };
        }
        replaceNodeClasses(node, req.payload);
    } else if (req.kind === 'class-add') {
        if (typeof req.payload !== 'string') return { ok: false, error: 'String payload required for class-add edit' };
        addClassToNode(node, req.payload);
    } else if (req.kind === 'attr') {
        if (typeof req.payload !== 'string') return { ok: false, error: 'String payload required for attr edit' };
        if (!req.propName) return { ok: false, error: 'propName required for kind=attr' };

        // If the attribute value is a dynamic identifier like {placeholder},
        // try to edit the prop in parent components instead.
        const identifier = getAttrIdentifier(node, req.propName);
        if (identifier && req.scope !== 'component' && req.currentText !== undefined && projectRoot) {
            const modified = tryPropEdit(loc, identifier, req.currentText, req.payload, projectRoot, req.instanceIndex, req.sourceFileHints);
            if (modified.length > 0) {
                console.log(`[visual-edit] attr "${req.propName}" (via prop "${identifier}") → ${modified.join(', ')}`);
                return { ok: true, filePath: modified[0]! };
            }
            return {
                ok: false,
                error: `Não consegui localizar com segurança esta instância de "${identifier}". Use "Componente" para editar globalmente.`,
            };
        }

        // Fallback: edit the static string-literal attribute directly in the template
        const changed = updateNodeAttrValue(node, req.propName, req.payload);
        if (!changed) return { ok: false, error: `Attr "${req.propName}" not found or not a string literal` };
    } else if (req.kind === 'insert') {
        const payload = req.payload;
        if (!payload || typeof payload !== 'object' || !('parentOid' in payload) || !('element' in payload)) {
            return { ok: false, error: 'Invalid insert payload' };
        }
        if (!req.parentLoc) return { ok: false, error: 'Parent OID not found for insert' };

        const parentContent = readFileSync(req.parentLoc.filePath, 'utf-8');
        const parentAst = getAstFromContent(parentContent);
        if (!parentAst) return { ok: false, error: 'AST parse failed for parent node' };

        const parentPath = findNodePathByPosition(parentAst, req.parentLoc.line, req.parentLoc.col);
        if (!parentPath) return { ok: false, error: 'Parent node not found for insert' };

        insertElementAtPath(
            parentPath,
            payload.element,
            payload.placement ?? 'append',
            payload.index,
        );

        try {
            writeFileSync(req.parentLoc.filePath, getContentFromAst(parentAst, parentContent), 'utf-8');
        } catch {
            return { ok: false, error: `Cannot write file: ${req.parentLoc.filePath}` };
        }
        return { ok: true, filePath: req.parentLoc.filePath };
    } else if (req.kind === 'remove') {
        const changed = removeElementAtPath(nodePath);
        if (!changed) return { ok: false, error: 'Failed to remove selected element' };
    } else if (req.kind === 'move') {
        const payload = req.payload;
        if (!payload || typeof payload !== 'object' || !('index' in payload) || typeof payload.index !== 'number') {
            return { ok: false, error: 'Invalid move payload' };
        }
        const movePayload = payload as MovePayload;
        const targetLoc = req.targetLoc;
        let changed = false;
        if (movePayload.direction === 'up' || movePayload.direction === 'down') {
            changed = moveElementByOffset(nodePath, movePayload.direction === 'up' ? -1 : 1);
        } else if (targetLoc) {
            const targetPath = findNodePathByPosition(ast, targetLoc.line, targetLoc.col);
            if (!targetPath) return { ok: false, error: 'Target node not found for move' };
            changed = moveElementRelativeToSibling(nodePath, targetPath, movePayload.position ?? 'before');
        } else {
            changed = moveElementAtPath(nodePath, movePayload.index);
        }
        if (!changed) return { ok: false, error: 'Failed to move selected element' };
    }

    const newContent = getContentFromAst(ast, content);

    try {
        writeFileSync(filePath, newContent, 'utf-8');
    } catch (e) {
        return { ok: false, error: `Cannot write file: ${filePath}` };
    }

    return { ok: true, filePath };
}
