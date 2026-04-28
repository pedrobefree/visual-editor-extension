import { serve } from '@hono/node-server';
import { spawn } from 'child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { dirname, join, resolve as resolvePath } from 'path';
import {
    getAstFromContent,
    getContentFromAst,
    getExportedComponentNames,
    t,
    traverse,
} from '@visual-edit/parser';
import { buildIndex, getSourceFiles, refreshFile, type OidIndex } from './scanner';
import { applyEdit, type EditRequest } from './editor';
import {
    findI18nFiles,
    detectI18nKey,
    getTranslations,
    updateTranslation,
} from './i18n';
import { readTheme, writeTheme, type ThemeUpdate } from './theme';
import { listComponents } from './components';
import { writeComponentPreview, type ComponentPreviewRequest } from './preview';
import { listProjectClasses } from './classes';
import { deleteAsset, listAssets, renameAsset, uploadAsset } from './assets';
import { captureProjectSnapshot, getUndoCount, pushUndoEntry, undoLastEntry } from './history';
import { watch } from 'chokidar';

const PORT = 5179;

export function startServer(projectRoot: string): void {
    const index: OidIndex = buildIndex(projectRoot);
    console.log(`[visual-edit] OIDs indexados: ${index.size}`);

    const rebuildIndex = () => {
        index.clear();
        for (const [oid, loc] of buildIndex(projectRoot)) index.set(oid, loc);
    };

    // Watch src dir for changes
    const watcher = watch(projectRoot, {
        ignored: /(node_modules|\.next|dist|\.git|build|out)/,
        ignoreInitial: true,
        persistent: true,
    });

    watcher.on('change', (filePath) => {
        refreshFile(filePath, index);
    });
    watcher.on('add', (filePath) => {
        refreshFile(filePath, index);
    });
    watcher.on('unlink', (filePath) => {
        for (const [oid, loc] of index) {
            if (loc.filePath === filePath) index.delete(oid);
        }
    });

    const app = new Hono();

    app.use(
        '*',
        cors({
            origin: (origin) => {
                if (!origin) return origin;
                try {
                    const url = new URL(origin);
                    const isLocal =
                        url.hostname === 'localhost' ||
                        url.hostname === '127.0.0.1' ||
                        url.hostname.endsWith('.localhost');
                    return isLocal ? origin : null;
                } catch {
                    return null;
                }
            },
            allowMethods: ['GET', 'POST', 'OPTIONS'],
            allowHeaders: ['Content-Type'],
        }),
    );

    app.get('/health', (c) => {
        return c.json({ status: 'ok', projectRoot, oidCount: index.size });
    });

    app.post('/edit', async (c) => {
        let body: EditRequest;
        try {
            body = await c.req.json<EditRequest>();
        } catch {
            return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
        }

        if (!body.oid || !body.kind || body.payload === undefined) {
            return c.json({ ok: false, error: 'Missing oid, kind or payload' }, 400);
        }

        let loc = index.get(body.oid);
        if (!loc) {
            rebuildIndex();
            loc = index.get(body.oid);
        }
        if (!loc) {
            return c.json({ ok: false, error: `OID not found in index: ${body.oid}` }, 404);
        }

        if ((body.kind === 'insert' || body.kind === 'insert-component' || body.kind === 'move') && body.payload && typeof body.payload === 'object' && 'parentOid' in body.payload) {
            const parentOid = String(body.payload.parentOid ?? '');
            const parentLoc = index.get(parentOid);
            if (!parentLoc) {
                return c.json({ ok: false, error: `Parent OID not found in index: ${parentOid}` }, 404);
            }
            body.parentLoc = parentLoc;
        }

        if (body.kind === 'move' && body.payload && typeof body.payload === 'object' && 'targetOid' in body.payload) {
            const targetOid = String(body.payload.targetOid ?? '');
            if (targetOid) {
                const targetLoc = index.get(targetOid);
                if (!targetLoc) {
                    return c.json({ ok: false, error: `Target OID not found in index: ${targetOid}` }, 404);
                }
                body.targetLoc = targetLoc;
            }
        }

        if (body.ancestorOids?.length) {
            const hints: string[] = [];
            for (const ancestorOid of body.ancestorOids) {
                const ancestorLoc = index.get(ancestorOid);
                if (!ancestorLoc) continue;
                if (ancestorLoc.filePath === loc.filePath) continue;
                if (!hints.includes(ancestorLoc.filePath)) hints.push(ancestorLoc.filePath);
            }
            body.sourceFileHints = hints;
        }

        const before = captureProjectSnapshot(projectRoot);
        const result = applyEdit(loc, body, projectRoot);

        // Refresh index after edit. Instance edits can modify the parent usage
        // file rather than the OID template file.
        refreshFile(result.filePath ?? loc.filePath, index);

        if (!result.ok) {
            return c.json(result, 500);
        }

        const undoCount = pushUndoEntry(projectRoot, `${body.kind}:${body.oid}`, before);
        const relPath = (result.filePath ?? loc.filePath).replace(projectRoot + '/', '');
        console.log(`[visual-edit] ${body.kind} edit → ${relPath} (oid=${body.oid})`);

        return c.json({ ok: true, filePath: relPath, undoCount });
    });

    app.post('/undo', (c) => {
        const result = undoLastEntry(projectRoot);
        if (!result.ok) {
            return c.json(result, result.empty ? 409 : 500);
        }
        rebuildIndex();
        console.log(`[visual-edit] undo → ${result.changed ?? 0} file(s) (${result.label ?? 'edit'})`);
        return c.json({ ...result, undoCount: getUndoCount(projectRoot) });
    });

    app.get('/undo/status', (c) => {
        return c.json({ ok: true, undoCount: getUndoCount(projectRoot) });
    });

    // List all OIDs (dev/debug helper)
    app.get('/oids', (c) => {
        const entries = Array.from(index.entries()).map(([oid, loc]) => ({
            oid,
            file: loc.filePath.replace(projectRoot + '/', ''),
            line: loc.line,
            col: loc.col,
        }));
        return c.json({ count: entries.length, entries });
    });

    // ── i18n ──────────────────────────────────────────────────────────────

    /** GET /i18n/detect?oid=xxx
     *  Detecta se o elemento usa t('key') e retorna chave + traduções */
    app.get('/i18n/detect', (c) => {
        const oid = c.req.query('oid');
        if (!oid) return c.json({ ok: false, error: 'oid required' }, 400);

        const loc = index.get(oid);
        // OID pode não estar indexado — não é erro, apenas sem i18n detectável.
        if (!loc) return c.json({ ok: true, i18n: false, reason: 'OID not indexed' });

        const key = detectI18nKey(loc.filePath, oid);
        if (!key) return c.json({ ok: true, i18n: false });

        const i18nFiles = findI18nFiles(projectRoot);
        if (!i18nFiles) return c.json({ ok: true, i18n: true, key, translations: {}, locales: [] });

        const info = getTranslations(key, i18nFiles);
        return c.json({
            ok: true,
            i18n: true,
            key,
            locales: i18nFiles.locales,
            translations: info.translations,
            files: info.files,
        });
    });

    // ── Theme ─────────────────────────────────────────────────────────────

    /** GET /theme — returns brand colors + font families from CSS variables */
    app.get('/theme', (c) => {
        const theme = readTheme(projectRoot);
        return c.json({ ok: true, theme });
    });

    // ── Components ────────────────────────────────────────────────────────

    /** GET /components — lists all project components */
    app.get('/components', (c) => {
        const components = listComponents(projectRoot);
        return c.json({ ok: true, components });
    });

    /** GET /classes?tag=button&limit=60 — lists project-wide class tokens and repeated bundles */
    app.get('/classes', (c) => {
        const tag = c.req.query('tag') || undefined;
        const rawLimit = Number.parseInt(c.req.query('limit') || '60', 10);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 200)) : 60;
        const classes = listProjectClasses(projectRoot, tag, limit);
        return c.json({ ok: true, ...classes });
    });

    /** GET /assets — lists image assets from public and src/assets */
    app.get('/assets', (c) => {
        const assets = listAssets(projectRoot);
        return c.json({ ok: true, assets });
    });

    /** POST /assets/upload multipart(form-data) => file, target? */
    app.post('/assets/upload', async (c) => {
        const form = await c.req.formData();
        const file = form.get('file');
        const target = (form.get('target') === 'src-assets' ? 'src-assets' : 'public') as 'public' | 'src-assets';
        if (!(file instanceof File)) return c.json({ ok: false, error: 'file is required' }, 400);
        const tempPath = join(projectRoot, '.visual-edit-upload-tmp');
        const bytes = Buffer.from(await file.arrayBuffer());
        try {
            writeFileSync(tempPath, bytes);
            const asset = uploadAsset(projectRoot, file.name, tempPath, target);
            try { unlinkSync(tempPath); } catch { /* ignore */ }
            return c.json({ ok: true, asset });
        } catch (error) {
            try { unlinkSync(tempPath); } catch { /* ignore */ }
            return c.json({ ok: false, error: error instanceof Error ? error.message : 'Upload failed' }, 500);
        }
    });

    /** POST /assets/rename { relativePath, nextName } */
    app.post('/assets/rename', async (c) => {
        const body = await c.req.json<{ relativePath?: string; nextName?: string }>();
        if (!body.relativePath || !body.nextName) return c.json({ ok: false, error: 'relativePath and nextName required' }, 400);
        try {
            const asset = renameAsset(projectRoot, body.relativePath, body.nextName);
            return c.json({ ok: true, asset });
        } catch (error) {
            return c.json({ ok: false, error: error instanceof Error ? error.message : 'Rename failed' }, 500);
        }
    });

    /** POST /assets/delete { relativePath } */
    app.post('/assets/delete', async (c) => {
        const body = await c.req.json<{ relativePath?: string }>();
        if (!body.relativePath) return c.json({ ok: false, error: 'relativePath required' }, 400);
        try {
            deleteAsset(projectRoot, body.relativePath);
            return c.json({ ok: true });
        } catch (error) {
            return c.json({ ok: false, error: error instanceof Error ? error.message : 'Delete failed' }, 500);
        }
    });

    /** POST /component-preview { filePath, name } — writes a local app route for browser editing */
    app.post('/component-preview', async (c) => {
        let body: ComponentPreviewRequest;
        try { body = await c.req.json<ComponentPreviewRequest>(); } catch {
            return c.json({ ok: false, error: 'Invalid JSON' }, 400);
        }
        const result = writeComponentPreview(projectRoot, body);
        if (!result.ok) return c.json(result, 500);
        console.log(`[visual-edit] component preview → ${body.name} (${body.filePath.replace(projectRoot + '/', '')})`);
        return c.json(result);
    });

    /** POST /component-delete { filePath } — permanently deletes a component file
     *  and cleans every import/usage of its exports across the project. */
    app.post('/component-delete', async (c) => {
        const body = await c.req.json<{ filePath?: string }>();
        if (!body.filePath) return c.json({ ok: false, error: 'filePath required' }, 400);
        const targetPath = body.filePath.startsWith(projectRoot) ? body.filePath : join(projectRoot, body.filePath);
        if (!targetPath.startsWith(projectRoot)) return c.json({ ok: false, error: 'Invalid path' }, 400);
        try {
            const cleanedFiles = removeProjectReferencesToFile(projectRoot, targetPath);
            unlinkSync(targetPath);
            for (const file of cleanedFiles) refreshFile(file, index);
            for (const [oid, loc] of index) {
                if (loc.filePath === targetPath) index.delete(oid);
            }
            const rel = targetPath.replace(projectRoot + '/', '');
            console.log(`[visual-edit] component-delete → ${rel} (${cleanedFiles.length} ref file(s) cleaned)`);
            return c.json({ ok: true, cleanedFiles: cleanedFiles.length });
        } catch (error) {
            return c.json({ ok: false, error: error instanceof Error ? error.message : 'Delete failed' }, 500);
        }
    });

    /** POST /open-file { filePath, line? } — opens file in VS Code */
    app.post('/open-file', async (c) => {
        let body: { filePath: string; line?: number };
        try { body = await c.req.json(); } catch {
            return c.json({ ok: false, error: 'Invalid JSON' }, 400);
        }
        if (!body.filePath) return c.json({ ok: false, error: 'filePath required' }, 400);
        const target = body.line ? `${body.filePath}:${body.line}` : body.filePath;
        try {
            spawn('code', ['--goto', target], { stdio: 'ignore', detached: true }).unref();
            return c.json({ ok: true });
        } catch {
            try { spawn('open', [body.filePath], { stdio: 'ignore', detached: true }).unref(); return c.json({ ok: true }); } catch { /**/ }
            return c.json({ ok: false, error: 'Could not open file — is VS Code in PATH?' });
        }
    });

    /** POST /theme — update a single CSS variable value in the source file */
    app.post('/theme', async (c) => {
        let body: ThemeUpdate;
        try { body = await c.req.json<ThemeUpdate>(); } catch {
            return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
        }
        if (!body.type || !body.variable || body.value === undefined) {
            return c.json({ ok: false, error: 'Missing type, variable or value' }, 400);
        }
        const ok = writeTheme(body);
        if (ok) console.log(`[visual-edit] theme → ${body.variable} = "${body.value}"`);
        return c.json({ ok });
    });

    /** POST /i18n/update  { key, locale, value, filePath } */
    app.post('/i18n/update', async (c) => {
        const body = await c.req.json<{
            key: string; locale: string; value: string; filePath: string;
        }>();
        if (!body.key || !body.locale || body.value === undefined || !body.filePath) {
            return c.json({ ok: false, error: 'key, locale, value and filePath required' }, 400);
        }
        const ok = updateTranslation(body);
        if (ok) console.log(`[visual-edit] i18n → ${body.locale}/${body.key} = "${body.value}"`);
        return c.json({ ok });
    });

    serve({ fetch: app.fetch, port: PORT });

    console.log(`[visual-edit] Bridge rodando em http://localhost:${PORT}`);
    console.log(`[visual-edit] Abra a extensão Chrome e navegue para o seu app.`);
    console.log(`[visual-edit] Ctrl+C para parar.\n`);
}

const SOURCE_EXT_RE = /\.(tsx|ts|jsx|js|mjs|cjs)$/;

function stripSourceExt(p: string): string {
    return p.replace(SOURCE_EXT_RE, '');
}

/** Resolves an import source string to an absolute path (without extension)
 *  if possible. Handles relative imports and the most common path aliases
 *  (`@/`, `~/`) that point to either `src/` or the project root. Returns
 *  null for bare module specifiers and unrecognized aliases. */
function resolveImportToAbsolute(importSource: string, fromFile: string, projectRoot: string): string[] {
    if (importSource.startsWith('.')) {
        return [stripSourceExt(resolvePath(dirname(fromFile), importSource))];
    }
    const aliasMatch = importSource.match(/^(@|~)\/(.+)$/);
    if (aliasMatch) {
        const rest = aliasMatch[2]!;
        return [
            stripSourceExt(resolvePath(projectRoot, 'src', rest)),
            stripSourceExt(resolvePath(projectRoot, rest)),
        ];
    }
    return [];
}

/** Walks every project source file and removes:
 *   1. Import declarations whose source resolves to `targetFile`
 *   2. JSX usages of names that were imported from `targetFile`
 *  Returns the list of files that were modified.  */
function removeProjectReferencesToFile(projectRoot: string, targetFile: string): string[] {
    const targetNoExt = stripSourceExt(targetFile);
    const files = getSourceFiles(projectRoot);
    const modified: string[] = [];

    for (const srcFile of files) {
        if (srcFile === targetFile) continue;

        let content: string;
        try { content = readFileSync(srcFile, 'utf-8'); } catch { continue; }
        if (!content.includes('import')) continue;

        const ast = getAstFromContent(content, true);
        if (!ast) continue;

        const removedNames = new Set<string>();
        const body = ast.program.body;
        const keptBody = body.filter(stmt => {
            if (!t.isImportDeclaration(stmt)) return true;
            const src = String(stmt.source.value);
            const resolved = resolveImportToAbsolute(src, srcFile, projectRoot);
            if (!resolved.some(candidate => candidate === targetNoExt)) return true;

            for (const spec of stmt.specifiers) {
                if (t.isImportSpecifier(spec) || t.isImportDefaultSpecifier(spec) || t.isImportNamespaceSpecifier(spec)) {
                    removedNames.add(spec.local.name);
                }
            }
            return false;
        });

        if (removedNames.size === 0) continue;
        ast.program.body = keptBody;

        traverse(ast, {
            JSXElement(path) {
                const opening = path.node.openingElement.name;
                if (!t.isJSXIdentifier(opening)) return;
                if (!removedNames.has(opening.name)) return;

                const parentPath = path.parentPath;
                if (parentPath.isJSXElement() || parentPath.isJSXFragment()) {
                    const children = (parentPath.node as { children: unknown[] }).children;
                    const idx = children.indexOf(path.node);
                    if (idx !== -1) children.splice(idx, 1);
                } else {
                    // return <Foo />, {cond && <Foo />}, etc. — replace with null
                    // so the file remains syntactically valid.
                    path.replaceWith(t.nullLiteral());
                }
            },
        });

        try {
            writeFileSync(srcFile, getContentFromAst(ast, content), 'utf-8');
            modified.push(srcFile);
        } catch { /* skip unwritable files */ }
    }

    return modified;
}
