import { VisualEditPanel } from './panel';
import { VisualEditToolbar } from './toolbar';
import { LayerPanel } from './layer-panel';
import { ThemePanel } from './theme-panel';
import { ComponentsPanel } from './components-panel';

const BRIDGE = 'http://localhost:5179';
const OID_ATTR = 'data-oid';

let enabled = false;
let selectedEl: HTMLElement | null = null;
let panel: VisualEditPanel | null = null;
let overlay: HTMLElement | null = null;
let toolbar: VisualEditToolbar | null = null;
let layerPanel: LayerPanel | null = null;
let themePanel: ThemePanel | null = null;
let componentsPanel: ComponentsPanel | null = null;
let outlineStyle: HTMLStyleElement | null = null;

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
async function bridgeEdit(oid: string, kind: string, payload: string, currentText?: string): Promise<boolean> {
    try {
        const res = await fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid, kind, payload, currentText }),
        });
        const data = await res.json();
        return data.ok === true;
    } catch {
        return false;
    }
}

async function bridgeEditAttr(oid: string, propName: string, payload: string, currentText: string): Promise<boolean> {
    try {
        const res = await fetch(`${BRIDGE}/edit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid, kind: 'attr', propName, payload, currentText }),
        });
        const data = await res.json();
        return data.ok === true;
    } catch {
        return false;
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
            const ok = await bridgeEdit(oid, 'text', newText);
            showPageToast(ok ? `Texto salvo ✓` : 'Erro ao salvar. Bridge offline?', ok ? 'success' : 'error');
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
    if (VisualEditPanel.dragging) return;
    if (isInsidePanel(e)) return;

    // Previne navegação e outros handlers da página para TODOS os cliques
    // enquanto o modo de edição estiver ativo.
    e.preventDefault();
    e.stopPropagation();

    const target = getOidTarget(e.target);
    if (!target) {
        if (selectedEl) deselect();
        return;
    }

    if (selectedEl === target) return; // already selected
    selectedEl = target;
    moveOverlay(target);

    const oid = target.getAttribute(OID_ATTR)!;

    // Warn when multiple elements share the same OID (reusable component).
    // Editing any instance modifies the shared JSX template, so all instances
    // will change together. The user deserves to know this upfront.
    const duplicates = document.querySelectorAll(`[${OID_ATTR}="${oid}"]`).length;
    if (duplicates > 1) {
        showPageToast(
            `⚠️ Componente reutilizado — ${duplicates} instâncias compartilham este template. Editar afetará todas.`,
            'error',
        );
    }

    if (!panel) {
        panel = new VisualEditPanel({
            onApply: async (oid, classes) => {
                return bridgeEdit(oid, 'class', classes);
            },
            onTextApply: async (oid, text, originalText) => {
                return bridgeEdit(oid, 'text', text, originalText);
            },
            onAttrApply: async (oid, attrName, newValue, currentValue) => {
                return bridgeEditAttr(oid, attrName, newValue, currentValue);
            },
            onClose: deselect,
        });
    }
    panel.show(target, oid);
    // Sync layer panel highlight when an element is selected via click
    layerPanel?.setSelected(oid);
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
    if (e.key === 'Escape') deselect();
}

function deselect(): void {
    selectedEl = null;
    hideOverlay();
    document.body.style.cursor = '';
    panel?.hide();
}

/* ── Enable / disable ── */
function enable(): void {
    if (enabled) return;
    enabled = true;
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('keydown', onKeyDown, true);

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
                        selectedEl = el;
                        moveOverlay(el);
                        if (!panel) {
                            panel = new VisualEditPanel({
                                onApply: async (o, classes) => bridgeEdit(o, 'class', classes),
                                onTextApply: async (o, text, orig) => bridgeEdit(o, 'text', text, orig),
                                onAttrApply: async (o, attr, val, cur) => bridgeEditAttr(o, attr, val, cur),
                                onClose: deselect,
                            });
                        }
                        panel.show(el, oid);
                    },
                });
                toolbar?.setTreeActive(true);
            }
        },
        onOutline: (active) => setOutline(active),
        onDisable: () => {
            chrome.storage.local.set({ enabled: false });
            disable();
        },
    });

    showPageToast('Visual Edit ativado', 'success');
}

function disable(): void {
    if (!enabled) return;
    enabled = false;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('dblclick', onDblClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    deselect();

    // Destroy extra panels + toolbar
    toolbar?.destroy();   toolbar = null;
    layerPanel?.destroy(); layerPanel = null;
    themePanel?.destroy(); themePanel = null;
    setOutline(false);

    showPageToast('Visual Edit desativado', 'error');
}

/* ── Messages from popup / background ── */
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'VISUAL_EDIT_ENABLE') enable();
    if (msg.type === 'VISUAL_EDIT_DISABLE') disable();
});

/* ── Restore state on page load ── */
chrome.storage.local.get('enabled', (stored) => {
    if (stored.enabled) enable();
});
