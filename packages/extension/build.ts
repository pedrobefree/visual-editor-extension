#!/usr/bin/env bun
import { copyFileSync, mkdirSync, writeFileSync, rmSync } from 'fs';

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

// ── Gerar manifest sem referência a ícones (dev mode) ──
// Chrome exige PNG real — para dev, omitimos os ícones (usa padrão cinza).
// Para produção: converta os SVGs abaixo com sharp/imagemagick e adicione de volta.
const manifest = JSON.parse(await Bun.file('./manifest.json').text());
delete manifest.action.default_icon;         // remove icon refs
delete manifest.web_accessible_resources;    // não precisamos por ora
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

// ── Salvar ícones como SVG (para referência/produção) ──
const iconSvg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <text x="${size / 2}" y="${size * 0.68}" text-anchor="middle" font-family="system-ui" font-size="${Math.round(size * 0.55)}" fill="white">✏</text>
</svg>`;

for (const size of [16, 48, 128]) {
    writeFileSync(`${OUT}/icons/icon${size}.svg`, iconSvg(size));
}

console.log('\n[build] ✅ Extensão buildada em ./dist\n');
console.log('[build] Para carregar no Chrome:');
console.log('  1. Abra chrome://extensions');
console.log('  2. Ative "Modo do desenvolvedor" (canto superior direito)');
console.log('  3. Clique em "Carregar sem compactação"');
console.log('  4. Selecione a pasta: packages/extension/dist\n');
