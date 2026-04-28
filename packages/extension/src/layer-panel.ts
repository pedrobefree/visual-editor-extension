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
    key: string;
    depth: number;
    children: TreeNode[];
}

interface FilteredTreeNode extends TreeNode {
    children: FilteredTreeNode[];
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
    for (const [index, el] of allOid.entries()) {
        nodeMap.set(el, { el, oid: el.getAttribute(OID_ATTR)!, key: `node-${index}`, depth: 0, children: [] });
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
.layer-header-actions { display:flex; align-items:center; gap:6px; }
.icon-btn {
  width: 26px; height: 24px; padding: 0; border-radius: 6px; cursor: pointer;
  border: 1px solid #2a2a2a; background: #171717; color: #666; font-size: 13px;
}
.icon-btn:hover { color: #e5e5e5; border-color: #444; background: #202020; }
.search-wrap { padding: 8px 12px; border-bottom: 1px solid #1e1e1e; flex-shrink: 0; }
.search-input {
  width: 100%; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
  color: #e5e5e5; padding: 5px 9px; font-size: 11px; outline: none;
}
.search-input:focus { border-color: #6366f1; }
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
.tree-node.drop-target { background: rgba(99,102,241,.22); box-shadow: inset 0 0 0 1px rgba(129,140,248,.7); }
.tree-node.dragging { opacity: .45; }
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
.component-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 16px; padding: 0 5px; border-radius: 999px;
  background: rgba(99,102,241,.18); color: #c7d2fe; font-size: 9px; font-weight: 700;
  flex-shrink: 0;
}
.node-label {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 11px; color: #999;
}
.node-tag { font-size: 9px; color: #444; font-family: monospace; flex-shrink: 0; }
.node-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.node-action {
  width: 18px; height: 18px; padding: 0; border-radius: 4px; cursor: pointer;
  border: 1px solid #2a2a2a; background: #171717; color: #666; font-size: 10px;
}
.node-action:hover { color: #e5e5e5; border-color: #444; background: #202020; }
.node-action:disabled { opacity: .3; cursor: not-allowed; }
.children-wrap.hidden { display: none; }
#empty { padding: 28px 16px; text-align: center; color: #444; font-size: 11px; line-height: 1.6; }
`;

/* ── Panel class ────────────────────────────────────────────────────────── */
export interface LayerPanelCallbacks {
    onSelect: (el: HTMLElement, oid: string) => void;
    onHover?: (el: HTMLElement | null, oid: string) => void;
    onMove?: (el: HTMLElement, oid: string, direction: 'up' | 'down') => void;
    onMoveToContainer?: (el: HTMLElement, oid: string, targetEl: HTMLElement, targetOid: string) => void;
    isComponentRoot?: (oid: string) => boolean;
    onClose?: () => void;
}

export class LayerPanel {
    static readonly HOST_ID = 've-layer-host';

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private callbacks: LayerPanelCallbacks;
    private selectedKey   = '';
    private collapsedOids = new Set<string>();
    private parentByOid = new Map<string, string | null>();
    private parentByKey = new Map<string, string | null>();
    private elementByKey = new Map<string, HTMLElement>();
    private keyByElement = new WeakMap<HTMLElement, string>();
    private draggingKey = '';
    private query = '';
    private searchValue = '';
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
    setSelectedElement(el: HTMLElement | null): void {
        if (!el) return;
        const key = this.keyByElement.get(el);
        if (key) this.setSelectedKey(key);
    }

    setSelected(oid: string): void {
        const first = this.shadow.querySelector<HTMLElement>(`.tree-node[data-oid="${oid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
        const key = first?.dataset.key;
        if (key) this.setSelectedKey(key);
    }

    private setSelectedKey(key: string): void {
        let changed = false;
        let current = this.parentByKey.get(key) ?? null;
        while (current) {
            const currentEl = this.elementByKey.get(current);
            const currentOid = currentEl?.getAttribute(OID_ATTR);
            if (currentOid && this.collapsedOids.delete(currentOid)) changed = true;
            current = this.parentByKey.get(current) ?? null;
        }
        if (changed) this.render();
        this.selectedKey = key;
        this.shadow.querySelectorAll('.tree-node').forEach(n => {
            const isSelected = (n as HTMLElement).dataset.key === key;
            n.classList.toggle('selected', isSelected);
            if (isSelected) (n as HTMLElement).scrollIntoView({ block: 'nearest' });
        });
    }

    /** Rebuild the tree (call after DOM changes). */
    refresh(): void { this.render(); }

    private render(): void {
        const roots = buildTree(document.body);
        this.parentByOid = new Map();
        this.parentByKey = new Map();
        this.elementByKey = new Map();
        const visitWithKey = (nodes: TreeNode[], parentKey: string | null, parentOid: string | null) => {
            nodes.forEach(node => {
                this.parentByOid.set(node.oid, parentOid);
                this.parentByKey.set(node.key, parentKey);
                this.elementByKey.set(node.key, node.el);
                this.keyByElement.set(node.el, node.key);
                visitWithKey(node.children, node.key, node.oid);
            });
        };
        visitWithKey(roots, null, null);
        const style = document.createElement('style');
        style.textContent = CSS;

        const filteredRoots = this.filterNodes(roots);
        const bodyHtml = filteredRoots.length
            ? this.renderNodes(filteredRoots)
            : `<div id="empty">${t('layerEmpty')}</div>`;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="layer-panel">
            <div id="layer-header">
              <span class="layer-title">${t('layerTitle')}</span>
              <div class="layer-header-actions">
                <button class="icon-btn" id="refresh-btn" title="${t('layerRefresh')}">↺</button>
                <button class="icon-btn" id="layer-close" title="${t('layerClose')}">×</button>
              </div>
            </div>
            <div class="search-wrap">
              <input class="search-input" id="layer-search" placeholder="${t('layerSearchPlaceholder')}" value="${this.escapeHtml(this.searchValue)}" autocomplete="off" spellcheck="false" />
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

    private renderNodes(nodes: FilteredTreeNode[]): string {
        return nodes.map(({ el, oid, key, children, depth }, index) => {
            const tag        = el.tagName.toLowerCase();
            const label      = getLabel(el);
            const icon       = getTagIcon(tag);
            const hasKids    = children.length > 0;
            const collapsed  = this.collapsedOids.has(oid);
            const selected   = key === this.selectedKey;
            const indent     = depth * 14;
            const toggleCls  = hasKids ? (collapsed ? 'toggle-btn collapsed' : 'toggle-btn') : 'toggle-btn leaf';
            const canMoveUp = index > 0;
            const canMoveDown = index < nodes.length - 1;
            const isComponentRoot = this.callbacks.isComponentRoot?.(oid) ?? false;

            return `
              <div class="tree-node${selected ? ' selected' : ''}" data-oid="${oid}" data-key="${key}" draggable="true"
                   style="padding-left:${8 + indent}px">
                <span class="${toggleCls}" data-toggle="${oid}"></span>
                <span class="node-icon">${icon}</span>
                ${isComponentRoot ? `<span class="component-badge" title="${t('layerComponentRoot')}">C</span>` : ''}
                <span class="node-label" title="${label.replace(/"/g, '&quot;')}">${label}</span>
                <span class="node-tag">${tag}</span>
                <span class="node-actions">
                  <button class="node-action" data-move="up" data-key="${key}" ${canMoveUp ? '' : 'disabled'} title="${t('layerMoveUp')}">↑</button>
                  <button class="node-action" data-move="down" data-key="${key}" ${canMoveDown ? '' : 'disabled'} title="${t('layerMoveDown')}">↓</button>
                </span>
              </div>
              ${hasKids
                ? `<div class="children-wrap${collapsed ? ' hidden' : ''}" data-kids="${oid}">${this.renderNodes(children)}</div>`
                : ''}`;
        }).join('');
    }

    private filterNodes(nodes: TreeNode[]): FilteredTreeNode[] {
        const q = this.query.trim().toLowerCase();
        if (!q) return nodes as FilteredTreeNode[];
        const visit = (node: TreeNode): FilteredTreeNode | null => {
            const children = node.children.map(visit).filter(Boolean) as FilteredTreeNode[];
            const tag = node.el.tagName.toLowerCase();
            const label = getLabel(node.el).toLowerCase();
            if (label.includes(q) || tag.includes(q) || children.length) {
                return { ...node, children };
            }
            return null;
        };
        return nodes.map(visit).filter(Boolean) as FilteredTreeNode[];
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        this.shadow.querySelector('#layer-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.callbacks.onClose?.();
        });
        const searchInput = this.shadow.querySelector('#layer-search') as HTMLInputElement | null;
        searchInput?.addEventListener('input', () => {
            const cursor = searchInput.selectionStart ?? searchInput.value.length;
            this.searchValue = searchInput.value;
            this.query = this.searchValue.trim().toLowerCase();
            this.render();
            const nextInput = this.shadow.querySelector('#layer-search') as HTMLInputElement | null;
            nextInput?.focus();
            nextInput?.setSelectionRange(cursor, cursor);
        });
        searchInput?.focus();
        searchInput?.setSelectionRange(this.searchValue.length, this.searchValue.length);

        // Node clicks
        this.shadow.querySelectorAll('.tree-node').forEach(nodeEl => {
            nodeEl.addEventListener('dragstart', (e) => {
                const event = e as DragEvent;
                const key = (nodeEl as HTMLElement).dataset.key ?? '';
                this.draggingKey = key;
                (nodeEl as HTMLElement).classList.add('dragging');
                event.dataTransfer?.setData('text/plain', key);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            });
            nodeEl.addEventListener('dragend', () => {
                this.draggingKey = '';
                this.shadow.querySelectorAll('.tree-node').forEach(el => el.classList.remove('dragging', 'drop-target'));
            });
            nodeEl.addEventListener('dragover', (e) => {
                const event = e as DragEvent;
                if (!this.draggingKey) return;
                const targetKey = (nodeEl as HTMLElement).dataset.key ?? '';
                if (!targetKey || targetKey === this.draggingKey) return;
                event.preventDefault();
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
                this.shadow.querySelectorAll('.tree-node.drop-target').forEach(el => {
                    if (el !== nodeEl) el.classList.remove('drop-target');
                });
                (nodeEl as HTMLElement).classList.add('drop-target');
            });
            nodeEl.addEventListener('dragleave', () => {
                (nodeEl as HTMLElement).classList.remove('drop-target');
            });
            nodeEl.addEventListener('drop', (e) => {
                const event = e as DragEvent;
                event.preventDefault();
                event.stopPropagation();
                const sourceKey = event.dataTransfer?.getData('text/plain') || this.draggingKey;
                const targetKey = (nodeEl as HTMLElement).dataset.key ?? '';
                this.shadow.querySelectorAll('.tree-node').forEach(el => el.classList.remove('dragging', 'drop-target'));
                this.draggingKey = '';
                if (!sourceKey || !targetKey || sourceKey === targetKey) return;
                const sourceEl = this.elementByKey.get(sourceKey);
                const targetEl = this.elementByKey.get(targetKey);
                const sourceOid = sourceEl?.getAttribute(OID_ATTR) ?? '';
                const targetOid = targetEl?.getAttribute(OID_ATTR) ?? '';
                if (sourceEl && targetEl && sourceOid && targetOid) {
                    this.callbacks.onMoveToContainer?.(sourceEl, sourceOid, targetEl, targetOid);
                }
            });
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
                const key    = (nodeEl as HTMLElement).dataset.key ?? '';
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

                if (target.dataset.move === 'up' || target.dataset.move === 'down') {
                    const moveKey = target.dataset.key ?? key;
                    const moveEl = this.elementByKey.get(moveKey);
                    if (moveEl) this.callbacks.onMove?.(moveEl, oid, target.dataset.move);
                    return;
                }

                // Select element
                const el = this.elementByKey.get(key);
                if (el) {
                    this.setSelectedKey(key);
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
