/* -----------------------------------------------------------------------
   Component Browser Panel — Visual Edit Kit
   Lists all project components fetched from the bridge and lets the user:
   - Search by name
   - Open the source file in VS Code
   - Find instances on the current page (highlights via overlay)
   ----------------------------------------------------------------------- */

import { attachDrag } from './drag-util';

const BRIDGE = 'http://localhost:5179';
const OID_ATTR = 'data-oid';

interface ComponentInfo {
    name: string;
    relPath: string;
    filePath: string;
    exports: string[];
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
.action-btn.find-btn:hover { background: #0d9488; border-color: #0d9488; }
.badge-on-page { background: #1e3a1e; color: #4ade80; border-color: #15803d; font-size: 9px; padding: 2px 5px; border-radius: 3px; border: 1px solid; }
#empty { padding: 28px; text-align: center; color: #444; font-size: 11px; line-height: 1.6; }
.state-msg { padding: 28px; text-align: center; font-size: 11px; line-height: 1.6; }
.state-loading { color: #555; }
.state-error   { color: #f87171; }
`;

/* ── ComponentsPanel class ──────────────────────────────────────────────── */
export interface ComponentsPanelCallbacks {
    /** Called when the user clicks "Find" — scroll to or highlight element */
    onFind: (oids: string[]) => void;
}

export class ComponentsPanel {
    static readonly HOST_ID = 've-components-host';

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private callbacks: ComponentsPanelCallbacks;
    private components: ComponentInfo[] = [];
    private query = '';
    private dragCleanup: (() => void) | null = null;

    constructor(callbacks: ComponentsPanelCallbacks) {
        this.callbacks = callbacks;
        document.querySelectorAll(`#${ComponentsPanel.HOST_ID}`).forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = ComponentsPanel.HOST_ID;
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
        this.renderState('loading');
        this.loadComponents();
    }

    private renderState(state: 'loading' | 'error', msg = ''): void {
        this.shadow.innerHTML = '';
        const style = document.createElement('style');
        style.textContent = CSS;
        const messages: Record<string, string> = {
            loading: 'Carregando componentes…',
            error:   msg || 'Bridge offline.',
        };
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="comp-panel">
            <div id="comp-header"><span class="comp-title">Componentes</span></div>
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
            this.render();
        } catch {
            this.renderState('error', 'Bridge offline — inicie o bridge com `visual-edit-bridge`.');
        }
    }

    private getOnPageOids(filePath: string): string[] {
        // Find all DOM elements whose OID was generated from this component's file.
        // We do this by fetching /oids and checking which oids' file matches.
        // For now, we use a simpler approach: look for data-oid elements that
        // are instances of this component on the current page.
        // (The bridge's /oids endpoint maps oid → {file, line})
        return []; // populated after /oids fetch — see findOnPage()
    }

    private render(): void {
        const filtered = this.query
            ? this.components.filter(c =>
                c.name.toLowerCase().includes(this.query) ||
                c.relPath.toLowerCase().includes(this.query))
            : this.components;

        const style = document.createElement('style');
        style.textContent = CSS;

        const items = filtered.map(c => {
            const initial = c.name[0]?.toUpperCase() ?? '?';
            return `
              <div class="comp-item" data-name="${c.name}" data-file="${c.filePath}" data-relpath="${c.relPath}">
                <div class="comp-icon">${initial}</div>
                <div class="comp-info">
                  <div class="comp-name">${c.name}</div>
                  <div class="comp-path">${c.relPath}</div>
                </div>
                <div class="comp-actions">
                  <button class="action-btn find-btn" data-file="${c.filePath}" title="Destacar na página">⌖</button>
                  <button class="action-btn open-btn" data-file="${c.filePath}" title="Abrir no editor">↗</button>
                </div>
              </div>`;
        }).join('');

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="comp-panel">
            <div id="comp-header">
              <span class="comp-title">Componentes</span>
              <span class="comp-count">${this.components.length}</span>
            </div>
            <div class="search-wrap">
              <input class="search-input" id="comp-search" placeholder="Buscar componente…" value="${this.query}" autocomplete="off" spellcheck="false" />
            </div>
            <div id="comp-body">
              ${filtered.length ? items : '<div id="empty">Nenhum componente encontrado.</div>'}
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
            this.query = searchInput.value.trim().toLowerCase();
            this.render();
        });
        searchInput?.focus();

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

        // Find on page — highlight all instances
        this.shadow.querySelectorAll('.find-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = (btn as HTMLElement).dataset.file ?? '';
                // Fetch the oid index and find all oids from this file
                try {
                    const res  = await fetch(`${BRIDGE}/oids`);
                    const data = await res.json() as { entries: Array<{ oid: string; file: string }> };
                    const oids = data.entries
                        .filter(entry => entry.file === filePath.split('/').pop() ||
                                        filePath.endsWith(entry.file))
                        .map(e => e.oid)
                        // Only those that exist in the current DOM
                        .filter(oid => !!document.querySelector(`[${OID_ATTR}="${oid}"]`));
                    this.callbacks.onFind(oids);
                } catch { /* bridge offline */ }
            });
        });
    }

    destroy(): void { this.dragCleanup?.(); this.host.remove(); }
}
