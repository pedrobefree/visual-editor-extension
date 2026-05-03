export interface ShadcnErrorResponse {
    code?: string;
    error?: string;
    conflictPaths?: string[];
}

type Translate = (key: string, params?: Record<string, string>) => string;

export function resolveShadcnListErrorMessage(
    data: ShadcnErrorResponse,
    translate: Translate,
): string {
    if (data.code === 'missing-components-config') {
        return translate('componentsShadcnInitRequired');
    }

    if (data.code === 'missing-project-config') {
        return data.error || translate('componentsShadcnProjectConfigRequired');
    }

    return data.error || translate('componentsShadcnError');
}

export function resolveShadcnInstallErrorMessage(
    data: ShadcnErrorResponse,
    translate: Translate,
): string {
    if (data.code === 'missing-components-config') {
        return translate('componentsShadcnInitRequired');
    }

    if (data.code === 'missing-project-config') {
        return data.error || translate('componentsShadcnProjectConfigRequired');
    }

    if (data.code === 'file-conflict' && data.conflictPaths?.length) {
        return translate('componentsShadcnConflictError', {
            files: data.conflictPaths.join(', '),
        });
    }

    return data.error || translate('componentsShadcnInstallError');
}
