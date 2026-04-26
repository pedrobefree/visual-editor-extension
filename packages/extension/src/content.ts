import { VisualEditPanel, type EditResponse } from './panel';
import { VisualEditToolbar } from './toolbar';
import { LayerPanel } from './layer-panel';
import { ThemePanel } from './theme-panel';
import { ComponentsPanel } from './components-panel';
import { loadLanguage, t } from './i18n';

const BRIDGE = 'http://localhost:5179';
const OID_ATTR = 'data-oid';
const COMPONENT_PREVIEW_PATH_PREFIX = '/visual-edit-kit-component-preview/';
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

let enabled = false;
let selectedEl: HTMLElement | null = null;
let selectedOid = '';
let panel: VisualEditPanel | null = null;
let overlay: HTMLElement | null = null;
let toolbar: VisualEditToolbar | null = null;
let layerPanel: LayerPanel | null = null;
let themePanel: ThemePanel | null = null;
let componentsPanel: ComponentsPanel | null = null;
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
    return {
        instanceIndex: Math.max(0, selectedEl ? all.indexOf(selectedEl) : 0),
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
            body: JSON.stringify({ oid, kind, payload, currentText, scope, ...instance }),
        });
        const data = await res.json();
        return { ok: data.ok === true, error: data.error };
    } catch {
        return { ok: false, error: t('bridgeOfflineShort') };
    }
}

async function bridgeStructureEdit(oid: string, kind: 'insert' | 'remove' | 'move', payload: unknown): Promise<EditResponse> {
    try {
        const res = await fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid, kind, payload }),
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
            body: JSON.stringify({ oid, kind: 'attr', propName, payload, currentText, scope, ...instance }),
        });
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
    setTimeout(() => {
        void loadComponentContext();
        layerPanel?.refresh();
        layerPanel?.setSelectedElement(selectedEl);
        scheduleOverlayUpdate();
    }, 250);
}

function insertionRequestForSelection(el: HTMLElement, preset: 'text' | 'button' | 'group' | 'image') {
    if (isContainerElement(el)) {
        return {
            parentOid: el.getAttribute(OID_ATTR)!,
            placement: 'append' as const,
            element: createInsertPreset(preset),
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
                element: createInsertPreset(preset),
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

async function handleRemoveElement(oid: string): Promise<EditResponse> {
    const result = await bridgeStructureEdit(oid, 'remove', null);
    if (result.ok) {
        if (selectedEl?.getAttribute(OID_ATTR) === oid) deselect();
        refreshPanelsSoon();
    }
    return result;
}

function applyLocalMove(el: HTMLElement, nextIndex: number): void {
    const parent = el.parentElement;
    if (!parent) return;
    const siblings = elementChildrenWithOid(parent);
    const reordered = siblings.filter(node => node !== el);
    reordered.splice(nextIndex, 0, el);
    reordered.forEach(node => parent.appendChild(node));
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
        applyLocalMove(el, nextIndex);
        selectedEl = el;
        layerPanel?.refresh();
        layerPanel?.setSelectedElement(el);
        moveOverlay(el);
        scheduleOverlayUpdate();
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
const VE_HOST_IDS = ['ve-panel-host', 've-toolbar-host', 've-layer-host', 've-theme-host', 've-components-host'];

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

    // Previne navegação e outros handlers da página para TODOS os cliques
    // enquanto o modo de edição estiver ativo.
    e.preventDefault();
    e.stopPropagation();

    const target = getOidTarget(e.target);
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
            onRemoveElement: async (o) => handleRemoveElement(o),
            onStartCopyStyle: (o) => startCopyStyleMode(o),
            onClose: deselect,
        });
    }
    const isComponentPreview = window.location.pathname.startsWith(COMPONENT_PREVIEW_PATH_PREFIX);
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
                componentsPanel = new ComponentsPanel({
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
                });
                toolbar?.setComponentsActive(true);
            }
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
