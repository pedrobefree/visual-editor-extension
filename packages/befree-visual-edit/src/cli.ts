#!/usr/bin/env node
import { resolve } from 'path';

const [,, command, ...args] = process.argv;

async function main(): Promise<void> {
    if (command === 'bridge') {
        const { startServer } = await import('@visual-edit/bridge/server');
        const projectRoot = resolve(args[0] ?? process.cwd());
        console.log(`\n[befree-visual-edit] Iniciando bridge para: ${projectRoot}\n`);
        startServer(projectRoot);
        return;
    }

    if (!command || command === 'init') {
        const { runInit } = await import('@visual-edit/setup/init');
        await runInit(args[0]);
        return;
    }

    console.error(`Comando desconhecido: ${command}`);
    console.log('Uso: befree-visual-edit [init|bridge] [path]');
    process.exit(1);
}

main();
