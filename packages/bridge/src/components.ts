import { readFileSync, statSync, readdirSync } from 'fs';
import { join, sep } from 'path';

/** How this component came to exist in the project. */
export type ComponentOrigin = 'visual-edit' | 'project';

export interface ComponentInfo {
    name: string;           // PascalCase component name
    relPath: string;        // path relative to projectRoot
    filePath: string;       // absolute path
    exports: string[];      // all exported component names in the file
    origin: ComponentOrigin; // whether it was created by visual-edit or is a pre-existing project file
}

const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'build', 'out', '.turbo', '.cache', 'public', 'visual-edit-kit-component-preview']);

/** Path segment that marks components created by visual-edit browser flows. */
const VISUAL_EDIT_SEGMENT = `${sep}visual-edit${sep}`;

// Directories where components typically live
const COMPONENT_DIRS = new Set(['components', 'ui', 'features', 'modules', 'sections', 'blocks', 'widgets', 'shared', 'lib', 'src']);

// Regex to extract exported PascalCase names from TSX/JSX source
const EXPORT_RE = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g;
const EXPORT_FROM_RE = /export\s*\{([^}]+)\}/g;

function isPreviewableComponentName(name: string): boolean {
    return /^[A-Z][A-Za-z0-9]*$/.test(name) && !/(Context|Provider)$/.test(name);
}

function extractExports(content: string): string[] {
    const names = new Set<string>();
    let m: RegExpExecArray | null;

    // export function/const/class Foo
    while ((m = EXPORT_RE.exec(content)) !== null) {
        names.add(m[1]!);
    }

    // export { Foo, Bar }
    while ((m = EXPORT_FROM_RE.exec(content)) !== null) {
        const parts = m[1]!.split(',');
        for (const part of parts) {
            const name = part.trim().split(/\s+as\s+/).pop()!.trim();
            if (/^[A-Z]/.test(name)) names.add(name);
        }
    }

    return Array.from(names);
}

function isComponentFile(fileName: string): boolean {
    // TSX/JSX files only. We validate component-ness by exported PascalCase symbols later,
    // because some generators such as shadcn emit lowercase file names like accordion.tsx.
    return /\.(tsx|jsx)$/.test(fileName) &&
        !fileName.includes('.test.') &&
        !fileName.includes('.spec.') &&
        !fileName.includes('.stories.');
}

function walkForComponents(dir: string, projectRoot: string, results: ComponentInfo[] = []): ComponentInfo[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return results; }

    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        try {
            const st = statSync(full);
            if (st.isDirectory()) {
                walkForComponents(full, projectRoot, results);
            } else if (isComponentFile(entry)) {
                const relPath  = full.replace(projectRoot + '/', '');
                if (relPath.split('/').some(part => part.toLowerCase() === 'context')) continue;
                const content  = readFileSync(full, 'utf-8');
                const exports  = extractExports(content).filter(isPreviewableComponentName);
                if (!exports.length) continue;
                // Primary name: the file name without extension
                const fileBase = entry.replace(/\.(tsx|jsx)$/, '');
                const primary  = exports.includes(fileBase) ? fileBase : exports[0]!;
                const origin: ComponentOrigin = full.includes(VISUAL_EDIT_SEGMENT) ? 'visual-edit' : 'project';
                results.push({ name: primary, relPath, filePath: full, exports, origin });
            }
        } catch { /* skip unreadable */ }
    }
    return results;
}

export function listComponents(projectRoot: string): ComponentInfo[] {
    const all = walkForComponents(projectRoot, projectRoot);
    // Sort by name alphabetically
    return all.sort((a, b) => a.name.localeCompare(b.name));
}
