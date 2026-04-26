import { serve } from '@hono/node-server';
import { spawn } from 'child_process';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { buildIndex, refreshFile, type OidIndex } from './scanner';
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
import { watch } from 'chokidar';

const PORT = 5179;

export function startServer(projectRoot: string): void {
    const index: OidIndex = buildIndex(projectRoot);
    console.log(`[visual-edit] OIDs indexados: ${index.size}`);

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

        const loc = index.get(body.oid);
        if (!loc) {
            return c.json({ ok: false, error: `OID not found in index: ${body.oid}` }, 404);
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

        const result = applyEdit(loc, body, projectRoot);

        // Refresh index after edit. Instance edits can modify the parent usage
        // file rather than the OID template file.
        refreshFile(result.filePath ?? loc.filePath, index);

        if (!result.ok) {
            return c.json(result, 500);
        }

        const relPath = (result.filePath ?? loc.filePath).replace(projectRoot + '/', '');
        console.log(`[visual-edit] ${body.kind} edit → ${relPath} (oid=${body.oid})`);

        return c.json({ ok: true, filePath: relPath });
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
