#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

export async function runInit(targetPath?: string): Promise<void> {
    const projectRoot = resolve(targetPath ?? process.argv[2] ?? process.cwd());

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

    // ── 3. Next.js project: add .babelrc ────────────────────────────────────────
    if (isNext) {
        const babelRcPath = join(projectRoot, '.babelrc');
        if (existsSync(babelRcPath)) {
            console.log('⚠️  .babelrc já existe. Adicione manualmente:');
            console.log('   { "plugins": ["befree-visual-edit/babel"] }');
        } else {
            const babelConfig = {
                presets: ['next/babel'],
                plugins: ['befree-visual-edit/babel'],
            };
            writeFileSync(babelRcPath, JSON.stringify(babelConfig, null, 2) + '\n', 'utf-8');
            console.log('✅ .babelrc criado (desativa SWC — esperado para desenvolvimento).');
        }
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
if (import.meta.main) runInit();
