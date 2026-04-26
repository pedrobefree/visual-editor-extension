#!/usr/bin/env bun
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const projectRoot = resolve(process.argv[2] ?? process.cwd());

console.log('\n╔════════════════════════════════════════╗');
console.log('║   Visual Edit — Configuração inicial   ║');
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
    console.error('❌ Visual Edit requer um projeto React (react não encontrado em package.json).');
    process.exit(1);
}

console.log(`📦 Projeto detectado: ${isNext ? 'Next.js' : isVite ? 'Vite + React' : 'React (genérico)'}`);

// ── 2. Vite project: add plugin ─────────────────────────────────────────────
if (isVite) {
    const viteConfigs = ['vite.config.ts', 'vite.config.js', 'vite.config.mts'];
    const configFile = viteConfigs.map(f => join(projectRoot, f)).find(existsSync);

    if (!configFile) {
        console.warn('⚠️  Não encontrei vite.config.ts. Crie manualmente conforme o README.');
    } else {
        let config = readFileSync(configFile, 'utf-8');

        if (config.includes('@visual-edit/setup')) {
            console.log('✅ vite.config já tem o plugin. Pulando.');
        } else {
            // Add import
            config = `import { visualEditPlugin } from '@visual-edit/setup/vite';\n` + config;
            // Add to plugins array: find plugins: [ and insert after [
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
        console.log('   { "plugins": ["@visual-edit/setup/babel"] }');
    } else {
        const babelConfig = {
            presets: ['next/babel'],
            plugins: ['@visual-edit/setup/babel'],
        };
        writeFileSync(babelRcPath, JSON.stringify(babelConfig, null, 2) + '\n', 'utf-8');
        console.log('✅ .babelrc criado (desativa SWC — esperado para desenvolvimento).');
    }
}

// ── 4. Add bridge script to package.json ────────────────────────────────────
const devScript = 'npx @visual-edit/bridge';
if (pkg.scripts?.['visual-edit']) {
    console.log('✅ Script visual-edit já existe no package.json.');
} else {
    pkg.scripts = pkg.scripts ?? {};
    pkg.scripts['visual-edit'] = devScript;

    // Add dev:edit that runs bridge + original dev concurrently
    const originalDev = pkg.scripts.dev ?? 'vite';
    pkg.scripts['dev:edit'] = `${devScript} & ${originalDev}`;

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log('✅ Scripts adicionados:');
    console.log('   npm run visual-edit  — só o bridge');
    console.log('   npm run dev:edit     — bridge + dev server juntos');
}

// ── 5. Print next steps ──────────────────────────────────────────────────────
console.log(`
╔════════════════════════════════════════════════════════════╗
║  Próximos passos                                           ║
╠════════════════════════════════════════════════════════════╣
║  1. Instale as dependências:                               ║
║     npm install @visual-edit/setup @visual-edit/bridge     ║
║                                                            ║
║  2. Inicie o projeto com o bridge:                         ║
║     npm run dev:edit                                       ║
║                                                            ║
║  3. Instale a extensão Chrome:                             ║
║     - Abra chrome://extensions                             ║
║     - Ative "Modo do desenvolvedor"                        ║
║     - Clique "Carregar sem compactação"                     ║
║     - Selecione: visual-edit-kit/packages/extension/dist   ║
║                                                            ║
║  4. Abra seu app em localhost, ative a extensão e edite!   ║
╚════════════════════════════════════════════════════════════╝
`);
