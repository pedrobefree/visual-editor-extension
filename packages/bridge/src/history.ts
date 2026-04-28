import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getSourceFiles } from './scanner';

const MAX_HISTORY_ENTRIES = 50;

type Snapshot = Map<string, string>;

interface FileSnapshot {
    filePath: string;
    content: string | null;
}

interface HistoryEntry {
    label: string;
    files: FileSnapshot[];
}

const historyByProject = new Map<string, HistoryEntry[]>();

export function captureProjectSnapshot(projectRoot: string): Snapshot {
    const snapshot: Snapshot = new Map();
    for (const filePath of getSourceFiles(projectRoot)) {
        try {
            snapshot.set(filePath, readFileSync(filePath, 'utf-8'));
        } catch {
            // Ignore files that disappear while the dev server is rebuilding.
        }
    }
    return snapshot;
}

export function pushUndoEntry(projectRoot: string, label: string, before: Snapshot): number {
    const after = captureProjectSnapshot(projectRoot);
    const paths = new Set([...before.keys(), ...after.keys()]);
    const files: FileSnapshot[] = [];

    for (const filePath of paths) {
        const previous = before.get(filePath);
        const current = after.get(filePath);
        if (previous === current) continue;
        files.push({ filePath, content: previous ?? null });
    }

    if (!files.length) return getUndoCount(projectRoot);

    const stack = historyByProject.get(projectRoot) ?? [];
    stack.push({ label, files });
    if (stack.length > MAX_HISTORY_ENTRIES) stack.splice(0, stack.length - MAX_HISTORY_ENTRIES);
    historyByProject.set(projectRoot, stack);
    return stack.length;
}

export function undoLastEntry(projectRoot: string): { ok: boolean; empty?: boolean; label?: string; changed?: number; error?: string } {
    const stack = historyByProject.get(projectRoot) ?? [];
    const entry = stack.pop();
    if (!entry) return { ok: false, empty: true, error: 'Nothing to undo' };

    try {
        for (const file of entry.files) {
            if (file.content === null) {
                if (existsSync(file.filePath)) unlinkSync(file.filePath);
                continue;
            }
            mkdirSync(dirname(file.filePath), { recursive: true });
            writeFileSync(file.filePath, file.content, 'utf-8');
        }
        return { ok: true, label: entry.label, changed: entry.files.length };
    } catch (error) {
        stack.push(entry);
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Undo failed',
        };
    }
}

export function getUndoCount(projectRoot: string): number {
    return historyByProject.get(projectRoot)?.length ?? 0;
}
