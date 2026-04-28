#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, join } from 'path';

const NEXT_WEBPACK_MARKER = 'befree-visual-edit/next-loader';

function generatedBabelConfig(content: string): boolean {
    try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed.presets) &&
            parsed.presets.includes('next/babel') &&
            Array.isArray(parsed.plugins) &&
            parsed.plugins.includes('befree-visual-edit/babel') &&
            parsed.plugins.length === 1;
    } catch {
        return false;
    }
}

function removeGeneratedBabelConfig(projectRoot: string): void {
    for (const fileName of ['.babelrc', 'babel.config.json']) {
        const filePath = join(projectRoot, fileName);
        if (!existsSync(filePath)) continue;

        const content = readFileSync(filePath, 'utf-8');
        if (generatedBabelConfig(content)) {
            unlinkSync(filePath);
            console.log(`✅ ${fileName} removido para manter SWC/next/font funcionando.`);
        } else if (content.includes('befree-visual-edit/babel')) {
            console.warn(`⚠️  ${fileName} ainda usa befree-visual-edit/babel. Remova essa config para evitar conflito com next/font.`);
        }
    }
}

function nextWebpackWrapper(format: 'cjs' | 'esm'): string {
    const resolver = format === 'esm'
        ? `import { createRequire as createBefreeVisualEditRequire } from 'module';
const befreeVisualEditRequire = createBefreeVisualEditRequire(import.meta.url);

`
        : `const befreeVisualEditRequire = require;

`;

    return `${resolver}const withBefreeVisualEdit = (nextConfig = {}) => ({
  ...nextConfig,
  webpack(config, options) {
    config.module.rules.push({
      test: /\\.(tsx|jsx)$/,
      exclude: /node_modules/,
      use: [befreeVisualEditRequire.resolve('befree-visual-edit/next-loader')],
    });

    if (typeof nextConfig.webpack === 'function') {
      return nextConfig.webpack(config, options);
    }

    return config;
  },
});

`;
}

function wrapNextConfigExport(config: string, format: 'cjs' | 'esm'): string | null {
    if (config.includes(NEXT_WEBPACK_MARKER)) return config;
    const withWrapper = nextWebpackWrapper(format) + config;

    if (/export\s+default\s+nextConfig\s*;?/.test(config)) {
        return withWrapper.replace(/export\s+default\s+nextConfig\s*;?/, 'export default withBefreeVisualEdit(nextConfig);');
    }

    if (/module\.exports\s*=\s*nextConfig\s*;?/.test(config)) {
        return withWrapper.replace(/module\.exports\s*=\s*nextConfig\s*;?/, 'module.exports = withBefreeVisualEdit(nextConfig);');
    }

    if (/module\.exports\s*=\s*\{/.test(config)) {
        return withWrapper.replace(/module\.exports\s*=\s*/, 'module.exports = withBefreeVisualEdit(').trimEnd() + ');\n';
    }

    return null;
}

function ensureNextConfig(projectRoot: string): void {
    const candidates = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
    const configFile = candidates.map(fileName => join(projectRoot, fileName)).find(existsSync);

    if (!configFile) {
        const configPath = join(projectRoot, 'next.config.mjs');
        writeFileSync(configPath, `${nextWebpackWrapper('esm')}export default withBefreeVisualEdit({});\n`, 'utf-8');
        console.log(`✅ next.config.mjs criado com integração befree-visual-edit sem Babel.`);
        return;
    }

    const config = readFileSync(configFile, 'utf-8');
    const format = configFile.endsWith('.mjs') ||
        configFile.endsWith('.ts') ||
        /\bexport\s+default\b/.test(config) ||
        /\bimport\s+/.test(config)
        ? 'esm'
        : 'cjs';
    const nextConfig = wrapNextConfigExport(config, format);
    if (!nextConfig) {
        console.warn(`⚠️  Não consegui atualizar ${configFile} automaticamente.`);
        console.warn(`   Adicione o wrapper com ${NEXT_WEBPACK_MARKER} manualmente.`);
        return;
    }

    if (nextConfig === config) {
        console.log('✅ next.config já tem integração befree-visual-edit. Pulando.');
        return;
    }

    writeFileSync(configFile, nextConfig, 'utf-8');
    console.log(`✅ Integração Next.js adicionada em ${configFile} sem desativar SWC.`);
}

export async function runInit(targetPath?: string): Promise<void> {
    const projectRoot = resolve(targetPath ?? process.cwd());

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  befree-visual-edit — Setup inicial    ║');
    console.log('╚════════════════════════════════════════╝\n');

    // ── 1. Detect project type ──────────────────────────────────────────────────
    const pkgPath = join(projectRoot, 'package.json');
    if (!existsSync(pkgPath)) {
        console.error('❌ Não encontrei package.json em:', projectRoot);
        process.exit(1);
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const isNext = Boolean(deps.next);
    const isVite = Boolean(deps.vite);
    const hasReact = Boolean(deps.react);

    if (!hasReact) {
        console.error('❌ befree-visual-edit requer um projeto React (react não encontrado em package.json).');
        process.exit(1);
    }

    console.log(`📦 Projeto detectado: ${isNext ? 'Next.js' : isVite ? 'Vite + React' : 'React (genérico)'}`);

    // ── 2. Vite project: add plugin ─────────────────────────────────────────────
    if (isVite) {
        const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mts'];
        const configFile = viteConfigs.map(f => join(projectRoot, f)).find(existsSync);

        if (!configFile) {
            console.warn('⚠️  Não encontrei vite.config.ts. Adicione manualmente:');
            console.warn('   import { visualEditPlugin } from "befree-visual-edit/vite"');
        } else {
            let config = readFileSync(configFile, 'utf-8');

            if (config.includes('befree-visual-edit') || config.includes('@visual-edit/setup')) {
                console.log('✅ vite.config já tem o plugin. Pulando.');
            } else {
                config = `import { visualEditPlugin } from 'befree-visual-edit/vite';\n` + config;
                config = config.replace(
                    /plugins\s*:\s*\[/,
                    'plugins: [\n    visualEditPlugin(),'
                );
                writeFileSync(configFile, config, 'utf-8');
                console.log(`✅ Plugin adicionado em ${configFile}`);
            }
        }
    }

    // ── 3. Next.js project: add webpack loader without disabling SWC ─────────────
    if (isNext) {
        removeGeneratedBabelConfig(projectRoot);
        ensureNextConfig(projectRoot);
    }

    // ── 4. Add bridge to dev scripts in package.json ─────────────────────────────
    const bridgeCmd = 'npx befree-visual-edit bridge';
    if (pkg.scripts?.['bridge']?.includes('befree-visual-edit')) {
        console.log('✅ Bridge já integrado ao package.json. Pulando.');
    } else {
        pkg.scripts = pkg.scripts ?? {};
        const originalDev = pkg.scripts.dev ?? 'vite';

        pkg.scripts['dev'] = `${bridgeCmd} & ${originalDev}`;
        pkg.scripts['dev:edit'] = `${bridgeCmd} & ${originalDev}`;
        pkg.scripts['bridge'] = bridgeCmd;

        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        console.log('✅ Scripts configurados:');
        console.log('   npm run dev      — bridge + dev server (uso diário)');
        console.log('   npm run dev:edit — mesmo que dev (alternativa)');
        console.log('   npm run bridge   — só o bridge');
    }

    // ── 5. Print next steps ──────────────────────────────────────────────────────
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Tudo pronto!                                                ║
╠══════════════════════════════════════════════════════════════╣
║  1. Inicie seu projeto:                                      ║
║     npm run dev                                              ║
║     (a bridge sobe automaticamente junto)                    ║
║                                                              ║
║  2. Instale a extensão Chrome:                               ║
║     https://chromewebstore.google.com (busque befree)        ║
║                                                              ║
║  3. Abra seu app em localhost, ative a extensão e edite!     ║
╚══════════════════════════════════════════════════════════════╝
`);
}

// Run directly when invoked as script (bun run init.ts)
if (import.meta.main) runInit(process.argv[2]);
