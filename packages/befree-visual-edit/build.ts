#!/usr/bin/env bun
import { rmSync, mkdirSync, chmodSync } from 'fs';

const OUT = './dist';
try { rmSync(OUT, { recursive: true }); } catch {}
mkdirSync(OUT, { recursive: true });

console.log('[build] Bundling befree-visual-edit...');

// CLI — bundle everything for Node.js (no external deps needed at runtime)
await Bun.build({
    entrypoints: ['./src/cli.ts'],
    outdir: OUT,
    target: 'node',
    naming: '[name].js',
});

// Make CLI executable
chmodSync(`${OUT}/cli.js`, 0o755);

// Vite plugin — keep vite external (it's a peerDep in user's project)
await Bun.build({
    entrypoints: ['./src/vite.ts'],
    outdir: OUT,
    target: 'node',
    naming: '[name].js',
    external: ['vite'],
});

// Babel plugin — @babel/types is provided by the host babel runtime
await Bun.build({
    entrypoints: ['./src/babel.ts'],
    outdir: OUT,
    target: 'node',
    naming: '[name].js',
    external: ['@babel/types'],
});

// Next.js webpack loader — keeps SWC enabled by avoiding a custom Babel config
await Bun.build({
    entrypoints: ['./src/next-loader.ts'],
    outdir: OUT,
    target: 'node',
    naming: '[name].js',
});

console.log('[build] ✅ befree-visual-edit built to ./dist');
