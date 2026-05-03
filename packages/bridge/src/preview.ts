import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { dirname, relative, join, sep } from 'path';
import { getCompoundPreviewSeed } from './preview-seeds';
import { instrumentSourceWithOids } from './oid';

const IMPORT_RE = /import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["'];?/g;
const EXTERNAL_PREVIEW_IMPORT_ALLOWLIST = new Set([
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'next',
    'next/link',
    'next/image',
    'next/navigation',
    'next/font/google',
    'next/font/local',
]);
const PACKAGE_MANAGER_COMMANDS: Record<string, string> = {
    bun: 'bun add',
    pnpm: 'pnpm add',
    yarn: 'yarn add',
    npm: 'npm install',
};

function toImportPath(fromFile: string, toFile: string): string {
    let rel = relative(dirname(fromFile), toFile).split(sep).join('/');
    rel = rel.replace(/\.(tsx|jsx)$/, '');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
}

function isSafeExportName(name: string): boolean {
    return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

function extractExportedNames(content: string): string[] {
    const names = new Set<string>();
    const exportRe = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g;
    const exportFromRe = /export\s*\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = exportRe.exec(content)) !== null) names.add(match[1]!);
    while ((match = exportFromRe.exec(content)) !== null) {
        for (const part of match[1]!.split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name && /^[A-Z]/.test(name)) names.add(name);
        }
    }

    return Array.from(names);
}

function isDefaultExportedComponent(content: string, name: string): boolean {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`export\\s+default\\s+(?:function|class)\\s+${escaped}\\b`).test(content) ||
        new RegExp(`export\\s+default\\s+${escaped}\\b`).test(content) ||
        new RegExp(`export\\s*\\{[^}]*\\b${escaped}\\s+as\\s+default\\b[^}]*\\}`).test(content);
}

function extractExternalImports(content: string): string[] {
    const imports = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = IMPORT_RE.exec(content)) !== null) {
        const source = match[1]?.trim();
        if (!source) continue;
        if (source.startsWith('.') || source.startsWith('/') || source.startsWith('@/') || source.startsWith('~/')) continue;
        if (EXTERNAL_PREVIEW_IMPORT_ALLOWLIST.has(source)) continue;
        imports.add(source);
    }

    return Array.from(imports);
}

function readProjectPackageNames(projectRoot: string): Set<string> {
    const names = new Set<string>();
    const packageJsonPath = join(projectRoot, 'package.json');

    if (!existsSync(packageJsonPath)) return names;

    try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
        };

        for (const section of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]) {
            if (!section) continue;
            for (const name of Object.keys(section)) names.add(name);
        }
    } catch {
        return names;
    }

    return names;
}

function detectProjectPackageManager(projectRoot: string): 'bun' | 'pnpm' | 'yarn' | 'npm' {
    const packageJsonPath = join(projectRoot, 'package.json');
    if (existsSync(packageJsonPath)) {
        try {
            const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { packageManager?: string };
            const declared = parsed.packageManager?.split('@')[0]?.trim();
            if (declared === 'bun' || declared === 'pnpm' || declared === 'yarn' || declared === 'npm') return declared;
        } catch {
            // ignore malformed package.json here; fall back to lockfiles
        }
    }

    if (existsSync(join(projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(projectRoot, 'yarn.lock')) || existsSync(join(projectRoot, 'yarn.lock.gz'))) return 'yarn';
    if (existsSync(join(projectRoot, 'bun.lock')) || existsSync(join(projectRoot, 'bun.lockb'))) return 'bun';
    return 'npm';
}

function findMissingRuntimeDependencies(projectRoot: string, componentContent: string): string[] {
    const imports = extractExternalImports(componentContent);
    if (!imports.length) return [];

    const installed = readProjectPackageNames(projectRoot);
    return imports.filter(name => !installed.has(name));
}

function buildMissingDependencyPreviewPayload(projectRoot: string, missingDependencies: string[]): {
    code: 'missing-preview-dependencies';
    error: string;
    missingDependencies: string[];
    installCommand: string;
    packageManager: 'bun' | 'pnpm' | 'yarn' | 'npm';
} {
    const packageManager = detectProjectPackageManager(projectRoot);
    const installCommand = `${PACKAGE_MANAGER_COMMANDS[packageManager]} ${missingDependencies.join(' ')}`;
    return {
        code: 'missing-preview-dependencies',
        error: `Missing runtime dependencies for preview: ${missingDependencies.join(', ')}. Install with \`${installCommand}\`. Compatibility warning: these packages may conflict with the current project's UI primitives, versions, or conventions. Review before installing.`,
        missingDependencies,
        installCommand,
        packageManager,
    };
}

function splitTopLevelParams(params: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    let quote: '"' | "'" | '`' | null = null;
    let escaped = false;

    for (const ch of params) {
        if (quote) {
            current += ch;
            if (escaped) {
                escaped = false;
            } else if (ch === '\\') {
                escaped = true;
            } else if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === '[' || ch === '{' || ch === '(') {
            depth += 1;
            current += ch;
            continue;
        }
        if (ch === ']' || ch === '}' || ch === ')') {
            depth = Math.max(0, depth - 1);
            current += ch;
            continue;
        }
        if (ch === ',' && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
}

function inferPropNames(content: string, componentName: string): string[] {
    const patterns = [
        new RegExp(`export\\s+const\\s+${componentName}\\s*=\\s*(?:React\\.)?forwardRef\\s*\\([^=]*?\\(\\s*\\{([^}]*)\\}`, 's'),
        new RegExp(`export\\s+const\\s+${componentName}\\s*=\\s*\\(\\s*\\{([^}]*)\\}`, 's'),
        new RegExp(`export\\s+function\\s+${componentName}\\s*\\(\\s*\\{([^}]*)\\}`, 's'),
        new RegExp(`const\\s+${componentName}\\s*=\\s*\\(\\s*\\{([^}]*)\\}`, 's'),
        new RegExp(`function\\s+${componentName}\\s*\\(\\s*\\{([^}]*)\\}`, 's'),
    ];
    const match = patterns.map(pattern => content.match(pattern)).find(Boolean);
    if (!match?.[1]) return [];
    return splitTopLevelParams(match[1])
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => part.replace(/\s*=.*/, '').replace(/\s*:.*/, '').trim())
        .filter(part => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part) && part !== 'props');
}

function mockValueForProp(name: string): string {
    if (name === 'product') {
        return `{
    id: "visual-edit-preview-product",
    name: "Preview Product",
    description: "Temporary mock data for the Visual Edit preview.",
    image: "",
    category: { name: "Preview" },
    prices: [
      { active: true, currency: "usd", unit_amount: 2900, interval: "month" },
    ],
  }`;
    }
    if (name === 'user') {
        return `{
    id: "visual-edit-preview-user",
    name: "Preview User",
    email: "preview@example.com",
    avatarUrl: "",
  }`;
    }
    if (name === 'organization') {
        return `{
    id: "visual-edit-preview-org",
    name: "Preview Organization",
  }`;
    }
    if (name === 'project') {
        return `{
    id: "visual-edit-preview-project",
    name: "Preview Project",
    description: "Preview project",
  }`;
    }
    if (name === 'order') {
        return `{
    id: "visual-edit-preview-order",
    status: "pending",
    total: 0,
    items: [],
  }`;
    }
    if (name === 'data') {
        return `[
    { month: "Jan", value: 42, target: 58 },
    { month: "Feb", value: 68, target: 74 },
    { month: "Mar", value: 51, target: 64 },
    { month: "Apr", value: 86, target: 79 },
  ]`;
    }
    if (name === 'categories') return '["value", "target"]';
    if (name === 'index') return '"month"';
    if (name === 'colors') return 'undefined';
    if (name === 'valueFormatter') return 'undefined';
    if (name === 'height') return '300';
    if (name === 'children') return '"Preview content"';
    if (name === 'className' || name.endsWith('ClassName')) return '""';
    if (name === 'label' || name === 'title' || name === 'heading') return '"Preview label"';
    if (name === 'subtitle' || name === 'description' || name === 'helperText') return '"Preview description"';
    if (name === 'placeholder') return '"Preview value"';
    if (name === 'href') return '"#"';
    if (name === 'src' || name === 'avatarUrl' || name === 'imageUrl') return '""';
    if (name === 'type') return '"text"';
    if (name === 'size') return '"md"';
    if (name === 'variant') return '"primary"';
    if (name === 'logs') return '[]';
    if (name === 'orderHistories') return '{}';
    if (name === 'totalCount') return '0';
    if (name === 'page') return '1';
    if (name === 'totalPages') return '1';
    if (name === 'filters') {
        return `{
    entityType: "all",
    actorId: "all",
    period: "all",
    startDate: "",
    endDate: "",
    organizationId: "all",
  }`;
    }
    if (name === 'options') {
        return `{
    actors: [],
    entityTypes: [],
    organizations: [],
    isSuperAdmin: false,
  }`;
    }
    if (/^(is|has|can|should|show|hide|disabled|required|loading|open|active|selected)/i.test(name)) return 'false';
    if (/^(on[A-Z]|handle[A-Z])/.test(name)) return '() => {}';
    if (/count|index|total|page|limit|offset|amount|price|value/i.test(name)) return '0';
    if (/items|options|data|rows|columns|list|users|products|projects|tasks/i.test(name)) return '[]';
    return 'undefined';
}

function buildPreviewProps(content: string, componentName: string): string {
    const propNames = inferPropNames(content, componentName);
    if (!propNames.length) return 'const previewProps = {} as any;';
    const entries = propNames.map(name => `  ${name}: ${mockValueForProp(name)},`).join('\n');
    return `const previewProps = {
${entries}
} as any;`;
}

function buildProviderScaffold(projectRoot: string, componentContent: string): {
    imports: string;
    helpers: string;
    wrapStart: string;
    wrapEnd: string;
    componentTag: string;
} {
    const providerImports: string[] = [];
    const wrapStarts: string[] = [];
    const wrapEnds: string[] = [];
    let helpers = '';
    let componentTag = '<PreviewComponent {...previewProps} />';

    const usesAuth = /\buseAuth\b|AuthContext/.test(componentContent) && existsSync(join(projectRoot, 'components', 'features', 'auth', 'AuthProvider.tsx'));
    const usesToast = /\buseToast\b|ToastContext/.test(componentContent) && existsSync(join(projectRoot, 'components', 'ui', 'Toast.tsx'));
    const usesOrganization = /\buseOrganization\b|OrganizationContext/.test(componentContent) && existsSync(join(projectRoot, 'app', 'context', 'OrganizationContext.tsx'));
    const usesCart = /\buseCart\b|CartContext/.test(componentContent) && existsSync(join(projectRoot, 'app', 'context', 'CartContext.tsx'));

    if (usesAuth) {
        providerImports.push('import { AuthProvider } from "@/components/features/auth/AuthProvider";');
        wrapStarts.push('<AuthProvider>');
        wrapEnds.unshift('</AuthProvider>');
    }
    if (usesToast) {
        providerImports.push('import { ToastProvider } from "@/components/ui/Toast";');
        wrapStarts.push('<ToastProvider>');
        wrapEnds.unshift('</ToastProvider>');
    }
    if (usesOrganization) {
        providerImports.push('import { OrganizationProvider } from "@/app/context/OrganizationContext";');
        wrapStarts.push('<OrganizationProvider>');
        wrapEnds.unshift('</OrganizationProvider>');
    }
    if (!usesCart) {
        return {
            imports: providerImports.join('\n'),
            helpers,
            wrapStart: wrapStarts.join('\n'),
            wrapEnd: wrapEnds.join('\n'),
            componentTag,
        };
    }

    providerImports.push('import { useEffect } from "react";');
    providerImports.push('import { CartProvider, useCart } from "@/app/context/CartContext";');
    wrapStarts.push('<CartProvider>');
    wrapEnds.unshift('</CartProvider>');
    componentTag = '<VisualEditCartPreviewShell />';
    helpers = `
function VisualEditCartPreviewShell() {
  const { setIsCartOpen } = useCart();

  useEffect(() => {
    setIsCartOpen(true);
  }, [setIsCartOpen]);

  return <PreviewComponent {...previewProps} />;
}
`;

    return {
        imports: providerImports.join('\n'),
        helpers,
        wrapStart: wrapStarts.join('\n'),
        wrapEnd: wrapEnds.join('\n'),
        componentTag,
    };
}

export interface ComponentPreviewRequest {
    filePath: string;
    name: string;
}

export interface ComponentPreviewResult {
    ok: boolean;
    code?: 'missing-preview-dependencies';
    path?: string;
    error?: string;
    missingDependencies?: string[];
    installCommand?: string;
    packageManager?: 'bun' | 'pnpm' | 'yarn' | 'npm';
}

const PREVIEW_ROUTE_ROOT = 'visual-edit-kit-component-preview';

function slugForComponent(projectRoot: string, req: ComponentPreviewRequest): string {
    const rel = relative(projectRoot, req.filePath).split(sep).join('/');
    const base = `${req.name}-${rel}`
        .toLowerCase()
        .replace(/\.(tsx|jsx)$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 72);
    const hash = createHash('sha1').update(`${req.name}:${rel}`).digest('hex').slice(0, 8);
    return `${base}-${hash}`;
}

export function writeComponentPreview(projectRoot: string, req: ComponentPreviewRequest): ComponentPreviewResult {
    if (!req.filePath || !req.name) return { ok: false, error: 'filePath and name required' };
    if (!req.filePath.startsWith(projectRoot)) return { ok: false, error: 'filePath outside projectRoot' };
    if (!isSafeExportName(req.name)) return { ok: false, error: 'Invalid component export name' };

    // Next.js App Router treats folders prefixed with "_" as private folders,
    // so the preview route must use a highly specific but routable slug.
    const slug = slugForComponent(projectRoot, req);
    const pagePath = join(projectRoot, 'app', PREVIEW_ROUTE_ROOT, slug, 'page.tsx');
    const clientPath = join(projectRoot, 'app', PREVIEW_ROUTE_ROOT, slug, 'PreviewClient.tsx');
    const importPath = toImportPath(pagePath, req.filePath);
    let componentContent = '';
    try {
        componentContent = readFileSync(req.filePath, 'utf-8');
    } catch {
        return { ok: false, error: 'Cannot read component file' };
    }
    const exportedNames = extractExportedNames(componentContent);
    if (!exportedNames.includes(req.name)) {
        return {
            ok: false,
            error: `${req.name} is not exported by ${relative(projectRoot, req.filePath)}`,
        };
    }
    if (/(Context|Provider)$/.test(req.name) || relative(projectRoot, req.filePath).split(sep).some(part => part.toLowerCase() === 'context')) {
        return {
            ok: false,
            error: `${req.name} is not a visual component preview target`,
        };
    }
    const missingDependencies = findMissingRuntimeDependencies(projectRoot, componentContent);
    if (missingDependencies.length > 0) {
        return {
            ok: false,
            ...buildMissingDependencyPreviewPayload(projectRoot, missingDependencies),
        };
    }
    const previewProps = buildPreviewProps(componentContent, req.name);
    const providers = buildProviderScaffold(projectRoot, componentContent);
    const baseComponentImport = isDefaultExportedComponent(componentContent, req.name)
        ? `import PreviewComponent from "${importPath}";`
        : `import { ${req.name} as PreviewComponent } from "${importPath}";`;
    const previewSeed = getCompoundPreviewSeed(req.name, exportedNames, importPath);
    const componentImport = previewSeed
        ? `${baseComponentImport}\n${previewSeed.imports}`
        : baseComponentImport;
    const componentTag = previewSeed?.componentTag ?? providers.componentTag;

    const clientImportPath = toImportPath(pagePath, clientPath);
    const pageSource = `export const dynamic = "force-dynamic";

import PreviewClient from "${clientImportPath}";

export default function VisualEditComponentPreviewPage() {
  return <PreviewClient />;
}
`;

    const clientSource = `"use client";

import React from "react";
${componentImport}
${providers.imports}

${previewProps}
${providers.helpers}

class VisualEditPreviewErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
          <div className="font-semibold">Visual Edit preview error</div>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function VisualEditComponentPreviewPage() {
  return (
    <main className="min-h-screen bg-white p-10 text-gray-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <VisualEditPreviewErrorBoundary>
            ${providers.wrapStart}
              ${componentTag}
            ${providers.wrapEnd}
          </VisualEditPreviewErrorBoundary>
        </div>
      </div>
    </main>
  );
}
`;

    try {
        mkdirSync(dirname(pagePath), { recursive: true });
        writeFileSync(clientPath, instrumentSourceWithOids(clientPath, clientSource), 'utf-8');
        writeFileSync(pagePath, pageSource, 'utf-8');
    } catch (error) {
        rmSync(pagePath, { force: true });
        rmSync(clientPath, { force: true, recursive: true });
        return { ok: false, error: error instanceof Error ? error.message : 'Could not write preview page' };
    }

    return { ok: true, path: `/${PREVIEW_ROUTE_ROOT}/${slug}` };
}
