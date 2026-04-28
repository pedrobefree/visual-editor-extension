#!/usr/bin/env bun
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');

// Clean dist
try { rmSync(OUT, { recursive: true }); } catch {}
mkdirSync(OUT, { recursive: true });

console.log('[build] Bundling scripts...');

await Bun.build({
    entrypoints: [join(ROOT, 'src/content.ts')],
    outdir: OUT,
    target: 'browser',
    minify: false,
    naming: '[name].js',
});

await Bun.build({
    entrypoints: [join(ROOT, 'src/background.ts')],
    outdir: OUT,
    target: 'browser',
    minify: false,
    naming: '[name].js',
});

await Bun.build({
    entrypoints: [join(ROOT, 'src/popup.ts')],
    outdir: OUT,
    target: 'browser',
    minify: false,
    naming: '[name].js',
});

// Copy static files
copyFileSync(join(ROOT, 'popup.html'), join(OUT, 'popup.html'));
if (existsSync(join(ROOT, 'logo-white.png'))) copyFileSync(join(ROOT, 'logo-white.png'), join(OUT, 'logo-white.png'));
if (existsSync(join(ROOT, '..', '..', 'logo-highlight.png'))) {
    copyFileSync(join(ROOT, '..', '..', 'logo-highlight.png'), join(OUT, 'logo-highlight.png'));
}

// Copy icons exactly from packages/extension/icons.
const iconsDir = join(ROOT, 'icons');
if (existsSync(iconsDir)) {
    cpSync(iconsDir, join(OUT, 'icons'), { recursive: true });
} else {
    console.warn('[build] ⚠️  pasta icons não encontrada em packages/extension/icons/');
}

// Copy manifest exactly as written in packages/extension/manifest.json.
copyFileSync(join(ROOT, 'manifest.json'), join(OUT, 'manifest.json'));

console.log('\n[build] ✅ Extensão buildada em ./dist\n');
console.log('[build] Para carregar no Chrome:');
console.log('  1. Abra chrome://extensions');
console.log('  2. Ative "Modo do desenvolvedor" (canto superior direito)');
console.log('  3. Clique em "Carregar sem compactação"');
console.log('  4. Selecione a pasta: packages/extension/dist\n');
