import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'build', 'out', '.turbo', '.cache']);
const SOURCE_EXT_RE = /\.(tsx|jsx|ts|js|html|mdx|astro|vue|svelte)$/;
const TOKEN_RE = /^[a-z0-9][a-z0-9:/_[\].%#()-]*$/i;
const STRING_LITERAL_RE = /["'`]([^"'`\n\r]{2,})["'`]/g;
const SIMPLE_UTILITY_TOKENS = new Set(['flex', 'grid', 'block', 'inline', 'hidden', 'contents', 'relative', 'absolute', 'fixed', 'sticky', 'italic', 'underline']);

export interface ProjectClassSummary {
    className: string;
    count: number;
}

export interface ProjectClassBundle {
    tag: string;
    classes: string;
    count: number;
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
            else if (SOURCE_EXT_RE.test(entry)) found.push(full);
        } catch {
            // ignore unreadable entries
        }
    }
    return found;
}

function splitClasses(value: string): string[] {
    return value
        .split(/\s+/)
        .map(cls => cls.trim())
        .filter(cls => cls.length > 1 && TOKEN_RE.test(cls) && (cls.includes('-') || cls.includes(':') || cls.includes('[') || SIMPLE_UTILITY_TOKENS.has(cls)));
}

export function listProjectClasses(
    projectRoot: string,
    tagName?: string,
    limit = 60,
): { classes: ProjectClassSummary[]; bundles: ProjectClassBundle[] } {
    const files = walkSourceFiles(projectRoot);
    const classCounts = new Map<string, number>();
    const bundleCounts = new Map<string, number>();
    const normalizedTag = tagName?.toLowerCase().trim() || '';

    for (const file of files) {
        let source = '';
        try { source = readFileSync(file, 'utf-8'); } catch { continue; }

        const tagBundleRe = /<([A-Za-z][\w:-]*)[\s\S]*?\bclass(?:Name)?\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
        let tagMatch: RegExpExecArray | null;
        while ((tagMatch = tagBundleRe.exec(source)) !== null) {
            const tag = (tagMatch[1] ?? '').toLowerCase();
            const raw = tagMatch[2] ?? tagMatch[3] ?? '';
            if (!raw) continue;
            const classes = splitClasses(raw);
            if (!classes.length) continue;

            classes.forEach(cls => classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1));
            if (!normalizedTag || normalizedTag === tag) {
                const normalizedBundle = classes.join(' ');
                const bundleKey = `${tag}::${normalizedBundle}`;
                bundleCounts.set(bundleKey, (bundleCounts.get(bundleKey) ?? 0) + 1);
            }
        }

        let literalMatch: RegExpExecArray | null;
        while ((literalMatch = STRING_LITERAL_RE.exec(source)) !== null) {
            const raw = literalMatch[1] ?? '';
            if (!raw.includes('-') && !raw.includes(':') && !raw.includes('[') && !raw.split(/\s+/).some(token => SIMPLE_UTILITY_TOKENS.has(token))) continue;
            const classes = splitClasses(raw);
            classes.forEach(cls => classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1));
        }
    }

    const classes = Array.from(classCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([className, count]) => ({ className, count }));

    const bundles = Array.from(bundleCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.min(limit, 16))
        .map(([key, count]) => {
            const [tag, classes] = key.split('::');
            return { tag: tag ?? '', classes: classes ?? '', count };
        });

    return { classes, bundles };
}
