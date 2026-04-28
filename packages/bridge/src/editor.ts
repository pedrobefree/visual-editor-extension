import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import {
    getAstFromContent,
    getContentFromAst,
    findNodeByPosition,
    findNodePathByPosition,
    replaceNodeClasses,
    addClassToNode,
    updateNodeTextContent,
    setNodeTextToIdentifier,
    enableTextPropOverride,
    getSinglePropIdentifier,
    getAttrIdentifier,
    updateNodeAttrValue,
    getExportedComponentNames,
    updatePropValues,
    updatePropValueAtIndex,
    updateComponentUsageStringPropAtIndex,
    updateComponentUsageChildrenAtIndex,
    duplicateComponentUsageAtIndex,
    removeComponentUsageAtIndex,
    removeComponentUsageByText,
    enableSlotClassOverride,
    duplicateElementAtPath,
    extractElementToComponentAtPath,
    insertElementAtPath,
    moveElementByOffset,
    moveElementAtPath,
    moveElementRelativeToSibling,
    moveElementToParentPath,
    removeElementAtPath,
    type InsertElementSpec,
    type InsertPlacement,
    t,
    traverse,
    type T,
} from '@visual-edit/parser';
import { getSourceFiles, type OidLocation } from './scanner';

export type EditKind = 'text' | 'class' | 'class-add' | 'attr' | 'insert' | 'remove' | 'move' | 'duplicate' | 'componentize' | 'insert-component';

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
    parentOid?: string;
    position?: 'before' | 'after';
    placement?: InsertPlacement;
}

export interface ComponentizePayload {
    name: string;
    destinationDir?: string;
}

export interface InsertComponentPayload {
    parentOid: string;
    componentName: string;
    filePath: string;
    placement?: InsertPlacement;
    index?: number;
}

export interface EditRequest {
    oid: string;
    kind: EditKind;
    payload: string | InsertPayload | MovePayload | ComponentizePayload | InsertComponentPayload | null;
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
    /** True when the selected element is the root of a component instance (not a child element within it). */
    isComponentRoot?: boolean;
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

function normalizePathForMatch(filePath: string): string {
    return filePath.split(sep).join('/');
}

function isRouteEntryFile(filePath: string): boolean {
    const normalized = normalizePathForMatch(filePath);
    if (/(^|\/)(app|src\/app)\/.*\/(page|layout|template|loading|error|default)\.(tsx|jsx)$/.test(normalized)) return true;
    if (/(^|\/)(app|src\/app)\/not-found\.(tsx|jsx)$/.test(normalized)) return true;
    if (/(^|\/)(pages|src\/pages)\//.test(normalized)) return true;
    return false;
}

export interface EditResult {
    ok: boolean;
    error?: string;
    filePath?: string;
    /** Absolute path of a newly created component file (componentize only). */
    newFilePath?: string;
    /** PascalCase name of the extracted component (componentize only). */
    componentName?: string;
}

function updatePropInUsageFile(
    ast: T.File,
    componentNames: string[],
    propName: string,
    currentText: string | undefined,
    newText: string,
    instanceIndex: number | undefined,
): boolean {
    return propName === 'children' && instanceIndex !== undefined
        ? updateComponentUsageChildrenAtIndex(ast, componentNames, newText, instanceIndex)
        : instanceIndex === undefined
        ? currentText !== undefined && updatePropValues(ast, componentNames, propName, currentText, newText)
        : updatePropValueAtIndex(ast, componentNames, propName, currentText, newText, instanceIndex);
}

function usagePropIdentifier(
    usage: T.JSXElement,
    propName: string,
): string | null {
    if (propName === 'children') {
        const meaningfulChildren = usage.children.filter(child => {
            if (t.isJSXText(child)) return child.value.trim() !== '';
            if (t.isJSXExpressionContainer(child)) return !t.isJSXEmptyExpression(child.expression);
            return false;
        });
        if (meaningfulChildren.length !== 1) return null;
        const child = meaningfulChildren[0]!;
        if (!t.isJSXExpressionContainer(child) || !t.isIdentifier(child.expression)) return null;
        return child.expression.name;
    }

    for (const attr of usage.openingElement.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name) || attr.name.name !== propName) continue;
        if (!t.isJSXExpressionContainer(attr.value)) return null;
        if (!t.isIdentifier(attr.value.expression)) return null;
        return attr.value.expression.name;
    }

    return null;
}

function findSingleComponentUsageIdentifier(
    ast: T.File,
    componentNames: string[],
    propName: string,
): string | null {
    const nameSet = new Set(componentNames);
    let identifier: string | null = null;
    let usageCount = 0;

    traverse(ast, {
        JSXElement(path) {
            const nameNode = path.node.openingElement.name;
            if (!t.isJSXIdentifier(nameNode) || !nameSet.has(nameNode.name)) return;
            usageCount += 1;
            if (usageCount > 1) {
                identifier = null;
                path.stop();
                return;
            }
            identifier = usagePropIdentifier(path.node, propName);
        },
    });

    return usageCount === 1 ? identifier : null;
}

function tryPropEditThroughSingleUsageChain(
    componentNames: string[],
    propName: string,
    currentText: string | undefined,
    newText: string,
    projectRoot: string,
    instanceIndex: number,
    sourceFileHints?: string[],
): string[] {
    let activeComponentNames = componentNames;
    let activePropName = propName;
    const hintFiles = Array.from(new Set(sourceFileHints ?? [])).filter(Boolean);

    for (const srcFile of hintFiles) {
        let content: string;
        try { content = readFileSync(srcFile, 'utf-8'); } catch { continue; }

        const ast = getAstFromContent(content, true);
        if (!ast) continue;

        const changed = updatePropInUsageFile(ast, activeComponentNames, activePropName, currentText, newText, instanceIndex);
        if (changed) {
            const newContent = getContentFromAst(ast, content);
            try {
                writeFileSync(srcFile, newContent, 'utf-8');
                return [srcFile];
            } catch {
                return [];
            }
        }

        const nextPropName = findSingleComponentUsageIdentifier(ast, activeComponentNames, activePropName);
        if (!nextPropName) continue;

        const nextComponentNames = getExportedComponentNames(ast);
        if (!nextComponentNames.length) continue;

        activeComponentNames = nextComponentNames;
        activePropName = nextPropName;
    }

    return [];
}

function toPascalCase(input: string): string {
    const name = input
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return /^[A-Z]/.test(name) ? name : `Visual${name || 'Component'}`;
}

function defaultComponentDir(projectRoot: string): string {
    const root = existsSync(join(projectRoot, 'src')) ? join(projectRoot, 'src') : projectRoot;
    return join(root, 'components', 'visual-edit');
}

function resolveDestinationDir(projectRoot: string, destinationDir?: string): { dir: string; error?: string } {
    if (!destinationDir) return { dir: defaultComponentDir(projectRoot) };

    // Prevent path traversal: destination must stay inside projectRoot
    const resolved = join(projectRoot, destinationDir);
    if (!resolved.startsWith(projectRoot + '/') && resolved !== projectRoot) {
        return { dir: '', error: `Destination outside project root: ${destinationDir}` };
    }
    return { dir: resolved };
}

function componentFilePath(dir: string, componentName: string): string {
    let filePath = join(dir, `${componentName}.tsx`);
    let index = 2;
    while (existsSync(filePath)) {
        filePath = join(dir, `${componentName}${index}.tsx`);
        index += 1;
    }
    return filePath;
}

function importPath(fromFile: string, toFile: string): string {
    const rel = relative(dirname(fromFile), toFile).replaceAll(sep, '/').replace(/\.(tsx|jsx)$/, '');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

function rewriteImportSource(source: string, fromFile: string, toFile: string): string {
    if (!source.startsWith('.')) return source;
    const absoluteTarget = join(dirname(fromFile), source);
    const rel = relative(dirname(toFile), absoluteTarget).replaceAll(sep, '/');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

function collectUsedIdentifiers(node: T.JSXElement): Set<string> {
    const used = new Set<string>();
    const ast = t.file(t.program([t.expressionStatement(node)]));

    traverse(ast, {
        JSXIdentifier(path) {
            const name = path.node.name;
            if (/^[A-Z]/.test(name)) used.add(name);
        },
        Identifier(path) {
            const name = path.node.name;
            if (name === 'undefined') return;
            used.add(name);
        },
    });

    return used;
}

function importsForExtractedComponent(ast: T.File, used: Set<string>, fromFile: string, toFile: string): string {
    const imports: T.ImportDeclaration[] = [];

    for (const statement of ast.program.body) {
        if (!t.isImportDeclaration(statement)) continue;
        const matchingSpecifiers = statement.specifiers.filter(spec => used.has(spec.local.name));
        if (!matchingSpecifiers.length) continue;
        const clone = t.cloneNode(statement, true);
        clone.specifiers = clone.specifiers.filter(spec => used.has(spec.local.name));
        clone.source = t.stringLiteral(rewriteImportSource(String(statement.source.value), fromFile, toFile));
        imports.push(clone);
    }

    if (!imports.length) return '';
    const importAst = t.file(t.program(imports));
    return getContentFromAst(importAst, '').trim();
}

function addNamedImport(ast: T.File, componentName: string, source: string): void {
    const body = ast.program.body;

    for (const statement of body) {
        if (!t.isImportDeclaration(statement)) continue;
        const hasName = statement.specifiers.some(spec =>
            (t.isImportSpecifier(spec) || t.isImportDefaultSpecifier(spec)) &&
            spec.local.name === componentName,
        );
        if (!hasName) continue;
        // Already imported from some source — if it's from our target source, ensure
        // the specifier is present; otherwise the alias/path differs but the name
        // is already bound, so we skip adding a duplicate.
        if (statement.source.value === source) {
            const hasSpecifier = statement.specifiers.some(spec =>
                t.isImportSpecifier(spec) &&
                t.isIdentifier(spec.imported) &&
                spec.imported.name === componentName,
            );
            if (!hasSpecifier) {
                statement.specifiers.push(t.importSpecifier(t.identifier(componentName), t.identifier(componentName)));
            }
        }
        return;
    }

    const declaration = t.importDeclaration(
        [t.importSpecifier(t.identifier(componentName), t.identifier(componentName))],
        t.stringLiteral(source),
    );
    const firstNonImport = body.findIndex(statement => !t.isImportDeclaration(statement));
    body.splice(firstNonImport === -1 ? body.length : firstNonImport, 0, declaration);
}

function normalizeComponentizeOutput(content: string): string {
    return content
        .replace(/;(?=import\s)/g, ';\n')
        .replace(/\n{3,}/g, '\n\n');
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

        const changed = updatePropInUsageFile(ast, componentNames, propName, currentText, newText, instanceIndex);
        if (!changed) continue;

        const newContent = getContentFromAst(ast, content);
        try {
            writeFileSync(srcFile, newContent, 'utf-8');
            modified.push(srcFile);
        } catch { /* skip unwritable files */ }
        // For instance-specific edits stop after the first matching file.
        // Global edits (instanceIndex === undefined) continue to update all files.
        if (instanceIndex !== undefined) break;
    }

    if (!modified.length && instanceIndex !== undefined) {
        return tryPropEditThroughSingleUsageChain(
            componentNames,
            propName,
            currentText,
            newText,
            projectRoot,
            instanceIndex,
            sourceFileHints,
        );
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

function inferStaticTextOverridePropName(node: NonNullable<ReturnType<typeof findNodeByPosition>>): string {
    const name = node.openingElement.name;
    if (!t.isJSXIdentifier(name)) return 'text';
    switch (name.name) {
        case 'button':
            return 'buttonText';
        case 'a':
            return 'linkText';
        case 'label':
            return 'label';
        default:
            return 'text';
    }
}

function isCustomComponentUsage(node: NonNullable<ReturnType<typeof findNodeByPosition>>): boolean {
    const name = node.openingElement.name;
    return t.isJSXIdentifier(name) && /^[A-Z]/.test(name.name);
}

function nodeReferencesIdentifier(node: T.JSXElement, identifier: string): boolean {
    const ast = t.file(t.program([t.expressionStatement(t.cloneNode(node, true))]));
    let found = false;
    traverse(ast, {
        Identifier(path) {
            if (path.node.name !== identifier) return;
            found = true;
            path.stop();
        },
    });
    return found;
}

function isTopLevelComponentRenderNode(nodePath: NonNullable<ReturnType<typeof findNodePathByPosition>>): boolean {
    let current: typeof nodePath.parentPath | null = nodePath.parentPath;
    while (current) {
        if (current.isJSXElement() || current.isJSXFragment()) return false;
        current = current.parentPath;
    }
    return true;
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

function tryInstanceStructureEdit(
    loc: OidLocation,
    kind: 'duplicate' | 'remove',
    projectRoot: string,
    instanceIndex?: number,
    sourceFileHints?: string[],
    currentText?: string,
): string[] {
    if (instanceIndex === undefined) return [];
    const { filePath } = loc;

    let templateContent: string;
    try { templateContent = readFileSync(filePath, 'utf-8'); } catch { return []; }

    const templateAst = getAstFromContent(templateContent, true);
    if (!templateAst) return [];

    const componentNames = getExportedComponentNames(templateAst);
    if (!componentNames.length) return [];

    const sourceFiles = orderedSourceFiles(projectRoot, sourceFileHints);
    const modified: string[] = [];

    for (const srcFile of sourceFiles) {
        if (srcFile === filePath) continue;
        let content: string;
        try { content = readFileSync(srcFile, 'utf-8'); } catch { continue; }

        const ast = getAstFromContent(content, true);
        if (!ast) continue;

        let changed = kind === 'duplicate'
            ? duplicateComponentUsageAtIndex(ast, componentNames, instanceIndex)
            : removeComponentUsageAtIndex(ast, componentNames, instanceIndex);
        if (!changed && kind === 'remove' && currentText) {
            changed = removeComponentUsageByText(ast, componentNames, currentText);
        }
        if (!changed) continue;

        const newContent = getContentFromAst(ast, content);
        try {
            writeFileSync(srcFile, newContent, 'utf-8');
            modified.push(srcFile);
        } catch { /* skip unwritable files */ }
        break;
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

    const isInstanceScope = req.scope !== 'component' && !!projectRoot;
    const fileHasExportedComponents = isInstanceScope ? getExportedComponentNames(ast).length > 0 : false;

    if (req.kind === 'text') {
        if (typeof req.payload !== 'string') return { ok: false, error: 'String payload required for text edit' };
        if (isInstanceScope && isCustomComponentUsage(node) && !nodeReferencesIdentifier(node, 'children')) {
            updateNodeTextContent(node, req.payload);
            try {
                writeFileSync(filePath, getContentFromAst(ast, content), 'utf-8');
            } catch {
                return { ok: false, error: `Cannot write file: ${filePath}` };
            }
            return { ok: true, filePath };
        }
        const propIdentifier = getSinglePropIdentifier(node);
        let propName = propIdentifier ?? inferTextPropName(node);
        let needsSyntheticTextProp = false;
        const isNestedComponentText = isInstanceScope &&
            fileHasExportedComponents &&
            !isTopLevelComponentRenderNode(nodePath);
        if (!propIdentifier && propName && isNestedComponentText) {
            needsSyntheticTextProp = true;
        }
        // Fallback: when the element lives in a component template and the user is
        // editing in instance scope, treat the text as the component's `children`
        // prop. This handles shadcn-style components where children flow via spread.
        let isChildrenFallback = false;
        if (!propName && isInstanceScope && fileHasExportedComponents) {
            if (isTopLevelComponentRenderNode(nodePath)) {
                propName = 'children';
                isChildrenFallback = true;
            } else if (nodeReferencesIdentifier(node, 'children')) {
                propName = 'children';
                isChildrenFallback = true;
            } else {
                propName = inferStaticTextOverridePropName(node);
                needsSyntheticTextProp = true;
            }
        }

        if (propName && isInstanceScope) {
            const modified = tryPropEdit(loc, propName, propIdentifier ? req.currentText : undefined, req.payload, projectRoot, req.instanceIndex, req.sourceFileHints);
            if (modified.length > 0) {
                if (needsSyntheticTextProp || (propIdentifier && isNestedComponentText)) {
                    const changedTemplate = enableTextPropOverride(ast, node, propName, req.currentText);
                    if (!changedTemplate) {
                        return {
                            ok: false,
                            error: `Não consegui vincular "${propName}" no template do componente. Use "Componente" para editar globalmente.`,
                        };
                    }
                    try {
                        writeFileSync(filePath, getContentFromAst(ast, content), 'utf-8');
                        modified.push(filePath);
                    } catch {
                        return {
                            ok: false,
                            error: `Não consegui persistir o template do componente em ${filePath}`,
                        };
                    }
                }
                // Bind the template to {propName} only when introducing a brand-new
                // prop (e.g. converting a <label>static</label> to <label>{label}</label>).
                // Don't touch the template for the children fallback.
                if (!needsSyntheticTextProp && !propIdentifier && !isChildrenFallback) {
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

        // Refuse to modify a component template when the user explicitly chose
        // instance scope. The template edit would propagate to every instance.
        if (isInstanceScope && fileHasExportedComponents) {
            return {
                ok: false,
                error: 'Esse texto vive no template do componente. Use "Componente" para editar globalmente.',
            };
        }

        updateNodeTextContent(node, req.payload);

    } else if (req.kind === 'class') {
        if (typeof req.payload !== 'string') return { ok: false, error: 'String payload required for class edit' };
        const classIdentifier = getAttrIdentifier(node, 'className');
        if (classIdentifier && isInstanceScope) {
            const modified = tryPropEdit(loc, classIdentifier, undefined, req.payload, projectRoot, req.instanceIndex, req.sourceFileHints);
            if (modified.length > 0) {
                const relPaths = modified.map(f => f.replace(projectRoot + '/', '')).join(', ');
                console.log(`[visual-edit] class prop "${classIdentifier}" edit → ${relPaths}`);
                return { ok: true, filePath: modified[0]! };
            }
            return {
                ok: false,
                error: `Não consegui localizar com segurança esta instância de "${classIdentifier}". Use "Componente" para editar globalmente.`,
            };
        }
        const needsInstanceClassOverride = isInstanceScope &&
            !isRouteEntryFile(filePath) &&
            (((req.sourceFileHints?.length ?? 0) > 0) ||
            ((req.instanceCount ?? 1) > 1) ||
            !!req.isComponentRoot);
        // Use the slot-prop technique whenever we're in instance scope on a
        // component template (regardless of how many instances exist on the
        // page). Modifying replaceNodeClasses here would clobber the template
        // and propagate the change to every instance globally.
        if (needsInstanceClassOverride) {
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
    } else if (req.kind === 'insert-component') {
        const payload = req.payload;
        if (
            !payload ||
            typeof payload !== 'object' ||
            !('componentName' in payload) ||
            !('filePath' in payload) ||
            typeof payload.componentName !== 'string' ||
            typeof payload.filePath !== 'string'
        ) {
            return { ok: false, error: 'Invalid component insert payload' };
        }
        if (!req.parentLoc) return { ok: false, error: 'Parent OID not found for component insert' };
        if (payload.filePath === req.parentLoc.filePath) return { ok: false, error: 'Cannot insert a component into itself' };

        const parentContent = readFileSync(req.parentLoc.filePath, 'utf-8');
        const parentAst = getAstFromContent(parentContent);
        if (!parentAst) return { ok: false, error: 'AST parse failed for parent node' };

        const parentPath = findNodePathByPosition(parentAst, req.parentLoc.line, req.parentLoc.col);
        if (!parentPath) return { ok: false, error: 'Parent node not found for component insert' };

        addNamedImport(parentAst, payload.componentName, importPath(req.parentLoc.filePath, payload.filePath));
        insertElementAtPath(
            parentPath,
            { tagName: payload.componentName },
            payload.placement ?? 'append',
            payload.index,
        );

        try {
            writeFileSync(req.parentLoc.filePath, normalizeComponentizeOutput(getContentFromAst(parentAst, parentContent)), 'utf-8');
        } catch {
            return { ok: false, error: `Cannot write file: ${req.parentLoc.filePath}` };
        }
        return { ok: true, filePath: req.parentLoc.filePath };
    } else if (req.kind === 'remove') {
        if (projectRoot && req.isComponentRoot) {
            const modified = tryInstanceStructureEdit(loc, 'remove', projectRoot, req.instanceIndex, req.sourceFileHints, req.currentText);
            if (modified.length > 0) {
                console.log(`[visual-edit] instance remove → ${modified.map(f => f.replace(projectRoot + '/', '')).join(', ')}`);
                return { ok: true, filePath: modified[0]! };
            }
            if (req.isComponentRoot) {
                return { ok: false, error: 'Uso do componente não encontrado nos arquivos do projeto. Use Desfazer se algo mudou inesperadamente.' };
            }
        }
        if (projectRoot && (req.instanceCount ?? 1) > 1 && !req.isComponentRoot) {
            return {
                ok: false,
                error: 'Nao consigo remover apenas este elemento dentro de um componente reutilizado com seguranca. Selecione a raiz do componente para remover a instancia inteira ou edite o template globalmente.',
            };
        }
        const changed = removeElementAtPath(nodePath);
        if (!changed) return { ok: false, error: 'Failed to remove selected element' };
    } else if (req.kind === 'duplicate') {
        if (projectRoot && req.isComponentRoot) {
            const modified = tryInstanceStructureEdit(loc, 'duplicate', projectRoot, req.instanceIndex, req.sourceFileHints, req.currentText);
            if (modified.length > 0) {
                console.log(`[visual-edit] instance duplicate → ${modified.map(f => f.replace(projectRoot + '/', '')).join(', ')}`);
                return { ok: true, filePath: modified[0]! };
            }
            if (req.isComponentRoot) {
                return { ok: false, error: 'Uso do componente não encontrado para duplicação.' };
            }
        }
        if (projectRoot && (req.instanceCount ?? 1) > 1 && !req.isComponentRoot) {
            return {
                ok: false,
                error: 'Nao consigo duplicar apenas este elemento dentro de um componente reutilizado com seguranca. Selecione a raiz do componente para duplicar a instancia inteira.',
            };
        }
        const changed = duplicateElementAtPath(nodePath);
        if (!changed) return { ok: false, error: 'Failed to duplicate selected element' };
    } else if (req.kind === 'componentize') {
        const payload = req.payload;
        if (!payload || typeof payload !== 'object' || !('name' in payload) || typeof payload.name !== 'string') {
            return { ok: false, error: 'Component name required' };
        }
        if (!projectRoot) return { ok: false, error: 'Project root required' };

        const componentName = toPascalCase(payload.name);
        const destDir = (payload as { name: string; destinationDir?: string }).destinationDir;
        const { dir, error: dirError } = resolveDestinationDir(projectRoot, destDir);
        if (dirError) return { ok: false, error: dirError };

        const newFilePath = componentFilePath(dir, componentName);
        const dependencyImports = importsForExtractedComponent(ast, collectUsedIdentifiers(nodePath.node), filePath, newFilePath);
        const componentSource = extractElementToComponentAtPath(nodePath, componentName);
        if (!componentSource) return { ok: false, error: 'Invalid component name' };
        const newComponentSource = dependencyImports ? `${dependencyImports}\n\n${componentSource}` : componentSource;

        addNamedImport(ast, componentName, importPath(filePath, newFilePath));
        try {
            mkdirSync(dirname(newFilePath), { recursive: true });
            writeFileSync(newFilePath, newComponentSource, 'utf-8');
        } catch {
            return { ok: false, error: `Cannot write component file: ${newFilePath}` };
        }

        const generatedContent = getContentFromAst(ast, content);
        try {
            writeFileSync(filePath, normalizeComponentizeOutput(generatedContent), 'utf-8');
        } catch {
            return { ok: false, error: `Cannot write file: ${filePath}` };
        }
        return { ok: true, filePath, newFilePath, componentName };
    } else if (req.kind === 'move') {
        const payload = req.payload;
        if (!payload || typeof payload !== 'object' || !('index' in payload) || typeof payload.index !== 'number') {
            return { ok: false, error: 'Invalid move payload' };
        }
        const movePayload = payload as MovePayload;
        const targetLoc = req.targetLoc;
        let changed = false;
        if (movePayload.parentOid && req.parentLoc) {
            if (req.parentLoc.filePath !== filePath) return { ok: false, error: 'Cannot move element across files yet' };
            const parentPath = findNodePathByPosition(ast, req.parentLoc.line, req.parentLoc.col);
            if (!parentPath) return { ok: false, error: 'Parent node not found for move' };
            changed = moveElementToParentPath(nodePath, parentPath, movePayload.placement ?? 'append', movePayload.index);
        } else if (movePayload.direction === 'up' || movePayload.direction === 'down') {
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

    const generatedContent = getContentFromAst(ast, content);

    try {
        writeFileSync(filePath, generatedContent, 'utf-8');
    } catch (e) {
        return { ok: false, error: `Cannot write file: ${filePath}` };
    }

    return { ok: true, filePath };
}

// ── Component duplication ────────────────────────────────────────────────────

export interface DuplicateComponentResult {
    ok: boolean;
    error?: string;
    newFilePath?: string;
    componentName?: string;
    relPath?: string;
}

/**
 * Copies an existing component file under a new name and destination,
 * rewriting relative imports so they remain valid.
 * The exported symbol names are renamed from the source component name
 * to the new component name.
 */
export function duplicateComponent(
    projectRoot: string,
    sourceFilePath: string,
    newName: string,
    destinationDir?: string,
): DuplicateComponentResult {
    if (!sourceFilePath.startsWith(projectRoot)) return { ok: false, error: 'Source path outside project root' };
    if (!existsSync(sourceFilePath)) return { ok: false, error: 'Source component not found' };

    const { dir, error: dirError } = resolveDestinationDir(projectRoot, destinationDir);
    if (dirError) return { ok: false, error: dirError };

    const componentName = toPascalCase(newName);
    const newFilePath = componentFilePath(dir, componentName);

    const content = readFileSync(sourceFilePath, 'utf-8');

    const ast = getAstFromContent(content);
    if (!ast) return { ok: false, error: 'Could not parse source component' };

    // Rewrite relative imports for the new file location
    for (const statement of ast.program.body) {
        if (!t.isImportDeclaration(statement)) continue;
        const src = String(statement.source.value);
        if (!src.startsWith('.')) continue;
        statement.source = t.stringLiteral(rewriteImportSource(src, sourceFilePath, newFilePath));
    }

    // Rename exported symbol and its Props type — but NEVER touch import specifiers.
    // A regex over the source text is wrong here: `\bCalendar\b` matches the imported
    // name in `import { Calendar as AriaCalendar }`, turning AriaCalendar into undefined.
    // Instead we traverse the AST and skip any identifier whose binding was created by
    // an import declaration (binding.kind === 'module').
    const sourceBase = basename(sourceFilePath, extname(sourceFilePath));
    const propsName = `${sourceBase}Props`;
    const newPropsName = `${componentName}Props`;

    traverse(ast, {
        Identifier(nodePath) {
            const { name } = nodePath.node;
            if (name !== sourceBase && name !== propsName) return;
            // Never touch the imported-name side of an import specifier
            if (nodePath.findParent(p => p.isImportDeclaration())) return;
            // Skip bindings created by an import (kind === 'module')
            const binding = nodePath.scope.getBinding(name);
            if (binding && binding.kind === 'module') return;
            nodePath.node.name = name === propsName ? newPropsName : componentName;
        },
    });

    const renamedContent = getContentFromAst(ast, content);

    try {
        mkdirSync(dirname(newFilePath), { recursive: true });
        writeFileSync(newFilePath, renamedContent, 'utf-8');
    } catch {
        return { ok: false, error: `Cannot write component file: ${newFilePath}` };
    }

    return {
        ok: true,
        newFilePath,
        componentName,
        relPath: newFilePath.replace(projectRoot + '/', ''),
    };
}
