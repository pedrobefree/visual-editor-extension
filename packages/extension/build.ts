#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

const OUT = './dist';

// Clean dist
try { rmSync(OUT, { recursive: true }); } catch {}
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/icons`, { recursive: true });

console.log('[build] Bundling scripts...');

await Bun.build({
    entrypoints: ['./src/content.ts'],
    outdir: OUT,
    target: 'browser',
    minify: false,
    naming: '[name].js',
});

await Bun.build({
    entrypoints: ['./src/background.ts'],
    outdir: OUT,
    target: 'browser',
    minify: false,
    naming: '[name].js',
});

await Bun.build({
    entrypoints: ['./src/popup.ts'],
    outdir: OUT,
    target: 'browser',
    minify: false,
    naming: '[name].js',
});

// Copy static files
copyFileSync('./popup.html', `${OUT}/popup.html`);
if (existsSync('./logo-white.png')) copyFileSync('./logo-white.png', `${OUT}/logo-white.png`);

// Copy PNG icons from source
for (const size of [16, 48, 128]) {
    const src = `./icons/icon${size}.png`;
    if (existsSync(src)) {
        copyFileSync(src, `${OUT}/icons/icon${size}.png`);
    } else {
        console.warn(`[build] ⚠️  icons/icon${size}.png não encontrado em packages/extension/icons/`);
    }
}

// Copy manifest as-is
const manifest = JSON.parse(await Bun.file('./manifest.json').text());
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

console.log('\n[build] ✅ Extensão buildada em ./dist\n');
console.log('[build] Para carregar no Chrome:');
console.log('  1. Abra chrome://extensions');
console.log('  2. Ative "Modo do desenvolvedor" (canto superior direito)');
console.log('  3. Clique em "Carregar sem compactação"');
console.log('  4. Selecione a pasta: packages/extension/dist\n');
