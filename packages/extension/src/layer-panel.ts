/* -----------------------------------------------------------------------
   Layer Tree Panel — Visual Edit Kit
   Renders the DOM element hierarchy (elements with data-oid) as a
   collapsible layer tree docked to the left side of the viewport.
   ----------------------------------------------------------------------- */

import { attachDrag } from './drag-util';
import { subscribeLanguageChange, t } from './i18n';

const OID_ATTR = 'data-oid';

/* ── Tree model ─────────────────────────────────────────────────────────── */
interface TreeNode {
    el: HTMLElement;
    oid: string;
    depth: number;
    children: TreeNode[];
}

function getLabel(el: HTMLElement): string {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;

    // First direct text node
    const text = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
    if (text) return text.length > 42 ? text.slice(0, 42) + '…' : text;

    const placeholder = (el as HTMLInputElement).placeholder;
    if (placeholder) return placeholder;

    const id = el.id ? `#${el.id}` : '';
    const tag = el.tagName.toLowerCase();
    return id ? `${tag}${id}` : tag;
}

function getTagIcon(tag: string): string {
    if (/^h[1-6]$/.test(tag))                             return 'H';
    if (['p','span','em','strong','b','i','label','a'].includes(tag)) return 'T';
    if (['img','picture','figure','video','canvas','svg'].includes(tag)) return '▣';
    if (['button'].includes(tag))                          return '◉';
    if (['input','textarea','select'].includes(tag))       return '⬜';
    if (['ul','ol','li'].includes(tag))                    return '≡';
    if (['nav','header','footer','main','aside','section','article'].includes(tag)) return '▭';
    return '◻';
}

function buildTree(root: HTMLElement): TreeNode[] {
    const allOid = Array.from(root.querySelectorAll<HTMLElement>(`[${OID_ATTR}]`));
    const oidSet = new Set<HTMLElement>(allOid);

    function closestOidAncestor(el: HTMLElement): HTMLElement | null {
        let node = el.parentElement;
        while (node && node !== root) {
            if (oidSet.has(node)) return node;
            node = node.parentElement;
        }
        return null;
    }

    const nodeMap = new Map<HTMLElement, TreeNode>();
    for (const el of allOid) {
        nodeMap.set(el, { el, oid: el.getAttribute(OID_ATTR)!, depth: 0, children: [] });
    }

    const roots: TreeNode[] = [];
    for (const el of allOid) {
        const parent = closestOidAncestor(el);
        const node = nodeMap.get(el)!;
        if (parent) {
            const parentNode = nodeMap.get(parent)!;
            node.depth = parentNode.depth + 1;
            parentNode.children.push(node);
        } else {
            roots.push(node);
        }
    }
    return roots;
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#layer-panel {
  position: fixed; top: 52px; left: 12px; z-index: 2147483645;
  width: 264px; height: min(760px, calc(100vh - 68px)); min-width: 220px; min-height: 180px; max-width: calc(100vw - 24px); max-height: calc(100vh - 68px);
  background: #141414; color: #e5e5e5;
  border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column;
  font-size: 12px; overflow: hidden; resize: both;
}
#layer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border-bottom: 1px solid #222;
  background: #1a1a1a; flex-shrink: 0;
  cursor: grab; user-select: none;
}
#layer-header.dragging { cursor: grabbing; }
.layer-title { font-size: 10px; font-weight: 600; color: #666; letter-spacing: .08em; text-transform: uppercase; }
#refresh-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 14px; padding: 2px 4px; line-height: 1; }
#refresh-btn:hover { color: #e5e5e5; }
#layer-body { overflow-y: auto; flex: 1; padding: 4px 0; }
#layer-body::-webkit-scrollbar { width: 3px; }
#layer-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
.tree-node {
  display: flex; align-items: center; gap: 3px;
  padding: 3px 8px; cursor: pointer; min-height: 24px;
}
.tree-node:hover { background: #1e1e1e; }
.tree-node.selected { background: #1e1e3a; }
.tree-node.selected .node-label { color: #818cf8; }
.tree-node.selected .node-tag { color: #6366f1; }
.toggle-btn {
  width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
  color: #444; font-size: 9px; flex-shrink: 0; border-radius: 2px; cursor: pointer;
  transition: color .1s;
}
.toggle-btn:hover { color: #aaa; }
.toggle-btn.leaf { visibility: hidden; }
.toggle-btn::before { content: '▾'; }
.toggle-btn.collapsed::before { content: '▸'; }
.node-icon { font-size: 12px; color: #555; flex-shrink: 0; width: 15px; text-align: center; }
.node-label {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 11px; color: #999;
}
.node-tag { font-size: 9px; color: #444; font-family: monospace; flex-shrink: 0; }
.children-wrap.hidden { display: none; }
#empty { padding: 28px 16px; text-align: center; color: #444; font-size: 11px; line-height: 1.6; }
`;

/* ── Panel class ────────────────────────────────────────────────────────── */
export interface LayerPanelCallbacks {
    onSelect: (el: HTMLElement, oid: string) => void;
    onHover?: (el: HTMLElement | null, oid: string) => void;
}

export class LayerPanel {
    static readonly HOST_ID = 've-layer-host';

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private callbacks: LayerPanelCallbacks;
    private selectedOid   = '';
    private collapsedOids = new Set<string>();
    private dragCleanup:  (() => void) | null = null;
    private unsubscribeLanguage: (() => void) | null = null;

    constructor(callbacks: LayerPanelCallbacks) {
        this.callbacks = callbacks;
        document.querySelectorAll(`#${LayerPanel.HOST_ID}`).forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = LayerPanel.HOST_ID;
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
        this.unsubscribeLanguage = subscribeLanguageChange(() => this.render());
        this.render();
    }

    /** Called by content.ts when the user selects an element. */
    setSelected(oid: string): void {
        this.selectedOid = oid;
        this.shadow.querySelectorAll('.tree-node').forEach(n => {
            const isSelected = (n as HTMLElement).dataset.oid === oid;
            n.classList.toggle('selected', isSelected);
            if (isSelected) (n as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    /** Rebuild the tree (call after DOM changes). */
    refresh(): void { this.render(); }

    private render(): void {
        const roots = buildTree(document.body);
        const style = document.createElement('style');
        style.textContent = CSS;

        const bodyHtml = roots.length
            ? this.renderNodes(roots)
            : `<div id="empty">${t('layerEmpty')}</div>`;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="layer-panel">
            <div id="layer-header">
              <span class="layer-title">${t('layerTitle')}</span>
              <button id="refresh-btn" title="${t('layerRefresh')}">↺</button>
            </div>
            <div id="layer-body">${bodyHtml}</div>
          </div>`;

        this.shadow.innerHTML = '';
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.bindEvents();

        // Attach drag — tear down previous listener if re-rendering
        this.dragCleanup?.();
        const headerEl = this.shadow.querySelector('#layer-header') as HTMLElement | null;
        const panelEl  = this.shadow.querySelector('#layer-panel') as HTMLElement | null;
        if (headerEl && panelEl) {
            this.dragCleanup = attachDrag(panelEl, headerEl);
        }
    }

    private renderNodes(nodes: TreeNode[]): string {
        return nodes.map(({ el, oid, children, depth }) => {
            const tag        = el.tagName.toLowerCase();
            const label      = getLabel(el);
            const icon       = getTagIcon(tag);
            const hasKids    = children.length > 0;
            const collapsed  = this.collapsedOids.has(oid);
            const selected   = oid === this.selectedOid;
            const indent     = depth * 14;
            const toggleCls  = hasKids ? (collapsed ? 'toggle-btn collapsed' : 'toggle-btn') : 'toggle-btn leaf';

            return `
              <div class="tree-node${selected ? ' selected' : ''}" data-oid="${oid}"
                   style="padding-left:${8 + indent}px">
                <span class="${toggleCls}" data-toggle="${oid}"></span>
                <span class="node-icon">${icon}</span>
                <span class="node-label" title="${label.replace(/"/g, '&quot;')}">${label}</span>
                <span class="node-tag">${tag}</span>
              </div>
              ${hasKids
                ? `<div class="children-wrap${collapsed ? ' hidden' : ''}" data-kids="${oid}">${this.renderNodes(children)}</div>`
                : ''}`;
        }).join('');
    }

    private bindEvents(): void {
        // Block propagation
        const panel = this.shadow.querySelector('#layer-panel');
        if (panel) {
            ['click','mousedown','pointerdown'].forEach(ev =>
                panel.addEventListener(ev, (e: Event) => e.stopPropagation()));
        }

        // Refresh
        this.shadow.querySelector('#refresh-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.render();
        });

        // Node clicks
        this.shadow.querySelectorAll('.tree-node').forEach(nodeEl => {
            nodeEl.addEventListener('mouseenter', () => {
                const oid = (nodeEl as HTMLElement).dataset.oid ?? '';
                const el = document.querySelector<HTMLElement>(`[${OID_ATTR}="${oid}"]`);
                this.callbacks.onHover?.(el, oid);
            });
            nodeEl.addEventListener('mouseleave', () => {
                const oid = (nodeEl as HTMLElement).dataset.oid ?? '';
                this.callbacks.onHover?.(null, oid);
            });
            nodeEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const oid    = (nodeEl as HTMLElement).dataset.oid ?? '';
                const target = e.target as HTMLElement;

                // Toggle if clicked on the arrow icon
                if (target.dataset.toggle !== undefined) {
                    if (this.collapsedOids.has(oid)) {
                        this.collapsedOids.delete(oid);
                    } else {
                        this.collapsedOids.add(oid);
                    }
                    target.classList.toggle('collapsed', this.collapsedOids.has(oid));
                    const kids = this.shadow.querySelector(`[data-kids="${oid}"]`);
                    kids?.classList.toggle('hidden', this.collapsedOids.has(oid));
                    return;
                }

                // Select element
                const el = document.querySelector<HTMLElement>(`[${OID_ATTR}="${oid}"]`);
                if (el) {
                    this.setSelected(oid);
                    this.callbacks.onSelect(el, oid);
                }
            });
        });
    }

    destroy(): void {
        this.callbacks.onHover?.(null, '');
        this.unsubscribeLanguage?.();
        this.dragCleanup?.();
        this.host.remove();
    }
}
