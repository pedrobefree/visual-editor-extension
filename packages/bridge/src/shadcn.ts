import { spawn } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, sep } from 'path';
import { instrumentSourceWithOids } from './oid';

export interface ShadcnRegistryItem {
    name: string;
    type: string;
    registry: string;
    addCommandArgument: string;
}

export interface ShadcnRegistryListResult {
    ok: boolean;
    error?: string;
    code?: 'missing-components-config' | 'missing-project-config' | 'cli-failed' | 'invalid-cli-output';
    items?: ShadcnRegistryItem[];
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
}

export interface ShadcnRegistryInstallResult {
    ok: boolean;
    error?: string;
    code?: 'missing-components-config' | 'missing-project-config' | 'invalid-item' | 'cli-failed' | 'file-conflict';
    conflictPaths?: string[];
    installedItem?: ShadcnRegistryItem;
    stdout?: string;
}

interface RunnerResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}

export type ShadcnCliRunner = (cwd: string, args: string[]) => Promise<RunnerResult>;

export interface ListShadcnOptions {
    query?: string;
    limit?: number;
    offset?: number;
    runner?: ShadcnCliRunner;
}

export interface InstallShadcnOptions {
    runner?: ShadcnCliRunner;
}

const DEFAULT_LIMIT = 100;
const IGNORED_DIRS = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'out', 'coverage', '.turbo']);
const CSS_ENTRY_CANDIDATES = [
    'src/app/globals.css',
    'app/globals.css',
    'src/styles/globals.css',
    'styles/globals.css',
    'src/index.css',
    'index.css',
];
const TAILWIND_CONFIG_CANDIDATES = [
    'tailwind.config.ts',
    'tailwind.config.js',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
];
const SAFE_MUTATED_FILES = new Set([
    'package.json',
    'package-lock.json',
    'bun.lock',
    'bun.lockb',
    'pnpm-lock.yaml',
    'yarn.lock',
    'yarn.lock.gz',
    'components.json',
]);
const TEMP_WORKSPACE_INPUT_FILES = [
    'tsconfig.json',
    'jsconfig.json',
];
const FILE_IMPORT_RE = /((?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["'])([^"']+)(["'])/g;

type ProjectSnapshot = Map<string, Buffer>;
type ShadcnComponentsConfig = {
    aliases?: Record<string, string>;
    [key: string]: unknown;
};
type PreparedShadcnConfig =
    | { ok: true; cleanup: () => void; config: ShadcnComponentsConfig }
    | { ok: false; code: 'missing-project-config'; error: string };
type PreparedShadcnWorkspace =
    | { ok: true; cleanup: () => void; baseConfig: ShadcnComponentsConfig; config: ShadcnComponentsConfig; workspaceRoot: string }
    | { ok: false; code: 'missing-project-config'; error: string };

const runShadcnCli: ShadcnCliRunner = (cwd, args) => new Promise((resolve) => {
    const child = spawn('npx', ['shadcn@latest', ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
        stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
        stderr += String(chunk);
    });
    child.on('error', error => {
        resolve({ ok: false, stdout, stderr: error.message || stderr, exitCode: 1 });
    });
    child.on('close', code => {
        resolve({ ok: code === 0, stdout, stderr, exitCode: code ?? 1 });
    });
});

function captureProjectSnapshot(projectRoot: string): ProjectSnapshot {
    const files: ProjectSnapshot = new Map();

    const walk = (dirPath: string, relativeDir = ''): void => {
        for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) continue;

            const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
            const absolutePath = join(dirPath, entry.name);

            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name)) continue;
                walk(absolutePath, relativePath);
                continue;
            }

            if (!entry.isFile()) continue;
            files.set(relativePath, readFileSync(absolutePath));
        }
    };

    walk(projectRoot);
    return files;
}

function diffProjectSnapshots(before: ProjectSnapshot, after: ProjectSnapshot): {
    created: string[];
    modified: string[];
    deleted: string[];
} {
    const created: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const [relativePath, beforeContent] of before) {
        const afterContent = after.get(relativePath);
        if (!afterContent) {
            deleted.push(relativePath);
            continue;
        }
        if (!beforeContent.equals(afterContent)) {
            modified.push(relativePath);
        }
    }

    for (const relativePath of after.keys()) {
        if (!before.has(relativePath)) created.push(relativePath);
    }

    return {
        created: created.sort(),
        modified: modified.sort(),
        deleted: deleted.sort(),
    };
}

function rollbackProjectSnapshot(projectRoot: string, before: ProjectSnapshot, after: ProjectSnapshot): void {
    for (const relativePath of after.keys()) {
        if (before.has(relativePath)) continue;
        rmSync(join(projectRoot, relativePath), { force: true });
    }

    for (const [relativePath, content] of before) {
        const absolutePath = join(projectRoot, relativePath);
        mkdirSync(join(absolutePath, '..'), { recursive: true });
        writeFileSync(absolutePath, content);
    }
}

function isSafeShadcnMutation(relativePath: string): boolean {
    return SAFE_MUTATED_FILES.has(relativePath);
}

function formatConflictErrorMessage(conflictPaths: string[]): string {
    return `Installing this shadcn item would overwrite existing project files: ${conflictPaths.join(', ')}`;
}

function formatMissingProjectConfigError(reason: string): string {
    return `Could not infer a temporary shadcn setup for this project: ${reason}`;
}

function normalizeAlias(alias: string): string {
    return alias.replace(/\/+$/, '');
}

function appendAlias(baseAlias: string, segment: string): string {
    return `${normalizeAlias(baseAlias)}/${segment}`;
}

function inferComponentsAlias(config: ShadcnComponentsConfig): string {
    const aliases = config.aliases ?? {};
    if (aliases.components?.trim()) return normalizeAlias(aliases.components.trim());
    if (aliases.ui?.trim()) {
        const uiAlias = normalizeAlias(aliases.ui.trim());
        return uiAlias.endsWith('/ui') ? uiAlias.slice(0, -3) : uiAlias;
    }
    return '@/components';
}

function buildIsolatedShadcnConfig(config: ShadcnComponentsConfig): ShadcnComponentsConfig {
    const aliases = config.aliases ?? {};
    const componentsRoot = appendAlias(inferComponentsAlias(config), 'visual-edit/shadcn');

    return {
        ...config,
        aliases: {
            ...aliases,
            components: componentsRoot,
            ui: appendAlias(componentsRoot, 'ui'),
            hooks: appendAlias(componentsRoot, 'hooks'),
            lib: appendAlias(componentsRoot, 'lib'),
            utils: appendAlias(componentsRoot, 'utils'),
        },
    };
}

function inferPathAliasPrefix(projectRoot: string): string | null {
    for (const configName of ['tsconfig.json', 'jsconfig.json']) {
        const filePath = join(projectRoot, configName);
        if (!existsSync(filePath)) continue;
        try {
            const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
                compilerOptions?: { paths?: Record<string, string[]> };
            };
            const paths = parsed.compilerOptions?.paths ?? {};
            for (const key of Object.keys(paths)) {
                if (key.endsWith('/*')) {
                    return key.slice(0, -2);
                }
            }
        } catch {
            continue;
        }
    }
    return null;
}

function inferPathAliasTargetPrefix(projectRoot: string, aliasPrefix: string): string | null {
    for (const configName of ['tsconfig.json', 'jsconfig.json']) {
        const filePath = join(projectRoot, configName);
        if (!existsSync(filePath)) continue;
        try {
            const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
                compilerOptions?: { paths?: Record<string, string[]> };
            };
            const paths = parsed.compilerOptions?.paths ?? {};
            const mapping = paths[`${aliasPrefix}/*`]?.[0];
            if (!mapping) continue;
            return mapping
                .replace(/^\.\//, '')
                .replace(/\/?\*$/, '')
                .replace(/\/+$/, '');
        } catch {
            continue;
        }
    }
    return null;
}

function inferTailwindCssPath(projectRoot: string): string | null {
    for (const candidate of CSS_ENTRY_CANDIDATES) {
        if (existsSync(join(projectRoot, candidate))) return candidate;
    }
    return null;
}

function inferTailwindConfigPath(projectRoot: string): string {
    for (const candidate of TAILWIND_CONFIG_CANDIDATES) {
        if (existsSync(join(projectRoot, candidate))) return candidate;
    }
    return '';
}

function copyTextFile(projectRoot: string, workspaceRoot: string, relativePath: string): void {
    const sourcePath = join(projectRoot, relativePath);
    if (!existsSync(sourcePath)) return;
    const destinationPath = join(workspaceRoot, relativePath);
    mkdirSync(join(destinationPath, '..'), { recursive: true });
    writeFileSync(destinationPath, readFileSync(sourcePath));
}

function extractConfigPath(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function loadBaseShadcnConfig(projectRoot: string): PreparedShadcnConfig {
    const componentsConfigPath = join(projectRoot, 'components.json');
    if (existsSync(componentsConfigPath)) {
        return {
            ok: true,
            config: JSON.parse(readFileSync(componentsConfigPath, 'utf-8')) as ShadcnComponentsConfig,
            cleanup: () => {},
        };
    }

    return inferGeneratedShadcnConfig(projectRoot);
}

function createShadcnTempWorkspace(projectRoot: string): PreparedShadcnWorkspace {
    const prepared = loadBaseShadcnConfig(projectRoot);
    if (!prepared.ok) return prepared;

    const workspaceRoot = mkdtempSync(join(tmpdir(), 'visual-edit-shadcn-'));
    const baseConfig = prepared.config;
    const tempConfig = buildIsolatedShadcnConfig(baseConfig);

    try {
        for (const file of TEMP_WORKSPACE_INPUT_FILES) {
            copyTextFile(projectRoot, workspaceRoot, file);
        }

        const tailwind = typeof tempConfig.tailwind === 'object' && tempConfig.tailwind !== null
            ? tempConfig.tailwind as Record<string, unknown>
            : null;
        const tailwindCssPath = extractConfigPath(tailwind?.css);
        const tailwindConfigPath = extractConfigPath(tailwind?.config);

        if (tailwindCssPath) copyTextFile(projectRoot, workspaceRoot, tailwindCssPath);
        if (tailwindConfigPath) copyTextFile(projectRoot, workspaceRoot, tailwindConfigPath);

        writeFileSync(join(workspaceRoot, 'components.json'), `${JSON.stringify(tempConfig, null, 2)}\n`, 'utf-8');
        writeFileSync(join(workspaceRoot, 'package.json'), `${JSON.stringify({
            name: 'visual-edit-shadcn-workspace',
            private: true,
            version: '0.0.0',
        }, null, 2)}\n`, 'utf-8');
    } catch (error) {
        rmSync(workspaceRoot, { recursive: true, force: true });
        throw error;
    }

    return {
        ok: true,
        workspaceRoot,
        baseConfig,
        config: tempConfig,
        cleanup: () => {
            rmSync(workspaceRoot, { recursive: true, force: true });
        },
    };
}

function shouldPersistImportedFile(relativePath: string): boolean {
    if (SAFE_MUTATED_FILES.has(relativePath)) return false;
    return !TEMP_WORKSPACE_INPUT_FILES.includes(relativePath);
}

function collectWorkspaceOutputFiles(before: ProjectSnapshot, after: ProjectSnapshot): string[] {
    const diff = diffProjectSnapshots(before, after);
    return [...diff.created, ...diff.modified]
        .filter(shouldPersistImportedFile)
        .sort();
}

function toPosixPath(filePath: string): string {
    return filePath.split(sep).join('/');
}

function toRelativeImportPath(fromFile: string, toFile: string): string {
    let rel = relative(dirname(fromFile), toFile).split(sep).join('/');
    rel = rel.replace(/\.(tsx|jsx|ts|js)$/, '');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return rel;
}

function resolveInternalAliasImport(
    projectRoot: string,
    config: ShadcnComponentsConfig,
    relativePaths: string[],
    importSource: string,
): string | null {
    const aliasPrefix = inferPathAliasPrefix(projectRoot);
    if (!aliasPrefix) return null;
    const aliasTargetPrefix = inferPathAliasTargetPrefix(projectRoot, aliasPrefix);
    if (aliasTargetPrefix === null) return null;

    const aliases = Object.values(config.aliases ?? {})
        .filter((value): value is string => typeof value === 'string' && value.startsWith(`${aliasPrefix}/`))
        .sort((a, b) => b.length - a.length);

    for (const aliasValue of aliases) {
        if (importSource !== aliasValue && !importSource.startsWith(`${aliasValue}/`)) continue;
        const suffix = importSource.slice(aliasValue.length);
        const fsBase = aliasValue.replace(`${aliasPrefix}/`, aliasTargetPrefix ? `${aliasTargetPrefix}/` : '');
        const candidateBase = `${fsBase}${suffix}`;
        const candidateRoots = [
            candidateBase,
            `${candidateBase}.ts`,
            `${candidateBase}.tsx`,
            `${candidateBase}.js`,
            `${candidateBase}.jsx`,
            `${candidateBase}/index.ts`,
            `${candidateBase}/index.tsx`,
            `${candidateBase}/index.js`,
            `${candidateBase}/index.jsx`,
        ].map(path => path.replace(/^\/+/, ''));

        const match = relativePaths.find(relativePath => candidateRoots.includes(toPosixPath(relativePath)));
        if (match) return match;
    }

    return null;
}

function resolveOriginalAliasImport(
    baseConfig: ShadcnComponentsConfig,
    isolatedConfig: ShadcnComponentsConfig,
    importSource: string,
): string | null {
    const isolatedAliases = isolatedConfig.aliases ?? {};
    const baseAliases = baseConfig.aliases ?? {};
    const candidates = Object.entries(isolatedAliases)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
        .sort(([, a], [, b]) => b.length - a.length);

    for (const [key, isolatedValue] of candidates) {
        if (typeof isolatedValue !== 'string' || !isolatedValue.trim()) continue;
        const baseValue = baseAliases[key];
        if (typeof baseValue !== 'string' || !baseValue.trim()) continue;
        if (importSource !== isolatedValue && !importSource.startsWith(`${isolatedValue}/`)) continue;
        return `${baseValue}${importSource.slice(isolatedValue.length)}`;
    }

    return null;
}

function rewriteInternalShadcnImports(
    projectRoot: string,
    baseConfig: ShadcnComponentsConfig,
    config: ShadcnComponentsConfig,
    relativePaths: string[],
    relativePath: string,
    content: string,
): string {
    return content.replace(FILE_IMPORT_RE, (full, prefix: string, source: string, suffix: string) => {
        const resolved = resolveInternalAliasImport(projectRoot, config, relativePaths, source);
        if (resolved) {
            return `${prefix}${toRelativeImportPath(relativePath, resolved)}${suffix}`;
        }
        const originalAlias = resolveOriginalAliasImport(baseConfig, config, source);
        if (originalAlias) {
            return `${prefix}${originalAlias}${suffix}`;
        }
        return full;
    });
}

function copyImportedFilesToProject(
    projectRoot: string,
    workspaceRoot: string,
    relativePaths: string[],
    baseConfig: ShadcnComponentsConfig,
    config: ShadcnComponentsConfig,
): void {
    for (const relativePath of relativePaths) {
        const sourcePath = join(workspaceRoot, relativePath);
        const destinationPath = join(projectRoot, relativePath);
        mkdirSync(join(destinationPath, '..'), { recursive: true });
        const rawContent = readFileSync(sourcePath);
        if (/\.(tsx|jsx|ts|js)$/.test(relativePath)) {
            const rewritten = rewriteInternalShadcnImports(projectRoot, baseConfig, config, relativePaths, relativePath, rawContent.toString('utf-8'));
            const instrumented = /\.(tsx|jsx)$/.test(relativePath)
                ? instrumentSourceWithOids(destinationPath, rewritten)
                : rewritten;
            writeFileSync(destinationPath, instrumented, 'utf-8');
            continue;
        }
        writeFileSync(destinationPath, rawContent);
    }
}

function inferGeneratedShadcnConfig(projectRoot: string): PreparedShadcnConfig {
    const aliasPrefix = inferPathAliasPrefix(projectRoot);
    if (!aliasPrefix) {
        return {
            ok: false,
            code: 'missing-project-config',
            error: formatMissingProjectConfigError('No path alias was found in tsconfig.json or jsconfig.json. Configure aliases such as "@/*" or add a components.json file.'),
        };
    }

    const tailwindCssPath = inferTailwindCssPath(projectRoot);
    if (!tailwindCssPath) {
        return {
            ok: false,
            code: 'missing-project-config',
            error: formatMissingProjectConfigError('No Tailwind CSS entry file was detected. Add app/globals.css, src/app/globals.css, styles/globals.css, or create a components.json file with tailwind.css.'),
        };
    }

    const config: ShadcnComponentsConfig = {
        $schema: 'https://ui.shadcn.com/schema.json',
        style: 'new-york',
        rsc: existsSync(join(projectRoot, 'app')) || existsSync(join(projectRoot, 'src/app')),
        tsx: existsSync(join(projectRoot, 'tsconfig.json')),
        tailwind: {
            config: inferTailwindConfigPath(projectRoot),
            css: tailwindCssPath,
            baseColor: 'neutral',
            cssVariables: true,
            prefix: '',
        },
        iconLibrary: 'lucide',
        aliases: {
            components: `${aliasPrefix}/components`,
            ui: `${aliasPrefix}/components/ui`,
            utils: `${aliasPrefix}/lib/utils`,
            lib: `${aliasPrefix}/lib`,
            hooks: `${aliasPrefix}/hooks`,
        },
    };

    return { ok: true, config, cleanup: () => {} };
}

function prepareTemporaryShadcnConfig(projectRoot: string, isolated: boolean): PreparedShadcnConfig {
    const componentsConfigPath = join(projectRoot, 'components.json');
    const existingConfigText = existsSync(componentsConfigPath) ? readFileSync(componentsConfigPath, 'utf-8') : null;

    let baseConfig: ShadcnComponentsConfig;
    if (existingConfigText) {
        baseConfig = JSON.parse(existingConfigText) as ShadcnComponentsConfig;
    } else {
        const inferred = inferGeneratedShadcnConfig(projectRoot);
        if (!inferred.ok) return inferred;
        baseConfig = inferred.config;
    }

    const tempConfig = isolated ? buildIsolatedShadcnConfig(baseConfig) : baseConfig;
    writeFileSync(componentsConfigPath, `${JSON.stringify(tempConfig, null, 2)}\n`, 'utf-8');

    return {
        ok: true,
        config: tempConfig,
        cleanup: () => {
            if (existingConfigText === null) {
                rmSync(componentsConfigPath, { force: true });
                return;
            }
            writeFileSync(componentsConfigPath, existingConfigText, 'utf-8');
        },
    };
}

async function withPreparedShadcnConfig<T>(
    projectRoot: string,
    isolated: boolean,
    fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; code: 'missing-project-config'; error: string }> {
    const prepared = prepareTemporaryShadcnConfig(projectRoot, isolated);
    if (!prepared.ok) return prepared;

    try {
        return { ok: true, value: await fn() };
    } finally {
        prepared.cleanup();
    }
}

export async function listShadcnRegistryItems(projectRoot: string, options: ListShadcnOptions = {}): Promise<ShadcnRegistryListResult> {
    const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 200));
    const offset = Math.max(0, options.offset ?? 0);
    const args = [
        'list',
        '@shadcn',
        '--cwd',
        projectRoot,
        '--limit',
        String(limit),
        '--offset',
        String(offset),
    ];

    if (options.query?.trim()) {
        args.push('--query', options.query.trim());
    }

    const runner = options.runner ?? runShadcnCli;
    const prepared = await withPreparedShadcnConfig(projectRoot, false, () => runner(projectRoot, args));
    if (!prepared.ok) {
        return {
            ok: false,
            code: prepared.code,
            error: prepared.error,
        };
    }
    const result = prepared.value;
    if (!result.ok) {
        return {
            ok: false,
            code: 'cli-failed',
            error: result.stderr.trim() || result.stdout.trim() || `shadcn CLI exited with code ${result.exitCode}`,
        };
    }

    try {
        const parsed = JSON.parse(result.stdout) as {
            pagination?: { total?: number; offset?: number; limit?: number; hasMore?: boolean };
            items?: ShadcnRegistryItem[];
        };
        return {
            ok: true,
            items: Array.isArray(parsed.items) ? parsed.items : [],
            total: parsed.pagination?.total ?? 0,
            limit: parsed.pagination?.limit ?? limit,
            offset: parsed.pagination?.offset ?? offset,
            hasMore: parsed.pagination?.hasMore ?? false,
        };
    } catch {
        return {
            ok: false,
            code: 'invalid-cli-output',
            error: 'Could not parse shadcn CLI output',
        };
    }
}

export async function installShadcnRegistryItem(
    projectRoot: string,
    item: ShadcnRegistryItem,
    options: InstallShadcnOptions = {},
): Promise<ShadcnRegistryInstallResult> {
    if (!item.addCommandArgument?.trim()) {
        return {
            ok: false,
            code: 'invalid-item',
            error: 'Missing shadcn add command argument',
        };
    }

    const runner = options.runner ?? runShadcnCli;
    const prepared = createShadcnTempWorkspace(projectRoot);
    if (!prepared.ok) {
        return {
            ok: false,
            code: prepared.code,
            error: prepared.error,
        };
    }

    const workspaceRoot = prepared.workspaceRoot;
    const before = captureProjectSnapshot(workspaceRoot);
    let result: RunnerResult;

    try {
        result = await runner(workspaceRoot, [
        'add',
        item.addCommandArgument.trim(),
        '--cwd',
        workspaceRoot,
        '--yes',
        ]);
    } finally {
        // cleanup happens after file collection/copy
    }
    const after = captureProjectSnapshot(workspaceRoot);

    if (!result.ok) {
        prepared.cleanup();
        return {
            ok: false,
            code: 'cli-failed',
            error: result.stderr.trim() || result.stdout.trim() || `shadcn CLI exited with code ${result.exitCode}`,
        };
    }

    const outputFiles = collectWorkspaceOutputFiles(before, after);
    const conflictPaths = outputFiles.filter(relativePath => existsSync(join(projectRoot, relativePath)));
    if (conflictPaths.length > 0) {
        prepared.cleanup();
        return {
            ok: false,
            code: 'file-conflict',
            error: formatConflictErrorMessage(conflictPaths),
            conflictPaths,
        };
    }

    copyImportedFilesToProject(projectRoot, workspaceRoot, outputFiles, prepared.baseConfig, prepared.config);
    prepared.cleanup();

    return {
        ok: true,
        installedItem: item,
        stdout: result.stdout.trim(),
    };
}
