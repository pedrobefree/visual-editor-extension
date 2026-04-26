#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
    addOidsToAst,
    findNodeByOid,
    getAstFromContent,
    getContentFromAst,
    replaceNodeClasses,
    updateNodeTextContent,
} from '@visual-edit/parser';

const [, , command, ...args] = process.argv;

function readFile(filePath: string): string {
    return readFileSync(resolve(filePath), 'utf-8');
}

function writeFile(filePath: string, content: string): void {
    writeFileSync(resolve(filePath), content, 'utf-8');
}

function printUsage(): void {
    console.log(`
visual-edit — Fase 0 CLI

Comandos:
  inject-oids <file>                Injeta data-oid em todos os elementos JSX do arquivo
  edit-text   <file> <oid> <text>   Substitui o texto do elemento com o oid dado
  edit-class  <file> <oid> <class>  Substitui o className do elemento com o oid dado
  list-oids   <file>                Lista todos os data-oid encontrados no arquivo
`);
}

function cmdInjectOids(filePath: string): void {
    const content = readFile(filePath);
    const ast = getAstFromContent(content);
    if (!ast) {
        console.error('Erro: não foi possível parsear o arquivo.');
        process.exit(1);
    }
    const { modified } = addOidsToAst(ast);
    if (!modified) {
        console.log('Nenhuma alteração necessária — OIDs já presentes.');
        return;
    }
    const newContent = getContentFromAst(ast, content);
    writeFile(filePath, newContent);
    console.log(`OIDs injetados em: ${filePath}`);
}

function cmdEditText(filePath: string, oid: string, newText: string): void {
    const content = readFile(filePath);
    const ast = getAstFromContent(content);
    if (!ast) {
        console.error('Erro: não foi possível parsear o arquivo.');
        process.exit(1);
    }
    const node = findNodeByOid(ast, oid);
    if (!node) {
        console.error(`OID não encontrado: ${oid}`);
        process.exit(1);
    }
    updateNodeTextContent(node, newText);
    const newContent = getContentFromAst(ast, content);
    writeFile(filePath, newContent);
    console.log(`Texto atualizado (oid=${oid}): "${newText}"`);
}

function cmdEditClass(filePath: string, oid: string, className: string): void {
    const content = readFile(filePath);
    const ast = getAstFromContent(content);
    if (!ast) {
        console.error('Erro: não foi possível parsear o arquivo.');
        process.exit(1);
    }
    const node = findNodeByOid(ast, oid);
    if (!node) {
        console.error(`OID não encontrado: ${oid}`);
        process.exit(1);
    }
    replaceNodeClasses(node, className);
    const newContent = getContentFromAst(ast, content);
    writeFile(filePath, newContent);
    console.log(`Classes atualizadas (oid=${oid}): "${className}"`);
}

function cmdListOids(filePath: string): void {
    const content = readFile(filePath);
    const lines = content.split('\n');
    const oidRegex = /data-oid="([^"]+)"/g;
    const found: { oid: string; line: number; preview: string }[] = [];

    lines.forEach((line, i) => {
        let match;
        while ((match = oidRegex.exec(line)) !== null) {
            found.push({ oid: match[1]!, line: i + 1, preview: line.trim() });
        }
    });

    if (found.length === 0) {
        console.log('Nenhum data-oid encontrado. Execute inject-oids primeiro.');
        return;
    }

    console.log(`\n${found.length} OID(s) encontrado(s) em ${filePath}:\n`);
    for (const { oid, line, preview } of found) {
        console.log(`  [linha ${String(line).padStart(3)}] ${oid}`);
        console.log(`           ${preview.slice(0, 80)}`);
    }
    console.log('');
}

switch (command) {
    case 'inject-oids':
        if (!args[0]) { printUsage(); process.exit(1); }
        cmdInjectOids(args[0]);
        break;
    case 'edit-text':
        if (!args[0] || !args[1] || !args[2]) { printUsage(); process.exit(1); }
        cmdEditText(args[0], args[1], args.slice(2).join(' '));
        break;
    case 'edit-class':
        if (!args[0] || !args[1] || !args[2]) { printUsage(); process.exit(1); }
        cmdEditClass(args[0], args[1], args.slice(2).join(' '));
        break;
    case 'list-oids':
        if (!args[0]) { printUsage(); process.exit(1); }
        cmdListOids(args[0]);
        break;
    default:
        printUsage();
}
