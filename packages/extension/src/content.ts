import { VisualEditPanel, type EditResponse } from './panel';
import { VisualEditToolbar } from './toolbar';
import { LayerPanel } from './layer-panel';
import { ThemePanel } from './theme-panel';
import { ComponentsPanel, type PreviewErrorPayload } from './components-panel';
import { AssetsPanel, type AssetInfo } from './assets-panel';
import { loadLanguage, t } from './i18n';
import { isComponentPreviewPath, shouldInterceptEditorClick } from './preview-route';

const BRIDGE = 'http://localhost:5179';
const OID_ATTR = 'data-oid';
const PREVIEW_DEPS_MODAL_ID = 've-preview-deps-modal';
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav', 'form', 'ul', 'ol', 'li', 'figure', 'figcaption', 'fieldset', 'table', 'thead', 'tbody', 'tfoot', 'tr']);
const NON_CONTAINER_TAGS = new Set(['button', 'a', 'p', 'span', 'label', 'strong', 'em', 'b', 'i', 'u', 'small', 'input', 'textarea', 'select', 'option', 'img', 'svg', 'path', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

interface OidEntry {
    oid: string;
    file: string;
    line: number;
    col: number;
}

interface ComponentInfo {
    name: string;
    relPath: string;
    filePath: string;
    exports: string[];
}

interface InsertElementSpec {
    tagName: string;
    attributes?: Record<string, string | number | boolean | null | undefined>;
    textContent?: string | null;
    children?: InsertElementSpec[];
}

let enabled = false;
let selectedEl: HTMLElement | null = null;
let selectedOid = '';
let panel: VisualEditPanel | null = null;
let overlay: HTMLElement | null = null;
let toolbar: VisualEditToolbar | null = null;
let layerPanel: LayerPanel | null = null;
let themePanel: ThemePanel | null = null;
let componentsPanel: ComponentsPanel | null = null;
let assetsPanel: AssetsPanel | null = null;
let outlineStyle: HTMLStyleElement | null = null;
let hoverEl: HTMLElement | null = null;
let hoverOverlay: HTMLElement | null = null;
let componentOverlays: HTMLElement[] = [];
let overlayFrame = 0;
let responsiveStyle: HTMLStyleElement | null = null;
let responsivePrefix = '';
let componentRootOids = new Set<string>();
let oidFileByOid = new Map<string, string>();
let copyStyleTargetOid: string | null = null;
let previewDepsModalEl: HTMLElement | null = null;

function closeAssetsPanel(): void {
    assetsPanel?.destroy();
    assetsPanel = null;
    toolbar?.setAssetsActive(false);
}

function openAssetsPanel(): void {
    if (assetsPanel) {
        toolbar?.setAssetsActive(true);
        return;
    }
    assetsPanel = new AssetsPanel({
        onUseAsset: (asset) => { void applyAssetToSelection(asset); },
        onClose: () => closeAssetsPanel(),
    });
    toolbar?.setAssetsActive(true);
}

/* ── Overlay ── */
function getOrCreateOverlay(): HTMLElement {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483646',
        border: '2px solid #6366f1',
        borderRadius: '3px',
        background: 'rgba(99,102,241,.08)',
        transition: 'all .08s ease',
        boxSizing: 'border-box',
    });
    document.body.appendChild(overlay);
    return overlay;
}

function moveOverlay(el: HTMLElement): void {
    const ov = getOrCreateOverlay();
    const r = el.getBoundingClientRect();
    Object.assign(ov.style, {
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        display: 'block',
    });
}

function hideOverlay(): void {
    if (overlay) overlay.style.display = 'none';
}

function getOrCreateHoverOverlay(): HTMLElement {
    if (hoverOverlay) return hoverOverlay;
    hoverOverlay = document.createElement('div');
    Object.assign(hoverOverlay.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483644',
        border: '1px dashed rgba(20,184,166,.8)',
        borderRadius: '3px',
        background: 'rgba(20,184,166,.06)',
        boxSizing: 'border-box',
        transition: 'all .06s ease',
        display: 'none',
    });
    document.body.appendChild(hoverOverlay);
    return hoverOverlay;
}

function moveHoverOverlay(el: HTMLElement): void {
    const ov = getOrCreateHoverOverlay();
    const r = el.getBoundingClientRect();
    Object.assign(ov.style, {
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        display: 'block',
    });
}

function hideHoverOverlay(): void {
    hoverEl = null;
    if (hoverOverlay) hoverOverlay.style.display = 'none';
}

function updateActiveOverlays(): void {
    overlayFrame = 0;
    if ((!selectedEl || !selectedEl.isConnected) && selectedOid) {
        const next = document.querySelector<HTMLElement>(oidSelector(selectedOid));
        if (next) selectedEl = next;
    }
    if (selectedEl?.isConnected) {
        moveOverlay(selectedEl);
    } else if (selectedOid) {
        hideOverlay();
    } else if (selectedEl) {
        deselect();
    }

    if (hoverEl?.isConnected) {
        moveHoverOverlay(hoverEl);
    } else if (hoverEl) {
        hideHoverOverlay();
    }

    for (const marker of componentOverlays) {
        const anchor = (marker as HTMLElement & { __veAnchor?: HTMLElement }).__veAnchor;
        if (!anchor?.isConnected) {
            marker.style.display = 'none';
            continue;
        }
        const r = anchor.getBoundingClientRect();
        Object.assign(marker.style, {
            top: `${r.top}px`,
            left: `${r.left}px`,
            width: `${r.width}px`,
            height: `${r.height}px`,
            display: 'block',
        });
    }
}

function scheduleOverlayUpdate(): void {
    if (!enabled || overlayFrame) return;
    overlayFrame = requestAnimationFrame(updateActiveOverlays);
}

function clearComponentOverlays(): void {
    componentOverlays.forEach(el => el.remove());
    componentOverlays = [];
}

function showTreeHover(el: HTMLElement | null): void {
    hoverEl = el;
    if (el) moveHoverOverlay(el);
    else hideHoverOverlay();
}

function setResponsivePreview(prefix: string, width: number | null): void {
    responsivePrefix = prefix;
    panel?.setResponsivePrefix(prefix);
    if (prefix) document.documentElement.setAttribute('data-ve-responsive-prefix', prefix);
    else document.documentElement.removeAttribute('data-ve-responsive-prefix');

    if (!responsiveStyle) {
        responsiveStyle = document.createElement('style');
        responsiveStyle.id = 've-responsive-preview';
        document.head.appendChild(responsiveStyle);
    }

    if (!width) {
        document.documentElement.removeAttribute('data-ve-responsive-preview');
        responsiveStyle.textContent = '';
        scheduleOverlayUpdate();
        return;
    }

    document.documentElement.setAttribute('data-ve-responsive-preview', String(width));
    responsiveStyle.textContent = `
      html[data-ve-responsive-preview] body {
        width: ${width}px !important;
        max-width: ${width}px !important;
        min-height: 100vh !important;
        margin-left: auto !important;
        margin-right: auto !important;
        box-shadow: 0 0 0 1px rgba(99,102,241,.28), 0 24px 80px rgba(0,0,0,.18) !important;
      }
      html[data-ve-responsive-preview] {
        background: #f6f6f7 !important;
      }
    `;
    scheduleOverlayUpdate();
}

function showComponentOverlays(elements: HTMLElement[]): void {
    clearComponentOverlays();
    componentOverlays = elements.map((el, index) => {
        const marker = document.createElement('div') as HTMLElement & { __veAnchor?: HTMLElement };
        marker.__veAnchor = el;
        Object.assign(marker.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '2147483645',
            border: '2px solid #14b8a6',
            borderRadius: '3px',
            background: 'rgba(20,184,166,.10)',
            boxSizing: 'border-box',
            transition: 'all .08s ease',
        });
        if (index === 0) {
            marker.style.borderColor = '#6366f1';
            marker.style.background = 'rgba(99,102,241,.10)';
        }
        document.body.appendChild(marker);
        return marker;
    });
    updateActiveOverlays();
}

function elementsForOids(oids: string[]): HTMLElement[] {
    const seen = new Set<HTMLElement>();
    const elements: HTMLElement[] = [];
    for (const oid of oids) {
        document.querySelectorAll<HTMLElement>(`[${OID_ATTR}="${oid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).forEach(el => {
            if (!seen.has(el)) {
                seen.add(el);
                elements.push(el);
            }
        });
    }
    const set = new Set(elements);
    return elements.filter(el => {
        let parent = el.parentElement;
        while (parent) {
            if (set.has(parent)) return false;
            parent = parent.parentElement;
        }
        return true;
    });
}

/* ── Element outline toggle ── */
function setOutline(active: boolean): void {
    if (active) {
        if (!outlineStyle) {
            outlineStyle = document.createElement('style');
            outlineStyle.id = 've-outline-style';
            outlineStyle.textContent = `
                [data-ve-outline] * { outline: 1px solid rgba(99,102,241,.15) !important; }
                [data-ve-outline] [data-oid] { outline: 1.5px solid rgba(99,102,241,.45) !important; }
            `;
            document.head.appendChild(outlineStyle);
        }
        document.documentElement.setAttribute('data-ve-outline', '');
    } else {
        document.documentElement.removeAttribute('data-ve-outline');
    }
}

/* ── OID helpers ── */
function getOidTarget(el: EventTarget | null): HTMLElement | null {
    let node = el as HTMLElement | null;
    while (node && node !== document.body) {
        if (node.hasAttribute?.(OID_ATTR)) return node;
        node = node.parentElement;
    }
    return null;
}

/* ── Bridge calls ── */
function selectedInstanceInfo(oid: string): { instanceIndex: number; instanceCount: number; ancestorOids: string[] } {
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[${OID_ATTR}="${oid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`));
    const ancestorOids: string[] = [];
    let parent = selectedEl?.parentElement ?? null;
    while (parent) {
        const ancestorOid = parent.getAttribute(OID_ATTR);
        if (ancestorOid && ancestorOid !== oid && !ancestorOids.includes(ancestorOid)) {
            ancestorOids.push(ancestorOid);
        }
        parent = parent.parentElement;
    }
    const absoluteIndex = selectedEl ? all.indexOf(selectedEl) : -1;
    return {
        instanceIndex: Math.max(0, absoluteIndex),
        instanceCount: all.length,
        ancestorOids,
    };
}

async function bridgeEdit(oid: string, kind: string, payload: string, currentText?: string, scope?: 'instance' | 'component'): Promise<EditResponse> {
    try {
        const instance = selectedInstanceInfo(oid);
        const res = await fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid, kind, payload, currentText, scope, isComponentRoot: componentRootOids.has(oid), ...instance }),
        });
        const data = await res.json();
        return { ok: data.ok === true, error: data.error };
    } catch {
        return { ok: false, error: t('bridgeOfflineShort') };
    }
}

async function bridgeStructureEdit(oid: string, kind: 'insert' | 'remove' | 'move' | 'duplicate' | 'componentize' | 'insert-component', payload: unknown, isComponentRoot?: boolean): Promise<EditResponse> {
    try {
        const instance = selectedInstanceInfo(oid);
        const res = await fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid, kind, payload, currentText: selectedEl?.innerText?.trim() || selectedEl?.textContent?.trim(), isComponentRoot, ...instance }),
        });
        const data = await res.json();
        return { ok: data.ok === true, error: data.error };
    } catch {
        return { ok: false, error: t('bridgeOfflineShort') };
    }
}

async function bridgeEditAttr(oid: string, propName: string, payload: string, currentText: string, scope?: 'instance' | 'component'): Promise<EditResponse> {
    try {
        const instance = selectedInstanceInfo(oid);
        const res = await fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid, kind: 'attr', propName, payload, currentText, scope, isComponentRoot: componentRootOids.has(oid), ...instance }),
        });
        const data = await res.json();
        return { ok: data.ok === true, error: data.error };
    } catch {
        return { ok: false, error: t('bridgeOfflineShort') };
    }
}

async function bridgeUndo(): Promise<EditResponse> {
    try {
        const res = await fetch(`${BRIDGE}/undo`, { method: 'POST' });
        const data = await res.json();
        return { ok: data.ok === true, error: data.error };
    } catch {
        return { ok: false, error: t('bridgeOfflineShort') };
    }
}

/* ── Inline text editing ── */
function startTextEdit(el: HTMLElement): void {
    const oid = el.getAttribute(OID_ATTR);
    if (!oid) return;

    el.contentEditable = 'true';
    el.style.outline = '2px dashed #6366f1';
    el.focus();

    const originalText = el.textContent ?? '';

    const finish = async (save: boolean) => {
        el.contentEditable = 'false';
        el.style.outline = '';

        const newText = el.textContent ?? '';
        if (save && newText !== originalText) {
        const result = await bridgeEdit(oid, 'text', newText, originalText, 'instance');
            showPageToast(result.ok ? t('panelTextSaved') : result.error ?? t('panelTextSaveError'), result.ok ? 'success' : 'error');
        } else if (!save) {
            el.textContent = originalText;
        }
    };

    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            finish(true);
        }
        if (e.key === 'Escape') {
            finish(false);
        }
    }, { once: true });

    el.addEventListener('blur', () => finish(true), { once: true });
}

/* ── Page toast (outside shadow DOM) ── */
let toastEl: HTMLElement | null = null;
function showPageToast(msg: string, type: 'success' | 'error'): void {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    Object.assign(toastEl.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '2147483648',
        background: '#1a1a1a',
        border: `1px solid ${type === 'success' ? '#16a34a' : '#dc2626'}`,
        color: type === 'success' ? '#4ade80' : '#f87171',
        borderRadius: '8px',
        padding: '8px 18px',
        fontSize: '13px',
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 8px 24px rgba(0,0,0,.4)',
    });
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl?.remove(), 2500);
}

async function copyTextToClipboard(value: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', 'true');
            Object.assign(textarea.style, {
                position: 'fixed',
                opacity: '0',
                pointerEvents: 'none',
            });
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

async function copyTextFromElement(element: HTMLTextAreaElement): Promise<boolean> {
    element.focus();
    element.select();
    element.setSelectionRange(0, element.value.length);
    const copied = await copyTextToClipboard(element.value);
    if (copied) return true;
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    }
}

function closePreviewDependencyModal(): void {
    previewDepsModalEl?.remove();
    previewDepsModalEl = null;
}

function showPreviewDependencyModal(payload: PreviewErrorPayload): void {
    const missingDependencies = payload.missingDependencies ?? [];
    const installCommand = payload.installCommand ?? '';

    if (!missingDependencies.length || !installCommand) {
        showPageToast(payload.error ?? t('componentsPreviewUnavailable'), 'error');
        return;
    }

    closePreviewDependencyModal();

    const backdrop = document.createElement('div');
    backdrop.id = PREVIEW_DEPS_MODAL_ID;
    previewDepsModalEl = backdrop;
    Object.assign(backdrop.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483648',
        background: 'rgba(0,0,0,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        width: 'min(520px, calc(100vw - 40px))',
        background: '#121212',
        color: '#e5e5e5',
        border: '1px solid #2a2a2a',
        borderRadius: '14px',
        boxShadow: '0 24px 80px rgba(0,0,0,.55)',
        padding: '18px',
        fontFamily: 'system-ui, sans-serif',
    });

    const depsList = missingDependencies.map(dep => `
        <li style="margin:0;padding:0;color:#d4d4d4;font-size:13px;line-height:1.5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${dep}</li>
    `).join('');

    modal.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:11px;color:#a5b4fc;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('componentsPreviewDepsTitle')}</div>
          <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#cfcfcf">${t('componentsPreviewDepsBody')}</div>
        </div>
        <button type="button" aria-label="${t('componentsClose')}" data-preview-deps-close style="display:inline-flex;align-items:center;justify-content:center;border:1px solid #2a2a2a;background:#171717;color:#999;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:18px;line-height:1;padding:0;flex:0 0 auto">×</button>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:11px;color:#888;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('componentsPreviewDepsListLabel')}</div>
        <ul style="margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px">${depsList}</ul>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:11px;color:#888;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${t('componentsPreviewDepsCommandLabel')}</div>
        <textarea readonly data-preview-deps-command style="margin-top:8px;width:100%;min-height:74px;border:1px solid #2a2a2a;background:#0d0d0d;border-radius:10px;padding:12px;color:#c7d2fe;font-size:12px;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;resize:none;outline:none">${installCommand}</textarea>
      </div>
      <div style="margin-top:12px;font-size:12px;line-height:1.6;color:#fca5a5">${t('componentsPreviewDepsWarning')}</div>
      <div style="margin-top:18px;display:flex;justify-content:flex-end;gap:8px">
        <button type="button" data-preview-deps-dismiss style="padding:8px 12px;border-radius:8px;border:1px solid #2a2a2a;background:#171717;color:#ddd;cursor:pointer">${t('assetsCancel')}</button>
        <button type="button" data-preview-deps-copy style="padding:8px 12px;border-radius:8px;border:1px solid #4338ca;background:#1e1b4b;color:#c7d2fe;cursor:pointer">${t('componentsPreviewDepsCopy')}</button>
      </div>
    `;

    const close = () => closePreviewDependencyModal();
    modal.addEventListener('click', event => event.stopPropagation());
    backdrop.addEventListener('click', event => {
        if (event.target === backdrop) close();
    });
    modal.querySelector<HTMLElement>('[data-preview-deps-close]')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        close();
    });
    modal.querySelector<HTMLElement>('[data-preview-deps-dismiss]')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        close();
    });
    modal.querySelector<HTMLElement>('[data-preview-deps-copy]')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const commandField = modal.querySelector<HTMLTextAreaElement>('[data-preview-deps-command]');
        const copied = commandField ? await copyTextFromElement(commandField) : false;
        showPageToast(copied ? t('componentsPreviewDepsCopySuccess') : t('componentsPreviewDepsCopyError'), copied ? 'success' : 'error');
    });

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
}

function oidSelector(oid: string): string {
    return `[${OID_ATTR}="${oid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

function isContainerElement(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    if (VOID_TAGS.has(tag) || NON_CONTAINER_TAGS.has(tag)) return false;
    if (CONTAINER_TAGS.has(tag)) return true;
    return el.children.length > 0;
}

function nearestOidAncestor(el: HTMLElement | null): HTMLElement | null {
    let current = el;
    while (current) {
        if (current.hasAttribute(OID_ATTR)) return current;
        current = current.parentElement;
    }
    return null;
}

function projectClassesForTag(tagName: string): string {
    const counts = new Map<string, number>();
    document.querySelectorAll<HTMLElement>(tagName).forEach(node => {
        node.className
            .split(/\s+/)
            .filter(Boolean)
            .forEach(cls => counts.set(cls, (counts.get(cls) ?? 0) + 1));
    });
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cls]) => cls)
        .join(' ');
}

function createInsertPreset(preset: 'text' | 'button' | 'group' | 'image') {
    const projectButtonClasses = projectClassesForTag('button');
    const projectImageClasses = projectClassesForTag('img');
    switch (preset) {
        case 'text':
            return {
                tagName: 'p',
                textContent: t('insertDefaultText'),
                attributes: { className: 'text-base' },
            };
        case 'button':
            return {
                tagName: 'button',
                textContent: t('insertDefaultButton'),
                attributes: {
                    className: projectButtonClasses || 'inline-flex items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white',
                    type: 'button',
                },
            };
        case 'group':
            return {
                tagName: 'div',
                attributes: { className: 'min-h-16 p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50/50' },
            };
        case 'image':
            return {
                tagName: 'img',
                attributes: {
                    src: '/placeholder.png',
                    alt: t('insertDefaultImageAlt'),
                    className: projectImageClasses || 'w-32 h-32 object-cover rounded-md',
                },
            };
    }
}

function elementChildrenWithOid(parent: HTMLElement): HTMLElement[] {
    return Array.from(parent.children).filter(
        child => child instanceof HTMLElement && child.hasAttribute(OID_ATTR),
    ) as HTMLElement[];
}

function refreshPanelsSoon(): void {
    const refresh = () => {
        void loadComponentContext();
        layerPanel?.refresh();
        layerPanel?.setSelectedElement(selectedEl);
        scheduleOverlayUpdate();
    };
    setTimeout(refresh, 250);
    setTimeout(refresh, 900);
    setTimeout(refresh, 1800);
}

async function handleGlobalUndo(): Promise<void> {
    const result = await bridgeUndo();
    if (result.ok) {
        deselect();
        refreshPanelsSoon();
        showPageToast(t('globalUndoSuccess'), 'success');
    } else {
        const message = result.error === 'Nothing to undo'
            ? t('globalUndoEmpty')
            : result.error ?? t('globalUndoError');
        showPageToast(message, 'error');
    }
}

function selectDuplicatedSibling(originalEl: HTMLElement): void {
    const parent = originalEl.parentElement;
    if (!parent) return;
    const siblings = elementChildrenWithOid(parent);
    const originalIndex = siblings.findIndex(node => node === originalEl);
    const copy = originalIndex >= 0 ? siblings[originalIndex + 1] : null;
    const copyOid = copy?.getAttribute(OID_ATTR);
    if (copy && copyOid) selectElement(copy, copyOid);
}

function insertionRequestForSelection(el: HTMLElement, preset: 'text' | 'button' | 'group' | 'image') {
    return insertionRequestForSpec(el, createInsertPreset(preset));
}

function insertionRequestForSpec(el: HTMLElement, element: InsertElementSpec) {
    if (isContainerElement(el)) {
        return {
            parentOid: el.getAttribute(OID_ATTR)!,
            placement: 'append' as const,
            element,
        };
    }

    let current: HTMLElement | null = el;
    while (current) {
        const parent = nearestOidAncestor(current.parentElement);
        if (!parent) return null;
        if (isContainerElement(parent)) {
            const siblings = elementChildrenWithOid(parent);
            const currentIndex = siblings.findIndex(node => node === current);
            if (currentIndex === -1) return null;
            return {
                parentOid: parent.getAttribute(OID_ATTR)!,
                placement: 'index' as const,
                index: currentIndex + 1,
                element,
            };
        }
        current = parent;
    }
    return null;
}

async function handleInsertElement(preset: 'text' | 'button' | 'group' | 'image'): Promise<EditResponse> {
    if (!selectedEl) return { ok: false, error: t('structureNoSelection') };
    const oid = selectedEl.getAttribute(OID_ATTR);
    if (!oid) return { ok: false, error: t('structureNoSelection') };
    const payload = insertionRequestForSelection(selectedEl, preset);
    if (!payload) return { ok: false, error: t('structureInsertUnavailable') };
    const result = await bridgeStructureEdit(oid, 'insert', payload);
    if (result.ok) refreshPanelsSoon();
    return result;
}

async function handleInsertComponentInfo(component: ComponentInfo): Promise<EditResponse> {
    if (!selectedEl) return { ok: false, error: t('structureNoSelection') };
    const oid = selectedEl.getAttribute(OID_ATTR);
    if (!oid) return { ok: false, error: t('structureNoSelection') };
    const exportName = component.name;
    const isButtonLike = /button/i.test(exportName);
    const payload = insertionRequestForSpec(selectedEl, {
        tagName: exportName,
        textContent: isButtonLike ? t('insertDefaultButton') : undefined,
    });
    if (!payload) return { ok: false, error: t('structureInsertUnavailable') };
    const result = await bridgeStructureEdit(oid, 'insert-component', {
        ...payload,
        componentName: exportName,
        filePath: component.filePath,
    });
    if (result.ok) refreshPanelsSoon();
    return result;
}

function openComponentsPanel(mode: 'browse' | 'insert' = 'browse'): void {
    componentsPanel?.destroy();
    componentsPanel = new ComponentsPanel({
        mode,
        onClose: () => {
            componentsPanel?.destroy();
            componentsPanel = null;
            toolbar?.setComponentsActive(false);
        },
        onInsertComponent: (component) => {
            void handleInsertComponentInfo(component).then(result => {
                showPageToast(result.ok ? t('panelInsertComponentSuccess') : result.error ?? t('panelStructureError'), result.ok ? 'success' : 'error');
                if (result.ok && mode === 'insert') {
                    componentsPanel?.destroy();
                    componentsPanel = null;
                    toolbar?.setComponentsActive(false);
                }
            });
        },
        onEditInstances: (oids, componentName) => {
            const elements = elementsForOids(oids);
            const first = elements[0];
            if (!first) {
                showPageToast(t('noInstancesOnPage'), 'error');
                return;
            }
            first.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            showComponentOverlays(elements);
            selectElement(first, first.getAttribute(OID_ATTR) ?? '');
            showPageToast(t('instancesOnPage', { name: componentName, count: elements.length }), 'success');
        },
        onOpenPreview: (path, componentName) => {
            const url = new URL(path, window.location.origin);
            window.open(url.toString(), '_blank', 'noopener,noreferrer');
            showPageToast(t('previewOpenedBrowser', { name: componentName }), 'success');
        },
        onPreviewError: (payload) => {
            if (payload.code === 'missing-preview-dependencies' && payload.missingDependencies?.length && payload.installCommand) {
                showPreviewDependencyModal(payload);
                return;
            }
            showPageToast(payload.error || t('componentsPreviewUnavailable'), 'error');
        },
        onPageCreated: (routePath) => {
            const url = new URL(routePath, window.location.origin);
            window.location.assign(url.toString());
        },
    });
    toolbar?.setComponentsActive(true);
}

async function handleRemoveElement(oid: string): Promise<EditResponse> {
    const result = await bridgeStructureEdit(oid, 'remove', null, componentRootOids.has(oid));
    if (result.ok) {
        if (selectedEl?.getAttribute(OID_ATTR) === oid) deselect();
        refreshPanelsSoon();
    }
    return result;
}

async function handleDuplicateElement(oid: string): Promise<EditResponse> {
    const originalEl = selectedEl?.getAttribute(OID_ATTR) === oid ? selectedEl : document.querySelector<HTMLElement>(oidSelector(oid));
    const result = await bridgeStructureEdit(oid, 'duplicate', null, componentRootOids.has(oid));
    if (result.ok) {
        refreshPanelsSoon();
        if (originalEl) {
            setTimeout(() => selectDuplicatedSibling(originalEl), 350);
            setTimeout(() => selectDuplicatedSibling(originalEl), 900);
        }
    }
    return result;
}

async function handleCreateComponent(oid: string, name: string, destinationDir?: string): Promise<EditResponse> {
    const result = await bridgeStructureEdit(oid, 'componentize', { name, ...(destinationDir ? { destinationDir } : {}) });
    if (result.ok) {
        deselect();
        refreshPanelsSoon();
    }
    return result;
}

async function handleMoveElement(oid: string, direction: 'up' | 'down', targetEl?: HTMLElement): Promise<EditResponse> {
    const el = targetEl ?? document.querySelector<HTMLElement>(oidSelector(oid));
    const parent = el?.parentElement;
    if (!el || !parent) return { ok: false, error: t('structureMoveUnavailable') };
    const siblings = elementChildrenWithOid(parent);
    const currentIndex = siblings.findIndex(node => node === el);
    if (currentIndex === -1) return { ok: false, error: t('structureMoveUnavailable') };
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= siblings.length) return { ok: false, error: t('structureMoveUnavailable') };
    const targetSibling = siblings[nextIndex];
    const targetOid = targetSibling?.getAttribute(OID_ATTR);
    const result = await bridgeStructureEdit(oid, 'move', {
        index: nextIndex,
        direction,
        targetOid: targetOid ?? undefined,
        position: direction === 'up' ? 'before' : 'after',
    });
    if (result.ok) {
        setTimeout(() => {
            const next = document.querySelector<HTMLElement>(oidSelector(oid));
            if (!next) return;
            selectedEl = next;
            layerPanel?.refresh();
            layerPanel?.setSelectedElement(next);
            moveOverlay(next);
            scheduleOverlayUpdate();
        }, 40);
        refreshPanelsSoon();
    }
    return result;
}

function isDescendantElement(parent: HTMLElement, child: HTMLElement): boolean {
    let current = child.parentElement;
    while (current) {
        if (current === parent) return true;
        current = current.parentElement;
    }
    return false;
}

async function handleMoveElementToContainer(oid: string, targetOid: string, sourceEl: HTMLElement, targetEl: HTMLElement): Promise<EditResponse> {
    if (!isContainerElement(targetEl)) return { ok: false, error: t('structureInsertUnavailable') };
    if (sourceEl === targetEl || isDescendantElement(sourceEl, targetEl)) return { ok: false, error: t('structureMoveUnavailable') };

    selectedEl = sourceEl;
    const result = await bridgeStructureEdit(oid, 'move', {
        index: elementChildrenWithOid(targetEl).length,
        parentOid: targetOid,
        placement: 'append',
    });
    if (result.ok) {
        setTimeout(() => {
            const next = document.querySelector<HTMLElement>(oidSelector(oid));
            if (!next) return;
            selectedEl = next;
            layerPanel?.refresh();
            layerPanel?.setSelectedElement(next);
            moveOverlay(next);
            scheduleOverlayUpdate();
        }, 40);
        refreshPanelsSoon();
    }
    return result;
}

function fileMatches(filePath: string, indexedFile: string): boolean {
    return filePath === indexedFile ||
        filePath.endsWith(indexedFile) ||
        indexedFile === filePath.split('/').pop();
}

async function loadComponentContext(): Promise<void> {
    try {
        const [oidRes, componentRes] = await Promise.all([
            fetch(`${BRIDGE}/oids`, { signal: AbortSignal.timeout(3000) }),
            fetch(`${BRIDGE}/components`, { signal: AbortSignal.timeout(3000) }),
        ]);
        const oidData = await oidRes.json() as { entries?: OidEntry[] };
        const componentData = await componentRes.json() as { components?: ComponentInfo[] };
        const entries = oidData.entries ?? [];
        const components = componentData.components ?? [];
        oidFileByOid = new Map(entries.map(entry => [entry.oid, entry.file]));
        const componentFiles = new Set(components.map(component => component.filePath));
        const roots = new Set<string>();
        entries.forEach(entry => {
            const file = entry.file;
            const matchesComponent = Array.from(componentFiles).some(componentFile => fileMatches(componentFile, file));
            if (!matchesComponent) return;
            const domNode = document.querySelector<HTMLElement>(oidSelector(entry.oid));
            if (!domNode) return;
            const parentOid = nearestOidAncestor(domNode.parentElement)?.getAttribute(OID_ATTR);
            const parentFile = parentOid ? oidFileByOid.get(parentOid) : null;
            const parentMatchesComponent = parentFile ? Array.from(componentFiles).some(componentFile => fileMatches(componentFile, parentFile)) : false;
            if (!parentMatchesComponent || parentFile !== file) roots.add(entry.oid);
        });
        componentRootOids = roots;
    } catch {
        componentRootOids = new Set();
        oidFileByOid = new Map();
    }
}

function elementHasComponentContext(el: HTMLElement): boolean {
    let current: HTMLElement | null = el;
    while (current) {
        const oid = current.getAttribute(OID_ATTR);
        if (oid && componentRootOids.has(oid)) return true;
        current = nearestOidAncestor(current.parentElement);
    }
    return false;
}

function startCopyStyleMode(oid: string): void {
    copyStyleTargetOid = oid;
    showPageToast(t('panelCopyStylePending'), 'success');
}

async function applyCopiedStyle(sourceEl: HTMLElement): Promise<void> {
    if (!copyStyleTargetOid) return;
    const targetOid = copyStyleTargetOid;
    copyStyleTargetOid = null;
    const targetEl = document.querySelector<HTMLElement>(oidSelector(targetOid));
    if (!targetEl) {
        showPageToast(t('structureNoSelection'), 'error');
        return;
    }
    targetEl.className = sourceEl.className;
    const result = await bridgeEdit(targetOid, 'class', sourceEl.className, undefined, 'instance');
    if (result.ok) {
        selectElement(targetEl, targetOid);
        showPageToast(t('panelCopyStyleSuccess'), 'success');
    } else {
        showPageToast(result.error ?? t('panelClassesSaveError'), 'error');
    }
}

async function applyAssetToSelection(asset: AssetInfo): Promise<void> {
    if (!selectedEl) {
        showPageToast(t('structureNoSelection'), 'error');
        return;
    }

    const oid = selectedEl.getAttribute(OID_ATTR);
    if (!oid) {
        showPageToast(t('structureNoSelection'), 'error');
        return;
    }

    if (selectedEl.tagName.toLowerCase() === 'img') {
        const currentSrc = selectedEl.getAttribute('src') ?? '';
        selectedEl.setAttribute('src', asset.runtimePath);
        const result = await bridgeEditAttr(oid, 'src', asset.runtimePath, currentSrc, 'instance');
        if (result.ok) selectElement(selectedEl, oid);
        showPageToast(result.ok ? t('panelImageSrcSaved') : result.error ?? t('panelImageSrcSaveError'), result.ok ? 'success' : 'error');
        return;
    }

    const payload = insertionRequestForSpec(selectedEl, {
        tagName: 'img',
        attributes: {
            src: asset.runtimePath,
            alt: asset.name.replace(/\.[a-z0-9]+$/i, ''),
            className: projectClassesForTag('img') || 'w-32 h-32 object-cover rounded-md',
        },
    });
    if (!payload) {
        showPageToast(t('structureInsertUnavailable'), 'error');
        return;
    }
    const result = await bridgeStructureEdit(oid, 'insert', payload);
    if (result.ok) refreshPanelsSoon();
    showPageToast(result.ok ? t('panelInsertSuccess') : result.error ?? t('panelStructureError'), result.ok ? 'success' : 'error');
}

/* ── Mouse events ── */
function onMouseMove(e: MouseEvent): void {
    if (!enabled || selectedEl) return;
    // Ignore hover events that originate inside any VE panel host
    const tgt = e.target as HTMLElement | null;
    if (tgt && typeof tgt.closest === 'function') {
        if (VE_HOST_IDS.some(id => tgt.closest(`#${id}`))) return;
    }

    const target = getOidTarget(e.target);
    if (target) {
        moveOverlay(target);
        document.body.style.cursor = 'pointer';
    } else {
        hideOverlay();
        document.body.style.cursor = '';
    }
}

/** IDs of all shadow-DOM panel host elements managed by this extension. */
const VE_HOST_IDS = ['ve-panel-host', 've-toolbar-host', 've-layer-host', 've-theme-host', 've-components-host', 've-assets-host', PREVIEW_DEPS_MODAL_ID];

/** Retorna true se o clique veio de dentro de qualquer panel shadow-DOM do VE. */
function isInsidePanel(e: MouseEvent): boolean {
    const target = e.target as HTMLElement | null;
    // Strategy 1: target.closest — works for non-shadow elements
    if (target && typeof target.closest === 'function') {
        if (VE_HOST_IDS.some(id => target.closest(`#${id}`))) return true;
    }
    // Strategy 2: composedPath — catches events retargeted by closed shadow DOM
    if (e.composedPath().some(el => VE_HOST_IDS.includes((el as HTMLElement).id ?? ''))) {
        return true;
    }
    // Strategy 3: visual hit-test as last-resort fallback
    const elAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (elAtPoint && typeof elAtPoint.closest === 'function') {
        if (VE_HOST_IDS.some(id => elAtPoint.closest(`#${id}`))) return true;
    }
    return false;
}

function onClick(e: MouseEvent): void {
    if (!enabled) return;
    // Ignore the click that fires at the end of a panel drag — the pointer was
    // released outside the shadow host, so isInsidePanel() would be false, but
    // the user was just repositioning the panel, not selecting a new element.
    if (VisualEditPanel.dragging || VisualEditToolbar.dragging) return;
    if (isInsidePanel(e)) return;

    const target = getOidTarget(e.target);
    if (!shouldInterceptEditorClick(window.location.pathname, Boolean(target))) return;

    // Previne navegação e outros handlers da página para TODOS os cliques
    // enquanto o modo de edição estiver ativo.
    e.preventDefault();
    e.stopPropagation();

    if (!target) {
        if (copyStyleTargetOid) {
            copyStyleTargetOid = null;
            showPageToast(t('panelCopyStyleCancelled'), 'error');
            return;
        }
        if (selectedEl) deselect();
        return;
    }

    if (copyStyleTargetOid) {
        if (target.getAttribute(OID_ATTR) === copyStyleTargetOid) {
            showPageToast(t('panelCopyStylePickAnother'), 'error');
            return;
        }
        void applyCopiedStyle(target);
        return;
    }

    if (selectedEl === target) return; // already selected
    clearComponentOverlays();

    const oid = target.getAttribute(OID_ATTR)!;

    // Warn when multiple elements share the same OID (reusable component).
    // Editing any instance modifies the shared JSX template, so all instances
    // will change together. The user deserves to know this upfront.
    const duplicates = document.querySelectorAll(`[${OID_ATTR}="${oid}"]`).length;
    if (duplicates > 1) {
        showPageToast(
            t('reusedComponentWarning', { count: duplicates }),
            'error',
        );
    }

    selectElement(target, oid);
}

function onDblClick(e: MouseEvent): void {
    if (!enabled) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && typeof tgt.closest === 'function') {
        if (VE_HOST_IDS.some(id => tgt.closest(`#${id}`))) return;
    }

    const target = getOidTarget(e.target);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    startTextEdit(target);
}

function onKeyDown(e: KeyboardEvent): void {
    if (!enabled) return;
    if (e.key === 'Escape' && previewDepsModalEl) {
        e.preventDefault();
        e.stopPropagation();
        closePreviewDependencyModal();
        return;
    }
    const target = e.target as HTMLElement | null;
    const isEditableTarget =
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isEditableTarget) {
        e.preventDefault();
        e.stopPropagation();
        void handleGlobalUndo();
        return;
    }
    if (e.key === 'Escape' && copyStyleTargetOid) {
        copyStyleTargetOid = null;
        showPageToast(t('panelCopyStyleCancelled'), 'error');
        return;
    }
    if (e.key === 'Escape') deselect();
    if (e.key === 'Delete' && selectedEl?.getAttribute(OID_ATTR)) {
        e.preventDefault();
        const oid = selectedEl.getAttribute(OID_ATTR)!;
        void handleRemoveElement(oid).then(result => {
            showPageToast(result.ok ? t('panelRemoveSuccess') : result.error ?? t('panelStructureError'), result.ok ? 'success' : 'error');
        });
    }
}

function deselect(): void {
    selectedEl = null;
    selectedOid = '';
    copyStyleTargetOid = null;
    hideOverlay();
    clearComponentOverlays();
    document.body.style.cursor = '';
    panel?.hide();
}

function selectElement(el: HTMLElement, oid: string): void {
    selectedEl = el;
    selectedOid = oid;
    moveOverlay(el);
    if (!panel) {
        panel = new VisualEditPanel({
            onApply: async (o, classes, scope) => bridgeEdit(o, 'class', classes, undefined, scope),
            onTextApply: async (o, text, orig, scope) => bridgeEdit(o, 'text', text, orig, scope),
            onAttrApply: async (o, attr, val, cur, scope) => bridgeEditAttr(o, attr, val, cur, scope),
            onInsertElement: async (_o, preset) => handleInsertElement(preset),
            onInsertComponent: async () => {
                openComponentsPanel('insert');
                return { ok: true };
            },
            onRemoveElement: async (o) => handleRemoveElement(o),
            onDuplicateElement: async (o) => handleDuplicateElement(o),
            onCreateComponent: async (o, name, destinationDir) => handleCreateComponent(o, name, destinationDir),
            onStartCopyStyle: (o) => startCopyStyleMode(o),
            onOpenAssets: () => openAssetsPanel(),
            onClose: deselect,
        });
    }
    const isComponentPreview = isComponentPreviewPath(window.location.pathname);
    const hasComponentContext = elementHasComponentContext(el);
    panel.show(el, oid, isComponentPreview
        ? { forceScope: 'component', hideScopeControl: true }
        : { hideScopeControl: !hasComponentContext });
    panel.setResponsivePrefix(responsivePrefix);
    layerPanel?.setSelectedElement(el);
    scheduleOverlayUpdate();
}

/* ── Enable / disable ── */
function enable(): void {
    if (enabled) return;
    enabled = true;
    void loadComponentContext();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', scheduleOverlayUpdate, true);
    window.addEventListener('resize', scheduleOverlayUpdate, true);

    // Create mini toolbar
    toolbar = new VisualEditToolbar({
        onTheme: () => {
            if (themePanel) {
                themePanel.destroy();
                themePanel = null;
                toolbar?.setThemeActive(false);
            } else {
                themePanel = new ThemePanel();
                toolbar?.setThemeActive(true);
            }
        },
        onTree: () => {
            if (layerPanel) {
                layerPanel.destroy();
                layerPanel = null;
                toolbar?.setTreeActive(false);
            } else {
                layerPanel = new LayerPanel({
                    onClose: () => {
                        layerPanel?.destroy();
                        layerPanel = null;
                        toolbar?.setTreeActive(false);
                    },
                    onSelect: (el, oid) => {
                        // Select the element as if the user clicked it
                        clearComponentOverlays();
                        selectElement(el, oid);
                    },
                    onHover: (el) => showTreeHover(el),
                    onMove: (el, oid, direction) => {
                        void handleMoveElement(oid, direction, el).then(result => {
                            showPageToast(result.ok ? t('panelMoveSuccess') : result.error ?? t('panelStructureError'), result.ok ? 'success' : 'error');
                        });
                    },
                    onMoveToContainer: (el, oid, targetEl, targetOid) => {
                        void handleMoveElementToContainer(oid, targetOid, el, targetEl).then(result => {
                            showPageToast(result.ok ? t('panelMoveSuccess') : result.error ?? t('panelStructureError'), result.ok ? 'success' : 'error');
                        });
                    },
                    isComponentRoot: (oid) => componentRootOids.has(oid),
                });
                toolbar?.setTreeActive(true);
            }
        },
        onComponents: () => {
            if (componentsPanel) {
                componentsPanel.destroy();
                componentsPanel = null;
                toolbar?.setComponentsActive(false);
            } else {
                openComponentsPanel('browse');
            }
        },
        onAssets: () => {
            if (assetsPanel) {
                closeAssetsPanel();
            } else {
                openAssetsPanel();
            }
        },
        onUndo: () => {
            void handleGlobalUndo();
        },
        onOutline: (active) => setOutline(active),
        onBreakpoint: (prefix, width) => setResponsivePreview(prefix, width),
        onDisable: () => {
            chrome.storage.local.set({ enabled: false });
            disable();
        },
    });

    showPageToast(t('visualEditEnabled'), 'success');
}

function disable(): void {
    if (!enabled) return;
    enabled = false;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('dblclick', onDblClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', scheduleOverlayUpdate, true);
    window.removeEventListener('resize', scheduleOverlayUpdate, true);
    if (overlayFrame) cancelAnimationFrame(overlayFrame);
    overlayFrame = 0;
    deselect();
    hideHoverOverlay();
    hoverOverlay?.remove();
    hoverOverlay = null;

    // Destroy extra panels + toolbar
    toolbar?.destroy();   toolbar = null;
    layerPanel?.destroy(); layerPanel = null;
    themePanel?.destroy(); themePanel = null;
    componentsPanel?.destroy(); componentsPanel = null;
    closeAssetsPanel();
    setOutline(false);
    setResponsivePreview('', null);
    responsiveStyle?.remove();
    responsiveStyle = null;
    componentRootOids = new Set();
    oidFileByOid = new Map();
    copyStyleTargetOid = null;

    showPageToast(t('visualEditDisabled'), 'error');
}

/* ── Messages from popup / background ── */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'VISUAL_EDIT_ENABLE') enable();
    if (msg.type === 'VISUAL_EDIT_DISABLE') disable();
});

/* ── Restore state on page load ── */
void loadLanguage();
chrome.storage.local.get('enabled', (stored) => {
    if (stored.enabled) enable();
});
