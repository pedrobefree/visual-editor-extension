import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runInit } from './init';

async function withProject(fn: (root: string) => Promise<void> | void): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), 'befree-init-'));
    try {
        mkdirSync(root, { recursive: true });
        await fn(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

function writeJson(filePath: string, value: unknown): void {
    writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

describe('runInit', () => {
    test('configures Next.js through webpack loader without creating Babel config', async () => {
        await withProject(async root => {
            writeJson(join(root, 'package.json'), {
                scripts: { dev: 'next dev' },
                dependencies: {
                    next: 'latest',
                    react: 'latest',
                },
            });

            await runInit(root);

            const nextConfig = readFileSync(join(root, 'next.config.mjs'), 'utf-8');
            const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

            expect(existsSync(join(root, '.babelrc'))).toBe(false);
            expect(nextConfig).toContain('befree-visual-edit/next-loader');
            expect(nextConfig).toContain('withBefreeVisualEdit');
            expect(nextConfig).toContain("from 'module'");
            expect(nextConfig).toContain('test: /\\.(tsx|jsx)$/');
            expect(pkg.scripts.bridge).toBe('npx befree-visual-edit bridge');
        });
    });

    test('removes the generated Babel config for Next.js projects', async () => {
        await withProject(async root => {
            writeJson(join(root, 'package.json'), {
                scripts: { dev: 'next dev' },
                dependencies: {
                    next: 'latest',
                    react: 'latest',
                },
            });
            writeJson(join(root, '.babelrc'), {
                presets: ['next/babel'],
                plugins: ['befree-visual-edit/babel'],
            });

            await runInit(root);

            expect(existsSync(join(root, '.babelrc'))).toBe(false);
            expect(readFileSync(join(root, 'next.config.mjs'), 'utf-8')).toContain('befree-visual-edit/next-loader');
        });
    });

    test('wraps existing ESM Next.js config without using global require', async () => {
        await withProject(async root => {
            writeJson(join(root, 'package.json'), {
                scripts: { dev: 'next dev' },
                dependencies: {
                    next: 'latest',
                    react: 'latest',
                },
            });
            writeFileSync(join(root, 'next.config.mjs'), 'const nextConfig = { reactStrictMode: true };\nexport default nextConfig;\n', 'utf-8');

            await runInit(root);

            const nextConfig = readFileSync(join(root, 'next.config.mjs'), 'utf-8');
            expect(nextConfig).toContain("import { createRequire as createBefreeVisualEditRequire } from 'module';");
            expect(nextConfig).toContain('export default withBefreeVisualEdit(nextConfig);');
            expect(nextConfig).toContain('befreeVisualEditRequire.resolve');
        });
    });
});
