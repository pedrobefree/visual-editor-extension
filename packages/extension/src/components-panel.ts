/* -----------------------------------------------------------------------
   Component Browser Panel — Visual Edit Kit
   Lists all project components fetched from the bridge and lets the user:
   - Search by name
   - Edit instances that are present on the current page
   - Open the source file in VS Code as a secondary action
   ----------------------------------------------------------------------- */

import { attachDrag } from './drag-util';
import { subscribeLanguageChange, t } from './i18n';

const BRIDGE = 'http://localhost:5179';
const OID_ATTR = 'data-oid';

interface ComponentInfo {
    name: string;
    relPath: string;
    filePath: string;
    exports: string[];
}

interface ComponentPresence {
    oids: string[];
    count: number;
}

function attrSelectorValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function topLevelMatches(elements: HTMLElement[]): HTMLElement[] {
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

/* ── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#comp-panel {
  position: fixed; top: 52px; left: 280px; z-index: 2147483645;
  width: 280px; max-height: calc(100vh - 68px);
  background: #141414; color: #e5e5e5;
  border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column;
  font-size: 12px; overflow: hidden;
}
#comp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border-bottom: 1px solid #222;
  background: #1a1a1a; flex-shrink: 0;
  cursor: grab; user-select: none;
}
.comp-title { font-size: 10px; font-weight: 600; color: #666; letter-spacing: .08em; text-transform: uppercase; }
.comp-count { font-size: 10px; color: #444; }
.search-wrap { padding: 8px 12px; border-bottom: 1px solid #1e1e1e; flex-shrink: 0; }
.search-input {
  width: 100%; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
  color: #e5e5e5; padding: 5px 9px; font-size: 11px; outline: none;
}
.search-input:focus { border-color: #6366f1; }
#comp-body { overflow-y: auto; flex: 1; }
#comp-body::-webkit-scrollbar { width: 3px; }
#comp-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
.comp-item {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-bottom: 1px solid #1a1a1a; cursor: default;
}
.comp-item.on-page { background: rgba(20,184,166,.05); }
.comp-item:hover { background: #1a1a1a; }
.comp-icon { width: 26px; height: 26px; border-radius: 6px; background: #1e1e3a; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #818cf8; font-weight: 700; }
.comp-info { flex: 1; min-width: 0; }
.comp-name { font-size: 11px; color: #e5e5e5; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.comp-path { font-size: 9px; color: #555; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.comp-actions { display: flex; gap: 4px; flex-shrink: 0; }
.action-btn {
  padding: 3px 7px; border-radius: 4px; cursor: pointer; border: 1px solid #2a2a2a;
  background: #1e1e1e; color: #777; font-size: 10px; transition: all .1s; white-space: nowrap;
}
.action-btn:hover { background: #6366f1; border-color: #6366f1; color: white; }
.action-btn.edit-btn { background: #134e4a; border-color: #0f766e; color: #99f6e4; }
.action-btn.edit-btn:hover { background: #0d9488; border-color: #0d9488; color: white; }
.action-btn.preview-btn { background: #1e1e3a; border-color: #3730a3; color: #c7d2fe; }
.action-btn.preview-btn:hover { background: #4f46e5; border-color: #4f46e5; color: white; }
.action-btn:disabled { opacity: .35; cursor: not-allowed; background: #1e1e1e; border-color: #2a2a2a; color: #666; }
.badge-on-page { background: #1e3a1e; color: #4ade80; border-color: #15803d; font-size: 9px; padding: 2px 5px; border-radius: 3px; border: 1px solid; margin-top: 4px; display: inline-flex; }
.section-label { padding: 8px 12px 4px; color: #555; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1px solid #1a1a1a; }
#empty { padding: 28px; text-align: center; color: #444; font-size: 11px; line-height: 1.6; }
.state-msg { padding: 28px; text-align: center; font-size: 11px; line-height: 1.6; }
.state-loading { color: #555; }
.state-error   { color: #f87171; }
`;

/* ── ComponentsPanel class ──────────────────────────────────────────────── */
export interface ComponentsPanelCallbacks {
    /** Called when the user asks to edit/highlight instances on the active page. */
    onEditInstances: (oids: string[], componentName: string) => void;
    /** Called when the user asks to open an off-page component preview in the browser. */
    onOpenPreview: (path: string, componentName: string) => void;
}

export class ComponentsPanel {
    static readonly HOST_ID = 've-components-host';

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private callbacks: ComponentsPanelCallbacks;
    private components: ComponentInfo[] = [];
    private presenceByFile = new Map<string, ComponentPresence>();
    private query = '';
    private searchValue = '';
    private dragCleanup: (() => void) | null = null;
    private state: 'loading' | 'error' | 'ready' = 'loading';
    private stateMessage = '';
    private unsubscribeLanguage: (() => void) | null = null;

    constructor(callbacks: ComponentsPanelCallbacks) {
        this.callbacks = callbacks;
        document.querySelectorAll(`#${ComponentsPanel.HOST_ID}`).forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = ComponentsPanel.HOST_ID;
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
        this.unsubscribeLanguage = subscribeLanguageChange(() => {
            if (this.state === 'ready') this.render();
            else this.renderState(this.state, this.stateMessage);
        });
        this.renderState('loading');
        this.loadComponents();
    }

    private renderState(state: 'loading' | 'error', msg = ''): void {
        this.state = state;
        this.stateMessage = msg;
        this.shadow.innerHTML = '';
        const style = document.createElement('style');
        style.textContent = CSS;
        const messages: Record<string, string> = {
            loading: t('componentsLoading'),
            error:   msg || t('componentsError'),
        };
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="comp-panel">
            <div id="comp-header"><span class="comp-title">${t('componentsTitle')}</span></div>
            <div id="comp-body"><div class="state-msg state-${state}">${messages[state]}</div></div>
          </div>`;
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.blockEvents();
        this.attachDragToPanelAndHeader();
    }

    private async loadComponents(): Promise<void> {
        try {
            const res  = await fetch(`${BRIDGE}/components`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json() as { ok: boolean; components?: ComponentInfo[]; error?: string };
            if (!data.ok || !data.components) { this.renderState('error', data.error); return; }
            this.components = data.components;
            await this.loadPresence();
            this.state = 'ready';
            this.render();
        } catch {
            this.renderState('error', t('componentsBridgeOffline'));
        }
    }

    private async loadPresence(): Promise<void> {
        try {
            const res = await fetch(`${BRIDGE}/oids`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json() as { entries: Array<{ oid: string; file: string }> };
            this.presenceByFile.clear();

            for (const component of this.components) {
                const oids = data.entries
                    .filter(entry => this.fileMatches(component.filePath, entry.file))
                    .map(entry => entry.oid)
                    .filter((oid, index, arr) => arr.indexOf(oid) === index);

                const elements = oids.flatMap(oid => {
                    return Array.from(document.querySelectorAll<HTMLElement>(`[${OID_ATTR}="${attrSelectorValue(oid)}"]`));
                });
                const count = topLevelMatches(elements).length;

                if (count > 0) this.presenceByFile.set(component.filePath, { oids, count });
            }
        } catch {
            this.presenceByFile.clear();
        }
    }

    private fileMatches(filePath: string, indexedFile: string): boolean {
        return filePath === indexedFile ||
            filePath.endsWith(indexedFile) ||
            indexedFile === filePath.split('/').pop();
    }

    private render(): void {
        const filteredRaw = this.query
            ? this.components.filter(c =>
                c.name.toLowerCase().includes(this.query) ||
                c.relPath.toLowerCase().includes(this.query))
            : this.components;

        const filtered = [...filteredRaw].sort((a, b) => {
            const aCount = this.presenceByFile.get(a.filePath)?.count ?? 0;
            const bCount = this.presenceByFile.get(b.filePath)?.count ?? 0;
            if (aCount !== bCount) return bCount - aCount;
            return a.name.localeCompare(b.name);
        });

        const style = document.createElement('style');
        style.textContent = CSS;

        const itemHtml = (c: ComponentInfo) => {
            const initial = c.name[0]?.toUpperCase() ?? '?';
            const presence = this.presenceByFile.get(c.filePath);
            const count = presence?.count ?? 0;
            return `
              <div class="comp-item${count ? ' on-page' : ''}" data-name="${c.name}" data-file="${c.filePath}" data-relpath="${c.relPath}">
                <div class="comp-icon">${initial}</div>
                <div class="comp-info">
                  <div class="comp-name">${c.name}</div>
                  <div class="comp-path">${c.relPath}</div>
                  ${count ? `<span class="badge-on-page">${t('componentsOnPageCount', { count })}</span>` : ''}
                </div>
                <div class="comp-actions">
                  ${count
                    ? `<button class="action-btn edit-btn" data-file="${c.filePath}" data-name="${c.name}" title="${t('componentsEditTitle')}">${t('componentsEdit')}</button>`
                    : `<button class="action-btn preview-btn" data-file="${c.filePath}" data-name="${c.name}" title="${t('componentsPreviewTitle')}">${t('componentsBrowser')}</button>`}
                  <button class="action-btn open-btn" data-file="${c.filePath}" title="${t('componentsOpenEditorTitle')}">↗</button>
                </div>
              </div>`;
        };

        const onPage = filtered.filter(c => (this.presenceByFile.get(c.filePath)?.count ?? 0) > 0);
        const offPage = filtered.filter(c => (this.presenceByFile.get(c.filePath)?.count ?? 0) === 0);
        const items = [
            onPage.length ? `<div class="section-label">${t('componentsActivePage')}</div>${onPage.map(itemHtml).join('')}` : '',
            offPage.length ? `<div class="section-label">${t('componentsOther')}</div>${offPage.map(itemHtml).join('')}` : '',
        ].join('');

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div id="comp-panel">
            <div id="comp-header">
              <span class="comp-title">${t('componentsTitle')}</span>
              <span class="comp-count">${this.components.length}</span>
            </div>
            <div class="search-wrap">
              <input class="search-input" id="comp-search" placeholder="${t('componentsSearchPlaceholder')}" value="${this.searchValue.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" autocomplete="off" spellcheck="false" />
            </div>
            <div id="comp-body">
              ${filtered.length ? items : `<div id="empty">${t('componentsEmpty')}</div>`}
            </div>
          </div>`;

        this.shadow.innerHTML = '';
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.bindEvents();
        this.attachDragToPanelAndHeader();
    }

    private blockEvents(): void {
        const panel = this.shadow.querySelector('#comp-panel');
        if (panel) {
            ['click','mousedown','pointerdown'].forEach(ev =>
                panel.addEventListener(ev, (e: Event) => e.stopPropagation()));
        }
    }

    private attachDragToPanelAndHeader(): void {
        this.dragCleanup?.();
        const headerEl = this.shadow.querySelector('#comp-header') as HTMLElement | null;
        const panelEl  = this.shadow.querySelector('#comp-panel') as HTMLElement | null;
        if (headerEl && panelEl) this.dragCleanup = attachDrag(panelEl, headerEl);
    }

    private bindEvents(): void {
        this.blockEvents();

        // Search
        const searchInput = this.shadow.querySelector('#comp-search') as HTMLInputElement | null;
        searchInput?.addEventListener('input', () => {
            const cursor = searchInput.selectionStart ?? searchInput.value.length;
            this.searchValue = searchInput.value;
            this.query = this.searchValue.trim().toLowerCase();
            this.render();
            const nextInput = this.shadow.querySelector('#comp-search') as HTMLInputElement | null;
            nextInput?.focus();
            nextInput?.setSelectionRange(cursor, cursor);
        });
        searchInput?.focus();
        searchInput?.setSelectionRange(this.searchValue.length, this.searchValue.length);

        // Open in editor
        this.shadow.querySelectorAll('.open-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = (btn as HTMLElement).dataset.file ?? '';
                await fetch(`${BRIDGE}/open-file`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath }),
                }).catch(() => {});
            });
        });

        // Edit in browser — highlight all instances and select the first one.
        this.shadow.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = (btn as HTMLElement).dataset.file ?? '';
                const name = (btn as HTMLElement).dataset.name ?? '';
                const presence = this.presenceByFile.get(filePath);
                if (!presence?.count) return;
                this.callbacks.onEditInstances(presence.oids, name);
            });
        });

        // Open off-page component in a browser preview route.
        this.shadow.querySelectorAll('.preview-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = (btn as HTMLElement).dataset.file ?? '';
                const name = (btn as HTMLElement).dataset.name ?? '';
                try {
                    const res = await fetch(`${BRIDGE}/component-preview`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath, name }),
                    });
                    const data = await res.json() as { ok: boolean; path?: string; error?: string };
                    if (!data.ok || !data.path) throw new Error(data.error ?? t('componentsPreviewUnavailable'));
                    this.callbacks.onOpenPreview(data.path, name);
                } catch {
                    // The editor-open button remains available as the fallback.
                }
            });
        });
    }

    destroy(): void { this.unsubscribeLanguage?.(); this.dragCleanup?.(); this.host.remove(); }
}
