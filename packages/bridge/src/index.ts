#!/usr/bin/env bun
import { resolve } from 'path';
import { startServer } from './server';

const projectRoot = resolve(process.argv[2] ?? process.cwd());

console.log(`\n[visual-edit] Iniciando bridge para: ${projectRoot}\n`);
startServer(projectRoot);
