import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { describe, expect, test } from 'bun:test';
import {
    installShadcnRegistryItem,
    listShadcnRegistryItems,
    type ShadcnCliRunner,
    type ShadcnRegistryItem,
} from './shadcn';

function write(root: string, relPath: string, content: string): string {
    const filePath = join(root, relPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

describe('listShadcnRegistryItems', () => {
    test('creates a temporary inferred components.json when the project is not initialized', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-list-missing-'));
        let runnerCalled = false;

        try {
            write(projectRoot, 'tsconfig.json', JSON.stringify({
                compilerOptions: {
                    paths: {
                        '@/*': ['./src/*'],
                    },
                },
            }, null, 2));
            write(projectRoot, 'src/app/globals.css', '@import "tailwindcss";\n');

            const runner: ShadcnCliRunner = async (cwd) => {
                runnerCalled = true;
                const config = JSON.parse(readFileSync(join(cwd, 'components.json'), 'utf-8'));
                expect(config.aliases.components).toBe('@/components');
                expect(config.aliases.ui).toBe('@/components/ui');
                expect(config.aliases.utils).toBe('@/lib/utils');
                expect(config.tailwind.css).toBe('src/app/globals.css');
                expect(config.rsc).toBe(true);
                expect(config.tsx).toBe(true);
                return {
                    ok: true,
                    stdout: JSON.stringify({ pagination: { total: 0, offset: 0, limit: 100, hasMore: false }, items: [] }),
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await listShadcnRegistryItems(projectRoot, { runner });

            expect(result.ok).toBe(true);
            expect(runnerCalled).toBe(true);
            expect(existsSync(join(projectRoot, 'components.json'))).toBe(false);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('parses json output from the shadcn cli', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-list-ok-'));

        try {
            writeFileSync(join(projectRoot, 'components.json'), JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json' }));

            const runner: ShadcnCliRunner = async () => ({
                ok: true,
                stdout: JSON.stringify({
                    pagination: { total: 2, offset: 0, limit: 100, hasMore: false },
                    items: [
                        { name: 'accordion', type: 'registry:ui', registry: '@shadcn', addCommandArgument: '@shadcn/accordion' },
                        { name: 'login-03', type: 'registry:block', registry: '@shadcn', addCommandArgument: '@shadcn/login-03' },
                    ],
                }),
                stderr: '',
                exitCode: 0,
            });

            const result = await listShadcnRegistryItems(projectRoot, { runner });

            expect(result.ok).toBe(true);
            expect(result.items).toHaveLength(2);
            expect(result.items?.[0]?.name).toBe('accordion');
            expect(result.items?.[1]?.type).toBe('registry:block');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('passes query and limit through to the runner', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-list-args-'));
        let capturedArgs: string[] = [];

        try {
            writeFileSync(join(projectRoot, 'components.json'), JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json' }));

            const runner: ShadcnCliRunner = async (cwd, args) => {
                capturedArgs = [cwd, ...args];
                return {
                    ok: true,
                    stdout: JSON.stringify({ pagination: { total: 0, offset: 0, limit: 20, hasMore: false }, items: [] }),
                    stderr: '',
                    exitCode: 0,
                };
            };

            await listShadcnRegistryItems(projectRoot, { query: 'button', limit: 20, runner });

            expect(capturedArgs).toContain(projectRoot);
            expect(capturedArgs).toContain('--query');
            expect(capturedArgs).toContain('button');
            expect(capturedArgs).toContain('--limit');
            expect(capturedArgs).toContain('20');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('returns a useful error when the cli fails', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-list-fail-'));

        try {
            writeFileSync(join(projectRoot, 'components.json'), JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json' }));

            const runner: ShadcnCliRunner = async () => ({
                ok: false,
                stdout: '',
                stderr: 'network timeout',
                exitCode: 1,
            });

            const result = await listShadcnRegistryItems(projectRoot, { runner });

            expect(result.ok).toBe(false);
            expect(result.error).toContain('network timeout');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});

describe('installShadcnRegistryItem', () => {
    const buttonItem: ShadcnRegistryItem = {
        name: 'button',
        type: 'registry:ui',
        registry: '@shadcn',
        addCommandArgument: '@shadcn/button',
    };

    test('creates a temporary isolated components.json when the project is not initialized', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-missing-'));

        try {
            write(projectRoot, 'jsconfig.json', JSON.stringify({
                compilerOptions: {
                    paths: {
                        '~/*': ['./*'],
                    },
                },
            }, null, 2));
            write(projectRoot, 'app/globals.css', '@import "tailwindcss";\n');

            const runner: ShadcnCliRunner = async (cwd) => {
                const config = JSON.parse(readFileSync(join(cwd, 'components.json'), 'utf-8'));
                expect(config.aliases.components).toBe('~/components/visual-edit/shadcn');
                expect(config.aliases.ui).toBe('~/components/visual-edit/shadcn/ui');
                expect(config.aliases.utils).toBe('~/components/visual-edit/shadcn/utils');
                expect(config.tailwind.css).toBe('app/globals.css');
                write(cwd, 'components/visual-edit/shadcn/ui/button.tsx', 'export function Button() { return <button />; }\n');
                return {
                    ok: true,
                    stdout: 'Installed button',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, buttonItem, { runner });

            expect(result.ok).toBe(true);
            expect(existsSync(join(projectRoot, 'components/visual-edit/shadcn/ui/button.tsx'))).toBe(true);
            expect(existsSync(join(projectRoot, 'components.json'))).toBe(false);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('returns a clear error when it cannot infer the project tailwind entry', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-infer-fail-'));

        try {
            write(projectRoot, 'tsconfig.json', JSON.stringify({
                compilerOptions: {
                    paths: {
                        '@/*': ['./src/*'],
                    },
                },
            }, null, 2));

            const result = await installShadcnRegistryItem(projectRoot, buttonItem);

            expect(result.ok).toBe(false);
            expect(result.code).toBe('missing-project-config');
            expect(result.error).toContain('Tailwind CSS entry file');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('passes the add command through to the runner when config exists', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-install-'));
        let runnerCwd = '';
        let capturedArgs: string[] = [];

        try {
            writeFileSync(join(projectRoot, 'components.json'), JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json' }));

            const runner: ShadcnCliRunner = async (cwd, args) => {
                runnerCwd = cwd;
                capturedArgs = args;
                return {
                    ok: true,
                    stdout: 'Installed button',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, buttonItem, { runner });

            expect(result.ok).toBe(true);
            expect(result.installedItem?.name).toBe('button');
            expect(runnerCwd).not.toBe(projectRoot);
            expect(capturedArgs).toEqual([
                'add',
                '@shadcn/button',
                '--cwd',
                runnerCwd,
                '--yes',
            ]);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('installs into an isolated visual-edit namespace and restores components.json afterwards', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-isolated-'));
        const originalConfig = {
            $schema: 'https://ui.shadcn.com/schema.json',
            aliases: {
                components: '@/components',
                ui: '@/components/ui',
                utils: '@/lib/utils',
                hooks: '@/hooks',
                lib: '@/lib',
            },
        };

        try {
            write(projectRoot, 'components.json', JSON.stringify(originalConfig, null, 2));

            const runner: ShadcnCliRunner = async (cwd) => {
                expect(cwd).not.toBe(projectRoot);
                const config = JSON.parse(readFileSync(join(cwd, 'components.json'), 'utf-8'));

                expect(config.aliases.components).toBe('@/components/visual-edit/shadcn');
                expect(config.aliases.ui).toBe('@/components/visual-edit/shadcn/ui');
                expect(config.aliases.utils).toBe('@/components/visual-edit/shadcn/utils');
                expect(config.aliases.hooks).toBe('@/components/visual-edit/shadcn/hooks');
                expect(config.aliases.lib).toBe('@/components/visual-edit/shadcn/lib');

                write(cwd, 'src/components/visual-edit/shadcn/ui/button.tsx', 'export function Button() { return <button />; }\n');
                write(cwd, 'src/components/visual-edit/shadcn/utils.ts', 'export function cn(...parts: string[]) { return parts.join(" "); }\n');
                write(cwd, 'package.json', JSON.stringify({ name: 'demo', dependencies: { "@radix-ui/react-slot": "^1.2.0" } }, null, 2));

                return {
                    ok: true,
                    stdout: 'Installed button',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, buttonItem, { runner });

            expect(result.ok).toBe(true);
            const persistedButton = readFileSync(join(projectRoot, 'src/components/visual-edit/shadcn/ui/button.tsx'), 'utf-8');
            expect(persistedButton).toContain('data-oid=');
            expect(existsSync(join(projectRoot, 'src/components/visual-edit/shadcn/utils.ts'))).toBe(true);
            expect(JSON.parse(readFileSync(join(projectRoot, 'components.json'), 'utf-8'))).toEqual(originalConfig);
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('rewrites internal shadcn alias imports to relative paths in persisted files', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-relative-imports-'));

        try {
            write(projectRoot, 'tsconfig.json', JSON.stringify({
                compilerOptions: {
                    paths: {
                        '@/*': ['./src/*'],
                    },
                },
            }, null, 2));
            write(projectRoot, 'src/app/globals.css', '@import "tailwindcss";\n');

            const runner: ShadcnCliRunner = async (cwd) => {
                write(cwd, 'src/components/visual-edit/shadcn/ui/accordion.tsx', `
import { cn } from "@/components/visual-edit/shadcn/utils";
import { Button } from "@/components/visual-edit/shadcn/ui/button";

export function Accordion() {
  return <div className={cn("a")}><Button /></div>;
}
`);
                write(cwd, 'src/components/visual-edit/shadcn/ui/button.tsx', 'export function Button() { return <button />; }\n');
                write(cwd, 'src/components/visual-edit/shadcn/utils.ts', 'export function cn(...parts: string[]) { return parts.join(" "); }\n');
                return {
                    ok: true,
                    stdout: 'Installed accordion',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, {
                name: 'accordion',
                type: 'registry:ui',
                registry: '@shadcn',
                addCommandArgument: '@shadcn/accordion',
            }, { runner });

            expect(result.ok).toBe(true);
            const persisted = readFileSync(join(projectRoot, 'src/components/visual-edit/shadcn/ui/accordion.tsx'), 'utf-8');
            expect(persisted).toContain('from "../utils"');
            expect(persisted).toContain('from "./button"');
            expect(persisted).not.toContain('@/components/visual-edit/shadcn/utils');
            expect(persisted).toContain('data-oid=');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('rewrites internal shadcn alias imports to relative paths for projects without src root', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-relative-no-src-'));

        try {
            write(projectRoot, 'jsconfig.json', JSON.stringify({
                compilerOptions: {
                    paths: {
                        '@/*': ['./*'],
                    },
                },
            }, null, 2));
            write(projectRoot, 'app/globals.css', '@import "tailwindcss";\n');

            const runner: ShadcnCliRunner = async (cwd) => {
                write(cwd, 'components/visual-edit/shadcn/ui/accordion.tsx', `
import { cn } from "@/components/visual-edit/shadcn/utils";
import { Button } from "@/components/visual-edit/shadcn/ui/button";

export function Accordion() {
  return <div className={cn("a")}><Button /></div>;
}
`);
                write(cwd, 'components/visual-edit/shadcn/ui/button.tsx', 'export function Button() { return <button />; }\n');
                write(cwd, 'components/visual-edit/shadcn/utils.ts', 'export function cn(...parts: string[]) { return parts.join(" "); }\n');
                return {
                    ok: true,
                    stdout: 'Installed accordion',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, {
                name: 'accordion',
                type: 'registry:ui',
                registry: '@shadcn',
                addCommandArgument: '@shadcn/accordion',
            }, { runner });

            expect(result.ok).toBe(true);
            const persisted = readFileSync(join(projectRoot, 'components/visual-edit/shadcn/ui/accordion.tsx'), 'utf-8');
            expect(persisted).toContain('from "../utils"');
            expect(persisted).toContain('from "./button"');
            expect(persisted).not.toContain('@/components/visual-edit/shadcn/utils');
            expect(persisted).toContain('data-oid=');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('rewrites missing isolated helper imports back to the project alias when the cli does not generate them', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-fallback-utils-'));

        try {
            write(projectRoot, 'components.json', JSON.stringify({
                $schema: 'https://ui.shadcn.com/schema.json',
                aliases: {
                    components: '@/components',
                    ui: '@/components/ui',
                    utils: '@/lib/utils',
                    hooks: '@/hooks',
                    lib: '@/lib',
                },
            }, null, 2));
            write(projectRoot, 'lib/utils.ts', 'export function cn(...parts: string[]) { return parts.join(" "); }\n');

            const runner: ShadcnCliRunner = async (cwd) => {
                write(cwd, 'components/visual-edit/shadcn/ui/accordion.tsx', `
import { cn } from "@/components/visual-edit/shadcn/utils";

export function Accordion() {
  return <div className={cn("a")} />;
}
`);
                return {
                    ok: true,
                    stdout: '- components/visual-edit/shadcn/ui/accordion.tsx',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, {
                name: 'accordion',
                type: 'registry:ui',
                registry: '@shadcn',
                addCommandArgument: 'accordion',
            }, { runner });

            expect(result.ok).toBe(true);
            const persisted = readFileSync(join(projectRoot, 'components/visual-edit/shadcn/ui/accordion.tsx'), 'utf-8');
            expect(persisted).toContain('from "@/lib/utils"');
            expect(persisted).not.toContain('@/components/visual-edit/shadcn/utils');
            expect(existsSync(join(projectRoot, 'components/visual-edit/shadcn/utils.ts'))).toBe(false);
            expect(persisted).toContain('data-oid=');
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    test('rolls back and reports a conflict when install overwrites existing project files', async () => {
        const projectRoot = mkdtempSync(join(tmpdir(), 've-shadcn-conflict-'));

        try {
            write(projectRoot, 'components.json', JSON.stringify({ $schema: 'https://ui.shadcn.com/schema.json' }));
            write(projectRoot, 'package.json', JSON.stringify({ name: 'demo', version: '0.0.0' }, null, 2));
            const originalButton = write(projectRoot, 'components/ui/Button.tsx', 'export function Button({ onPress, iconLeading }: any) { return <button />; }\n');
            const originalUtils = write(projectRoot, 'lib/utils.ts', 'export function cx(...parts: string[]) { return parts.join(" "); }\n');

            const runner: ShadcnCliRunner = async (cwd) => {
                expect(cwd).not.toBe(projectRoot);
                write(cwd, 'components/ui/Button.tsx', 'export function Button(props: any) { return <button {...props} />; }\n');
                write(cwd, 'lib/utils.ts', 'export function cn(...parts: string[]) { return parts.join(" "); }\n');
                write(cwd, 'components/ui/card.tsx', 'export function Card() { return <div />; }\n');
                write(cwd, 'package.json', JSON.stringify({ name: 'demo', version: '0.0.0', dependencies: { "@radix-ui/react-slot": "^1.2.0" } }, null, 2));
                return {
                    ok: true,
                    stdout: 'Installed button',
                    stderr: '',
                    exitCode: 0,
                };
            };

            const result = await installShadcnRegistryItem(projectRoot, buttonItem, { runner });

            expect(result.ok).toBe(false);
            expect(result.code).toBe('file-conflict');
            expect(result.conflictPaths).toEqual(['components/ui/Button.tsx', 'lib/utils.ts']);
            expect(readFileSync(originalButton, 'utf-8')).toContain('onPress');
            expect(readFileSync(originalUtils, 'utf-8')).toContain('export function cx');
            expect(existsSync(join(projectRoot, 'components/ui/card.tsx'))).toBe(false);
            expect(JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))).toEqual({ name: 'demo', version: '0.0.0' });
        } finally {
            rmSync(projectRoot, { recursive: true, force: true });
        }
    });
});
