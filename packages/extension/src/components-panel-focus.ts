export interface FocusSnapshot {
    id: string;
    selectionStart: number | null;
    selectionEnd: number | null;
}

type FocusableFieldLike = {
    id?: string;
    selectionStart?: number | null;
    selectionEnd?: number | null;
    tagName?: string;
};

function isFocusableFieldLike(value: unknown): value is FocusableFieldLike {
    if (!value || typeof value !== 'object') return false;
    const tagName = 'tagName' in value && typeof value.tagName === 'string' ? value.tagName.toUpperCase() : '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA';
}

export function captureFocusSnapshot(activeElement: unknown): FocusSnapshot | null {
    if (!isFocusableFieldLike(activeElement)) return null;
    if (!activeElement.id) return null;
    return {
        id: activeElement.id,
        selectionStart: activeElement.selectionStart ?? null,
        selectionEnd: activeElement.selectionEnd ?? null,
    };
}

export function shouldAutofocusProjectSearch(showCreateForm: boolean, createMode: 'preset' | 'page' | 'shadcn'): boolean {
    return !(showCreateForm && createMode === 'shadcn');
}
