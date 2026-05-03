import { describe, expect, test } from 'bun:test';
import { resolveShadcnInstallErrorMessage, resolveShadcnListErrorMessage } from './shadcn-errors';

describe('resolveShadcnListErrorMessage', () => {
    const messages = {
        componentsShadcnInitRequired: 'init required',
        componentsShadcnError: 'generic error',
        componentsShadcnConflictError: 'conflict: {files}',
        componentsShadcnProjectConfigRequired: 'project config required',
    };
    const translate = (key: string) => messages[key as keyof typeof messages] ?? key;

    test('maps missing components config to init guidance', () => {
        const message = resolveShadcnListErrorMessage({
            code: 'missing-components-config',
            error: 'raw backend error',
        }, translate);

        expect(message).toBe('init required');
    });

    test('falls back to backend error for other failures', () => {
        const message = resolveShadcnListErrorMessage({
            code: 'cli-failed',
            error: 'network timeout',
        }, translate);

        expect(message).toBe('network timeout');
    });

    test('uses project config guidance when inference fails', () => {
        const message = resolveShadcnListErrorMessage({
            code: 'missing-project-config',
            error: 'No Tailwind CSS entry file was detected',
        }, translate);

        expect(message).toBe('No Tailwind CSS entry file was detected');
    });

    test('falls back to generic message when no backend error exists', () => {
        const message = resolveShadcnListErrorMessage({}, translate);

        expect(message).toBe('generic error');
    });
});

describe('resolveShadcnInstallErrorMessage', () => {
    const messages = {
        componentsShadcnInitRequired: 'init required',
        componentsShadcnInstallError: 'install error',
        componentsShadcnConflictError: 'conflict: {files}',
        componentsShadcnProjectConfigRequired: 'project config required',
    };
    const translate = (key: string, params?: Record<string, string>) => {
        const template = messages[key as keyof typeof messages] ?? key;
        return template.replace(/\{(\w+)\}/g, (_, token: string) => params?.[token] ?? `{${token}}`);
    };

    test('maps file conflicts to a readable list of overwritten files', () => {
        const message = resolveShadcnInstallErrorMessage({
            code: 'file-conflict',
            conflictPaths: ['components/ui/Button.tsx', 'lib/utils.ts'],
        }, translate);

        expect(message).toBe('conflict: components/ui/Button.tsx, lib/utils.ts');
    });

    test('maps missing config to init guidance', () => {
        const message = resolveShadcnInstallErrorMessage({
            code: 'missing-components-config',
        }, translate);

        expect(message).toBe('init required');
    });

    test('uses project config guidance when inference fails', () => {
        const message = resolveShadcnInstallErrorMessage({
            code: 'missing-project-config',
        }, translate);

        expect(message).toBe('project config required');
    });

    test('falls back to backend error or generic install message', () => {
        expect(resolveShadcnInstallErrorMessage({
            code: 'cli-failed',
            error: 'network timeout',
        }, translate)).toBe('network timeout');

        expect(resolveShadcnInstallErrorMessage({}, translate)).toBe('install error');
    });
});
