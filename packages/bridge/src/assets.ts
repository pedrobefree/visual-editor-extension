import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'fs';
import { basename, dirname, extname, join, relative } from 'path';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);
const SOURCE_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx', '.astro', '.vue', '.svelte', '.html', '.css']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', '.turbo', '.cache']);

export interface AssetItem {
    id: string;
    name: string;
    extension: string;
    absolutePath: string;
    relativePath: string;
    source: 'public' | 'src-assets';
    runtimePath: string;
    size: number;
}

function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function assertSupportedImageName(name: string): void {
    const ext = extname(name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) throw new Error('Unsupported asset type');
}

function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function isImageFile(path: string): boolean {
    return IMAGE_EXTS.has(extname(path).toLowerCase());
}

function walkAssets(
    dir: string,
    projectRoot: string,
    source: 'public' | 'src-assets',
    items: AssetItem[] = [],
    rootDir = dir,
): AssetItem[] {
    if (!existsSync(dir)) return items;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return items; }
    for (const entry of entries) {
        const full = join(dir, entry);
        try {
            const stat = statSync(full);
            if (stat.isDirectory()) {
                walkAssets(full, projectRoot, source, items, rootDir);
                continue;
            }
            if (!isImageFile(full)) continue;
            const relativePath = relative(projectRoot, full);
            const runtimePath = source === 'public'
                ? `/${relative(rootDir, full).replace(/\\/g, '/')}`
                : `/${relativePath.replace(/\\/g, '/')}`;
            items.push({
                id: relativePath,
                name: basename(full),
                extension: extname(full).toLowerCase(),
                absolutePath: full,
                relativePath: relativePath.replace(/\\/g, '/'),
                source,
                runtimePath,
                size: stat.size,
            });
        } catch {
            // ignore unreadable file
        }
    }
    return items;
}

function walkSourceFiles(dir: string, found: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return found; }
    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        try {
            const stat = statSync(full);
            if (stat.isDirectory()) walkSourceFiles(full, found);
            else if (SOURCE_EXTS.has(extname(entry).toLowerCase())) found.push(full);
        } catch {
            // ignore
        }
    }
    return found;
}

function replaceInProject(projectRoot: string, replacements: Array<[string, string]>): void {
    const files = walkSourceFiles(projectRoot);
    for (const file of files) {
        let source = '';
        try { source = readFileSync(file, 'utf-8'); } catch { continue; }
        let next = source;
        for (const [from, to] of replacements) {
            if (!from || from === to) continue;
            next = next.split(from).join(to);
        }
        if (next !== source) {
            try { writeFileSync(file, next, 'utf-8'); } catch { /* ignore write errors */ }
        }
    }
}

export function listAssets(projectRoot: string): AssetItem[] {
    const publicDir = join(projectRoot, 'public');
    const srcAssetsDir = join(projectRoot, 'src', 'assets');
    const items = [
        ...walkAssets(publicDir, projectRoot, 'public'),
        ...walkAssets(srcAssetsDir, projectRoot, 'src-assets'),
    ];
    return items.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function uploadAsset(projectRoot: string, fileName: string, tempPath: string, target: 'public' | 'src-assets' = 'public'): AssetItem {
    const safeName = sanitizeFileName(fileName);
    const targetDir = target === 'public' ? join(projectRoot, 'public', 'visual-edit-kit') : join(projectRoot, 'src', 'assets', 'visual-edit-kit');
    ensureDir(targetDir);
    assertSupportedImageName(safeName);
    const ext = extname(safeName).toLowerCase();

    const base = safeName.slice(0, safeName.length - ext.length) || 'asset';
    let finalName = `${base}${ext}`;
    let index = 1;
    let dest = join(targetDir, finalName);
    while (existsSync(dest)) {
        finalName = `${base}-${index}${ext}`;
        dest = join(targetDir, finalName);
        index += 1;
    }

    copyFileSync(tempPath, dest);
    const uploaded = listAssets(projectRoot).find(item => item.absolutePath === dest);
    if (!uploaded) throw new Error('Uploaded asset not found after write');
    return uploaded;
}

export function renameAsset(projectRoot: string, relativePath: string, nextName: string): AssetItem {
    const all = listAssets(projectRoot);
    const item = all.find(asset => asset.relativePath === relativePath);
    if (!item) throw new Error('Asset not found');

    const ext = extname(item.name);
    const requested = sanitizeFileName(nextName);
    if (!requested || requested === ext) throw new Error('Asset name is required');
    assertSupportedImageName(requested.endsWith(ext) ? requested : `${requested}${ext}`);
    const normalized = requested.endsWith(ext) ? requested : `${requested}${ext}`;
    const nextPath = join(dirname(item.absolutePath), normalized);
    if (nextPath !== item.absolutePath && existsSync(nextPath)) {
        throw new Error('Asset name already exists');
    }
    renameSync(item.absolutePath, nextPath);

    const nextRelativePath = relative(projectRoot, nextPath).replace(/\\/g, '/');
    const nextRuntimePath = item.source === 'public'
        ? `/${relative(join(projectRoot, 'public'), nextPath).replace(/\\/g, '/')}`
        : `/${nextRelativePath}`;

    replaceInProject(projectRoot, [
        [item.runtimePath, nextRuntimePath],
        [item.relativePath, nextRelativePath],
    ]);

    const renamed = listAssets(projectRoot).find(asset => asset.relativePath === nextRelativePath);
    if (!renamed) throw new Error('Renamed asset not found');
    return renamed;
}

export function deleteAsset(projectRoot: string, relativePath: string): void {
    const all = listAssets(projectRoot);
    const item = all.find(asset => asset.relativePath === relativePath);
    if (!item) throw new Error('Asset not found');
    unlinkSync(item.absolutePath);
}
