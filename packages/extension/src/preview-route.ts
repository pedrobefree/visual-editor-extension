const COMPONENT_PREVIEW_PATH_PREFIX = '/visual-edit-kit-component-preview/';

export function isComponentPreviewPath(pathname: string): boolean {
    return pathname.startsWith(COMPONENT_PREVIEW_PATH_PREFIX);
}

export function shouldInterceptEditorClick(pathname: string, hasOidTarget: boolean): boolean {
    if (isComponentPreviewPath(pathname) && !hasOidTarget) return false;
    return true;
}
