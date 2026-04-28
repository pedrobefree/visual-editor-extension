import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, sep } from 'path';

export type PageRouterKind = 'app' | 'pages';

export interface PagePattern {
    id: string;
    kind: PageRouterKind;
    label: string;
    baseDir: string;
    relBaseDir: string;
    routeGroup?: string;
    isDefault?: boolean;
}

export interface CreatePageOptions {
    route: string;
    patternId?: string;
}

export interface CreatePageResult {
    ok: boolean;
    error?: string;
    filePath?: string;
    relPath?: string;
    routePath?: string;
    patternId?: string;
    kind?: PageRouterKind;
}

const APP_DEFAULT_GROUP_NAMES = new Set(['(marketing)', '(site)', '(public)', '(web)']);
function normalizePath(path: string): string {
    return path.split(sep).join('/');
}

function appRoot(projectRoot: string): string | null {
    const candidates = [join(projectRoot, 'app'), join(projectRoot, 'src', 'app')];
    return candidates.find(existsSync) ?? null;
}

function pagesRoot(projectRoot: string): string | null {
    const candidates = [join(projectRoot, 'pages'), join(projectRoot, 'src', 'pages')];
    return candidates.find(existsSync) ?? null;
}

function rel(projectRoot: string, absolutePath: string): string {
    return normalizePath(absolutePath.replace(`${projectRoot}/`, ''));
}

function appPatterns(projectRoot: string): PagePattern[] {
    const root = appRoot(projectRoot);
    if (!root) return [];

    const patterns: PagePattern[] = [];
    const entries = existsSync(root) ? readdirSync(root, { withFileTypes: true }) : [];
    const groups = entries
        .filter(entry => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b));

    const preferredGroup = groups.find(group => APP_DEFAULT_GROUP_NAMES.has(group));

    if (preferredGroup) {
        patterns.push({
            id: `app:${preferredGroup}`,
            kind: 'app',
            label: `App Router · ${preferredGroup}`,
            baseDir: join(root, preferredGroup),
            relBaseDir: rel(projectRoot, join(root, preferredGroup)),
            routeGroup: preferredGroup,
            isDefault: true,
        });
    }

    patterns.push({
        id: 'app:root',
        kind: 'app',
        label: 'App Router · root',
        baseDir: root,
        relBaseDir: rel(projectRoot, root),
        isDefault: !preferredGroup,
    });

    for (const group of groups) {
        if (group === preferredGroup) continue;
        patterns.push({
            id: `app:${group}`,
            kind: 'app',
            label: `App Router · ${group}`,
            baseDir: join(root, group),
            relBaseDir: rel(projectRoot, join(root, group)),
            routeGroup: group,
        });
    }

    return patterns;
}

function pagesPatterns(projectRoot: string): PagePattern[] {
    const root = pagesRoot(projectRoot);
    if (!root) return [];
    return [{
        id: 'pages:root',
        kind: 'pages',
        label: 'Pages Router',
        baseDir: root,
        relBaseDir: rel(projectRoot, root),
    }];
}

export function listPagePatterns(projectRoot: string): PagePattern[] {
    const app = appPatterns(projectRoot);
    const pages = pagesPatterns(projectRoot);
    const patterns = [...app, ...pages];
    if (!patterns.some(pattern => pattern.isDefault) && patterns[0]) patterns[0].isDefault = true;
    return patterns;
}

function normalizeRoute(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const normalized = withLeadingSlash
        .replace(/\/+/g, '/')
        .replace(/\/$/, '') || '/';
    if (normalized === '/') return null;
    const segments = normalized.split('/').filter(Boolean);
    if (!segments.length) return null;
    if (segments.some(segment => !/^[a-z0-9-]+$/i.test(segment) || segment === '.' || segment === '..')) return null;
    return `/${segments.join('/')}`;
}

function routeSegments(route: string): string[] {
    return route.replace(/^\//, '').split('/').filter(Boolean);
}

function pageNameFromRoute(route: string): string {
    return routeSegments(route)
        .flatMap(segment => segment.split('-'))
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('') + 'Page';
}

function titleFromRoute(route: string): string {
    return routeSegments(route)
        .flatMap(segment => segment.split('-'))
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function buildPageSource(route: string): string {
    const pageName = pageNameFromRoute(route);
    const title = titleFromRoute(route);
    return `export default function ${pageName}() {
  return (
    <main className="min-h-screen px-4 py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">Visual Edit</p>
          <h1 className="text-4xl font-semibold tracking-tight">${title}</h1>
        </header>
        <section className="rounded-2xl border border-dashed border-neutral-300 p-8">
          <p className="text-sm text-neutral-600">
            Start building this page with the Visual Edit extension.
          </p>
        </section>
      </div>
    </main>
  );
}
`;
}

function resolvePattern(projectRoot: string, patternId?: string): PagePattern | null {
    const patterns = listPagePatterns(projectRoot);
    if (!patterns.length) return null;
    if (patternId) return patterns.find(pattern => pattern.id === patternId) ?? null;
    return patterns.find(pattern => pattern.isDefault) ?? patterns[0] ?? null;
}

function filePathForPattern(pattern: PagePattern, route: string): string {
    const segments = routeSegments(route);
    if (pattern.kind === 'app') {
        return join(pattern.baseDir, ...segments, 'page.tsx');
    }
    if (segments.length === 1) return join(pattern.baseDir, `${segments[0]}.tsx`);
    return join(pattern.baseDir, ...segments.slice(0, -1), `${segments[segments.length - 1]}.tsx`);
}

export function createPage(projectRoot: string, options: CreatePageOptions): CreatePageResult {
    const route = normalizeRoute(options.route);
    if (!route) return { ok: false, error: `Invalid route: ${options.route}` };

    const pattern = resolvePattern(projectRoot, options.patternId);
    if (!pattern) return { ok: false, error: 'No supported page router found in project' };

    const filePath = filePathForPattern(pattern, route);
    if (!normalizePath(filePath).startsWith(normalizePath(projectRoot) + '/')) {
        return { ok: false, error: 'Resolved page path escaped project root' };
    }
    if (existsSync(filePath)) {
        return { ok: false, error: `Page already exists for route ${route}` };
    }

    try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, buildPageSource(route), 'utf-8');
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Could not write page file' };
    }

    return {
        ok: true,
        filePath,
        relPath: rel(projectRoot, filePath),
        routePath: route,
        patternId: pattern.id,
        kind: pattern.kind,
    };
}
