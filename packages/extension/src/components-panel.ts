/* -----------------------------------------------------------------------
   Component Browser Panel — Visual Edit Kit
   Lists all project components fetched from the bridge and lets the user:
   - Search by name
   - Edit instances that are present on the current page
   - Open the source file in VS Code as a secondary action
   ----------------------------------------------------------------------- */

import { attachDrag } from './drag-util';
import { subscribeLanguageChange, t } from './i18n';
import { resolveShadcnInstallErrorMessage, resolveShadcnListErrorMessage } from './shadcn-errors';
import { captureFocusSnapshot, shouldAutofocusProjectSearch, type FocusSnapshot } from './components-panel-focus';

const BRIDGE = 'http://localhost:5179';
const OID_ATTR = 'data-oid';

interface ComponentInfo {
    name: string;
    relPath: string;
    filePath: string;
    exports: string[];
    origin?: 'visual-edit' | 'project';
}

interface ComponentPresence {
    oids: string[];
    count: number;
}

interface PagePattern {
    id: string;
    kind: 'app' | 'pages';
    label: string;
    routeGroup?: string;
    isDefault?: boolean;
}

interface ShadcnRegistryItem {
    name: string;
    type: string;
    registry: string;
    addCommandArgument: string;
}

export interface PreviewErrorPayload {
    code?: 'missing-preview-dependencies';
    error?: string;
    missingDependencies?: string[];
    installCommand?: string;
    packageManager?: 'bun' | 'pnpm' | 'yarn' | 'npm';
}

function attrSelectorValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
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
  width: 280px; height: min(760px, calc(100vh - 68px)); min-width: 240px; min-height: 220px; max-width: calc(100vw - 24px); max-height: calc(100vh - 68px);
  background: #141414; color: #e5e5e5;
  border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column;
  font-size: 12px; overflow: hidden; resize: both;
}
#comp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border-bottom: 1px solid #222;
  background: #1a1a1a; flex-shrink: 0;
  cursor: grab; user-select: none;
}
.comp-title { font-size: 10px; font-weight: 600; color: #666; letter-spacing: .08em; text-transform: uppercase; }
.comp-count { font-size: 10px; color: #444; }
.comp-header-actions { display:flex; align-items:center; gap:8px; }
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
#comp-body { overflow-y: auto; flex: 1; }
#comp-body::-webkit-scrollbar { width: 3px; }
#comp-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
.comp-item {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; border-bottom: 1px solid #1a1a1a; cursor: default;
}
.comp-item.on-page { background: rgba(20,184,166,.05); }
.comp-item:hover { background: #1a1a1a; }
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
.action-btn.delete-btn { background: #1e1e1e; border-color: #2a2a2a; color: #777; font-size: 11px; padding: 3px 6px; line-height: 1; }
.action-btn.delete-btn:hover { background: #7f1d1d; border-color: #dc2626; color: #fff; }
.action-btn.dup-btn { background: #1e1e1e; border-color: #2a2a2a; color: #777; font-size: 11px; padding: 3px 6px; line-height: 1; }
.action-btn.dup-btn:hover { background: #1e293b; border-color: #6366f1; color: #a5b4fc; }
.confirm-row { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.confirm-label { font-size: 9px; color: #f87171; white-space: nowrap; }
.action-btn.danger { background: #7f1d1d; border-color: #dc2626; color: #fca5a5; }
.action-btn.danger:hover { background: #dc2626; border-color: #dc2626; color: white; }
.dup-form { display: flex; align-items: center; gap: 4px; width: 100%; padding: 4px 0; }
.dup-input { flex: 1; min-width: 0; background: #0d0d0d; border: 1px solid #3730a3; border-radius: 4px; color: #c7d2fe; font-size: 10px; padding: 3px 6px; outline: none; }
.dup-input:focus { border-color: #6366f1; }
.action-btn.dup-confirm { background: #1e1b4b; border-color: #4338ca; color: #c7d2fe; }
.action-btn.dup-confirm:hover { background: #4338ca; border-color: #4338ca; color: white; }
.badge-on-page { background: #1e3a1e; color: #4ade80; border-color: #15803d; font-size: 9px; padding: 2px 5px; border-radius: 3px; border: 1px solid; margin-top: 4px; display: inline-flex; }
.badge-visual-edit { background: #1e1b4b; color: #a5b4fc; border-color: #3730a3; font-size: 9px; padding: 2px 5px; border-radius: 3px; border: 1px solid; margin-top: 4px; display: inline-flex; }
#preset-form { padding: 10px 12px; border-bottom: 1px solid #252525; background: #0d0d0d; display: flex; flex-direction: column; gap: 6px; }
#preset-form .preset-row { display: flex; gap: 6px; align-items: center; }
#preset-form select, #preset-form input { flex: 1; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; color: #e5e5e5; font-size: 11px; padding: 4px 8px; outline: none; }
#preset-form select:focus, #preset-form input:focus { border-color: #6366f1; }
#preset-form .preset-actions { display: flex; gap: 6px; justify-content: flex-end; }
.icon-btn.create-btn { font-size: 15px; color: #a5b4fc; border-color: #3730a3; }
.icon-btn.create-btn:hover { color: white; border-color: #6366f1; background: #1e1b4b; }
.icon-btn.create-btn.active { color: white; border-color: #6366f1; background: #1e1b4b; }
.section-label { padding: 8px 12px 4px; color: #555; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1px solid #1a1a1a; }
#preset-form .preset-help { color: #666; font-size: 10px; line-height: 1.4; }
.shadcn-results { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.shadcn-item { border: 1px solid #262626; border-radius: 8px; padding: 8px; background: #121212; }
.shadcn-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.shadcn-name { color: #e5e5e5; font-size: 11px; font-weight: 600; }
.shadcn-type { color: #a5b4fc; font-size: 9px; border: 1px solid #3730a3; border-radius: 999px; padding: 2px 6px; text-transform: uppercase; letter-spacing: .04em; }
.shadcn-arg { color: #666; font-size: 9px; font-family: monospace; margin-top: 4px; }
.shadcn-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.action-btn.install-btn { background: #1e1b4b; border-color: #4338ca; color: #c7d2fe; }
.action-btn.install-btn:hover { background: #4338ca; border-color: #4338ca; color: white; }
.action-btn.install-btn:disabled { background: #1e1e1e; border-color: #2a2a2a; color: #666; }
.shadcn-feedback { margin-top: 6px; font-size: 10px; line-height: 1.4; }
.shadcn-feedback.error { color: #fca5a5; }
.shadcn-feedback.success { color: #86efac; }
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
    /** Called when preview generation fails and the host should surface the reason. */
    onPreviewError?: (error: PreviewErrorPayload) => void;
    /** Called in insertion mode when the user picks a component to insert. */
    onInsertComponent?: (component: ComponentInfo) => void;
    onPageCreated?: (routePath: string) => void;
    onClose?: () => void;
    mode?: 'browse' | 'insert';
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
    private mode: 'browse' | 'insert';
    private deleteFilePath: string | null = null;
    private duplicateFilePath: string | null = null;
    private showCreateForm = false;
    private createMode: 'preset' | 'page' | 'shadcn' = 'preset';
    private presets: Array<{ kind: string; label: string; description: string }> = [];
    private pagePatterns: PagePattern[] = [];
    private shadcnItems: ShadcnRegistryItem[] = [];
    private shadcnQuery = '';
    private shadcnLoading = false;
    private shadcnError = '';
    private shadcnInstallArg = '';
    private shadcnInstallFeedback = '';
    private shadcnInstallFeedbackTone: 'success' | 'error' | '' = '';

    constructor(callbacks: ComponentsPanelCallbacks) {
        this.callbacks = callbacks;
        this.mode = callbacks.mode ?? 'browse';
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
            <div id="comp-header">
              <span class="comp-title">${this.mode === 'insert' ? t('componentsInsertTitle') : t('componentsTitle')}</span>
              <button class="icon-btn" id="comp-close" title="${t('componentsClose')}">×</button>
            </div>
            <div id="comp-body"><div class="state-msg state-${state}">${messages[state]}</div></div>
          </div>`;
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.blockEvents();
        this.attachDragToPanelAndHeader();
    }

    private async loadComponents(): Promise<void> {
        try {
            await Promise.all([
                this.reloadComponentsList(),
                this.loadPresets(),
                this.loadPagePatterns(),
                this.loadShadcnItems(),
            ]);
            this.state = 'ready';
            this.render();
        } catch {
            this.renderState('error', t('componentsBridgeOffline'));
        }
    }

    private async reloadComponentsList(): Promise<void> {
        const res = await fetch(`${BRIDGE}/components`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json() as { ok: boolean; components?: ComponentInfo[]; error?: string };
        if (!data.ok || !data.components) throw new Error(data.error ?? t('componentsError'));
        this.components = data.components;
        await this.loadPresence();
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
        const focusSnapshot = captureFocusSnapshot(this.shadow.activeElement);
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
            const presence = this.presenceByFile.get(c.filePath);
            const count = presence?.count ?? 0;
            const isConfirming = this.deleteFilePath === c.filePath;
            const isDuplicating = this.duplicateFilePath === c.filePath;
            const actionsHtml = isConfirming
                ? `<div class="confirm-row">
                     <span class="confirm-label">${t('componentsDelete')}?</span>
                     <button class="action-btn danger" data-delete-confirm="${c.filePath}" title="${t('componentsDeleteConfirm')}">${t('componentsDeleteConfirm')}</button>
                     <button class="action-btn" data-delete-cancel title="${t('componentsDeleteCancel')}">✕</button>
                   </div>`
                : isDuplicating
                ? `<div class="dup-form">
                     <input class="dup-input" id="dup-name-input" type="text" value="${c.name}Copy" spellcheck="false" data-source-file="${c.filePath}" />
                     <button class="action-btn dup-confirm" data-dup-confirm="${c.filePath}" title="${t('componentsDupConfirm')}">${t('componentsDupConfirm')}</button>
                     <button class="action-btn" data-dup-cancel title="${t('componentsDeleteCancel')}">✕</button>
                   </div>`
                : `${this.mode === 'insert'
                    ? `<button class="action-btn insert-btn" data-file="${c.filePath}" data-name="${c.name}" title="${t('componentsInsertTitle')}">${t('componentsInsert')}</button>`
                    : count
                    ? `<button class="action-btn edit-btn" data-file="${c.filePath}" data-name="${c.name}" title="${t('componentsEditTitle')}">${t('componentsEdit')}</button>`
                    : `<button class="action-btn preview-btn" data-file="${c.filePath}" data-name="${c.name}" title="${t('componentsPreviewTitle')}">${t('componentsBrowser')}</button>`}
                  <button class="action-btn open-btn" data-file="${c.filePath}" title="${t('componentsOpenEditorTitle')}">↗</button>
                  ${this.mode !== 'insert' ? `<button class="action-btn dup-btn" data-dup-start="${c.filePath}" title="${t('componentsDupTitle')}">⎘</button>` : ''}
                  ${this.mode !== 'insert' ? `<button class="action-btn delete-btn" data-delete-start="${c.filePath}" title="${t('componentsDeleteTitle')}" aria-label="${t('componentsDeleteTitle')}">✕</button>` : ''}`;
            return `
              <div class="comp-item${count ? ' on-page' : ''}" data-name="${c.name}" data-file="${c.filePath}" data-relpath="${c.relPath}">
                <div class="comp-info">
                  <div class="comp-name">${c.name}</div>
                  <div class="comp-path">${c.relPath}</div>
                  ${count ? `<span class="badge-on-page">${t('componentsOnPageCount', { count })}</span>` : ''}
                  ${c.origin === 'visual-edit' && !count ? `<span class="badge-visual-edit">${t('componentsVisualEditBadge')}</span>` : ''}
                </div>
                <div class="comp-actions">${actionsHtml}</div>
              </div>`;
        };

        const onPage = filtered.filter(c => (this.presenceByFile.get(c.filePath)?.count ?? 0) > 0);
        const offPage = filtered.filter(c => (this.presenceByFile.get(c.filePath)?.count ?? 0) === 0);
        const offPageVisual = offPage.filter(c => c.origin === 'visual-edit');
        const offPageProject = offPage.filter(c => c.origin !== 'visual-edit');
        const items = [
            onPage.length ? `<div class="section-label">${t('componentsActivePage')}</div>${onPage.map(itemHtml).join('')}` : '',
            offPageVisual.length ? `<div class="section-label">${t('componentsVisualEditSection')}</div>${offPageVisual.map(itemHtml).join('')}` : '',
            offPageProject.length ? `<div class="section-label">${t('componentsOther')}</div>${offPageProject.map(itemHtml).join('')}` : '',
        ].join('');
        const shadcnResultsHtml = this.shadcnLoading
            ? `<div class="state-msg state-loading">${t('componentsShadcnLoading')}</div>`
            : this.shadcnError
            ? `<div class="state-msg state-error">${this.shadcnError}</div>`
            : this.shadcnItems.length
            ? this.shadcnItems.map(item => `
                <div class="shadcn-item">
                  <div class="shadcn-top">
                    <div class="shadcn-name">${escapeHtml(item.name)}</div>
                    <div class="shadcn-type">${item.type.replace('registry:', '')}</div>
                  </div>
                  <div class="shadcn-arg">${escapeHtml(item.addCommandArgument)}</div>
                  <div class="shadcn-actions">
                    <button
                      class="action-btn install-btn"
                      data-shadcn-install="${escapeHtml(item.addCommandArgument)}"
                      ${this.shadcnInstallArg === item.addCommandArgument ? 'disabled' : ''}
                    >${this.shadcnInstallArg === item.addCommandArgument ? t('componentsShadcnInstalling') : t('componentsShadcnInstall')}</button>
                  </div>
                </div>
            `).join('')
            : `<div class="state-msg state-loading">${t('componentsShadcnEmpty')}</div>`;
        const createFormBody = this.createMode === 'preset'
            ? `
              <div class="preset-row">
                <select id="preset-kind">
                  ${this.presets.map(p => `<option value="${p.kind}" title="${p.description}">${p.label}</option>`).join('')}
                </select>
                <input id="preset-name" type="text" placeholder="${t('componentsPresetNamePlaceholder')}" spellcheck="false" />
              </div>`
            : this.createMode === 'page'
            ? `
              <div class="preset-row">
                <select id="page-pattern">
                  ${this.pagePatterns.map(pattern => `<option value="${pattern.id}"${pattern.isDefault ? ' selected' : ''}>${pattern.label}</option>`).join('')}
                </select>
              </div>
              <div class="preset-row">
                <input id="page-route" type="text" placeholder="${t('componentsPageRoutePlaceholder')}" spellcheck="false" />
              </div>
              <div class="preset-help">${t('componentsPageHelp')}</div>`
            : `
              <div class="preset-row">
                <input id="shadcn-search" type="text" value="${escapeHtml(this.shadcnQuery)}" placeholder="${t('componentsShadcnSearchPlaceholder')}" spellcheck="false" />
              </div>
              <div class="preset-help">${t('componentsShadcnPhaseHint')}</div>
              ${this.shadcnInstallFeedback ? `<div class="shadcn-feedback ${this.shadcnInstallFeedbackTone}">${escapeHtml(this.shadcnInstallFeedback)}</div>` : ''}
              <div class="shadcn-results">${shadcnResultsHtml}</div>`;
        const createFormAction = this.createMode === 'shadcn'
            ? ''
            : `<button class="action-btn dup-confirm" id="preset-submit">${this.createMode === 'preset' ? t('componentsPresetCreate') : t('componentsPageCreate')}</button>`;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div id="comp-panel">
            <div id="comp-header">
                <span class="comp-title">${this.mode === 'insert' ? t('componentsInsertTitle') : t('componentsTitle')}</span>
              <div class="comp-header-actions">
                <span class="comp-count">${this.components.length}</span>
                ${this.mode !== 'insert' ? `<button class="icon-btn create-btn${this.showCreateForm ? ' active' : ''}" id="comp-create-preset" title="${t('componentsCreateTitle')}">+</button>` : ''}
                <button class="icon-btn" id="comp-close" title="${t('componentsClose')}">×</button>
              </div>
            </div>
            ${this.showCreateForm ? `
            <div id="preset-form">
              <div class="preset-row">
                <select id="create-mode">
                  <option value="preset"${this.createMode === 'preset' ? ' selected' : ''}>${t('componentsCreateModePreset')}</option>
                  <option value="page"${this.createMode === 'page' ? ' selected' : ''}>${t('componentsCreateModePage')}</option>
                  <option value="shadcn"${this.createMode === 'shadcn' ? ' selected' : ''}>${t('componentsCreateModeShadcn')}</option>
                </select>
              </div>
              ${createFormBody}
              <div class="preset-actions">
                <button class="action-btn" id="preset-cancel">${t('componentsDeleteCancel')}</button>
                ${createFormAction}
              </div>
            </div>` : ''}
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
        this.restoreFocus(focusSnapshot);
        this.attachDragToPanelAndHeader();
    }

    private restoreFocus(snapshot: FocusSnapshot | null): void {
        if (!snapshot) return;
        const input = this.shadow.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${snapshot.id}`);
        if (!input) return;
        input.focus();
        if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
            input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        }
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
        this.shadow.querySelector('#comp-close')?.addEventListener('click', () => this.callbacks.onClose?.());

        // Preset form toggle
        this.shadow.querySelector('#comp-create-preset')?.addEventListener('click', () => {
            this.showCreateForm = !this.showCreateForm;
            if (this.showCreateForm && !this.presets.length) this.loadPresets();
            if (this.showCreateForm && !this.pagePatterns.length) this.loadPagePatterns();
            if (this.showCreateForm && !this.shadcnItems.length) this.loadShadcnItems();
            this.render();
            if (this.showCreateForm) {
                requestAnimationFrame(() => {
                    const selector = this.createMode === 'preset' ? '#preset-name' : this.createMode === 'page' ? '#page-route' : '#shadcn-search';
                    (this.shadow.querySelector(selector) as HTMLInputElement | null)?.focus();
                });
            }
        });

        // Preset form cancel
        this.shadow.querySelector('#preset-cancel')?.addEventListener('click', () => {
            this.showCreateForm = false;
            this.render();
        });

        this.shadow.querySelector('#create-mode')?.addEventListener('change', (e) => {
            const raw = (e.target as HTMLSelectElement).value;
            const value = raw === 'page' || raw === 'shadcn' ? raw : 'preset';
            this.createMode = value;
            this.shadcnInstallFeedback = '';
            this.shadcnInstallFeedbackTone = '';
            this.render();
            requestAnimationFrame(() => {
                const selector = value === 'preset' ? '#preset-name' : value === 'page' ? '#page-route' : '#shadcn-search';
                (this.shadow.querySelector(selector) as HTMLInputElement | null)?.focus();
            });
        });

        // Preset form submit
        const submitPreset = async () => {
            if (this.createMode === 'preset') {
                const kind = (this.shadow.querySelector('#preset-kind') as HTMLSelectElement | null)?.value;
                const name = (this.shadow.querySelector('#preset-name') as HTMLInputElement | null)?.value.trim();
                if (!kind || !name) return;
                await this.createPresetComponent(kind, name);
                return;
            }
            const patternId = (this.shadow.querySelector('#page-pattern') as HTMLSelectElement | null)?.value;
            const route = (this.shadow.querySelector('#page-route') as HTMLInputElement | null)?.value.trim();
            if (!route) return;
            await this.createPage(route, patternId);
        };
        this.shadow.querySelector('#preset-submit')?.addEventListener('click', submitPreset);
        (this.shadow.querySelector('#preset-name') as HTMLInputElement | null)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitPreset();
            if (e.key === 'Escape') { this.showCreateForm = false; this.render(); }
        });
        (this.shadow.querySelector('#page-route') as HTMLInputElement | null)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitPreset();
            if (e.key === 'Escape') { this.showCreateForm = false; this.render(); }
        });
        (this.shadow.querySelector('#shadcn-search') as HTMLInputElement | null)?.addEventListener('input', (e) => {
            this.shadcnQuery = (e.target as HTMLInputElement).value;
            void this.loadShadcnItems(this.shadcnQuery);
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-shadcn-install]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const addCommandArgument = btn.dataset.shadcnInstall ?? '';
                const item = this.shadcnItems.find(entry => entry.addCommandArgument === addCommandArgument);
                if (!item) return;
                await this.installShadcnItem(item);
            });
        });

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
        if (shouldAutofocusProjectSearch(this.showCreateForm, this.createMode)) {
            searchInput?.focus();
            searchInput?.setSelectionRange(this.searchValue.length, this.searchValue.length);
        }

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

        this.shadow.querySelectorAll('.insert-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const filePath = (btn as HTMLElement).dataset.file ?? '';
                const name = (btn as HTMLElement).dataset.name ?? '';
                const component = this.components.find(item => item.filePath === filePath && item.name === name);
                if (component) this.callbacks.onInsertComponent?.(component);
            });
        });

        // Duplicate start — show inline name input
        this.shadow.querySelectorAll<HTMLElement>('[data-dup-start]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.duplicateFilePath = btn.dataset.dupStart ?? null;
                this.deleteFilePath = null;
                this.render();
                // Focus the input after render
                requestAnimationFrame(() => {
                    const input = this.shadow.querySelector<HTMLInputElement>('#dup-name-input');
                    input?.focus();
                    input?.select();
                });
            });
        });

        // Duplicate cancel
        this.shadow.querySelectorAll<HTMLElement>('[data-dup-cancel]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.duplicateFilePath = null;
                this.render();
            });
        });

        // Duplicate confirm
        this.shadow.querySelectorAll<HTMLElement>('[data-dup-confirm]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = btn.dataset.dupConfirm ?? '';
                const input = this.shadow.querySelector<HTMLInputElement>('#dup-name-input');
                const newName = input?.value.trim() ?? '';
                if (!newName) return;
                await this.duplicateComponentFile(filePath, newName);
            });
        });

        // Allow Enter key in dup-name-input to confirm
        this.shadow.querySelector<HTMLInputElement>('#dup-name-input')?.addEventListener('keydown', async (e) => {
            if (e.key === 'Escape') { this.duplicateFilePath = null; this.render(); return; }
            if (e.key !== 'Enter') return;
            const input = e.target as HTMLInputElement;
            const newName = input.value.trim();
            if (!newName) return;
            const filePath = input.dataset.sourceFile ?? '';
            await this.duplicateComponentFile(filePath, newName);
        });

        // Delete start — show inline confirm
        this.shadow.querySelectorAll<HTMLElement>('[data-delete-start]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFilePath = btn.dataset.deleteStart ?? null;
                this.render();
            });
        });

        // Delete cancel
        this.shadow.querySelectorAll<HTMLElement>('[data-delete-cancel]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFilePath = null;
                this.render();
            });
        });

        // Delete confirm
        this.shadow.querySelectorAll<HTMLElement>('[data-delete-confirm]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filePath = btn.dataset.deleteConfirm ?? '';
                await this.deleteComponent(filePath);
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
                    const data = await res.json() as { ok: boolean; path?: string; error?: string; code?: PreviewErrorPayload['code']; missingDependencies?: string[]; installCommand?: string; packageManager?: PreviewErrorPayload['packageManager'] };
                    if (!data.ok || !data.path) {
                        this.callbacks.onPreviewError?.({
                            code: data.code,
                            error: data.error ?? t('componentsPreviewUnavailable'),
                            missingDependencies: data.missingDependencies,
                            installCommand: data.installCommand,
                            packageManager: data.packageManager,
                        });
                        return;
                    }
                    this.callbacks.onOpenPreview(data.path, name);
                } catch (error) {
                    if (error instanceof Error) {
                        this.callbacks.onPreviewError?.({ error: error.message });
                    } else {
                        this.callbacks.onPreviewError?.({ error: t('componentsPreviewUnavailable') });
                    }
                }
            });
        });
    }

    private async loadPresets(): Promise<void> {
        try {
            const res = await fetch(`${BRIDGE}/presets`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json() as { ok: boolean; presets?: Array<{ kind: string; label: string; description: string }> };
            if (data.ok && data.presets) {
                this.presets = data.presets;
                if (this.showCreateForm && this.createMode === 'preset') this.render();
            }
        } catch { /* non-critical */ }
    }

    private async loadPagePatterns(): Promise<void> {
        try {
            const res = await fetch(`${BRIDGE}/page-patterns`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json() as { ok: boolean; patterns?: PagePattern[] };
            if (data.ok && data.patterns) {
                this.pagePatterns = data.patterns;
                if (this.showCreateForm && this.createMode === 'page') this.render();
            }
        } catch { /* non-critical */ }
    }

    private async loadShadcnItems(query = ''): Promise<void> {
        this.shadcnLoading = true;
        this.shadcnError = '';
        if (this.showCreateForm && this.createMode === 'shadcn') this.render();
        try {
            const url = new URL(`${BRIDGE}/shadcn/items`);
            if (query.trim()) url.searchParams.set('q', query.trim());
            url.searchParams.set('limit', '40');
            const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
            const data = await res.json() as { ok: boolean; items?: ShadcnRegistryItem[]; code?: string; error?: string };
            if (!data.ok) {
                this.shadcnItems = [];
                this.shadcnError = resolveShadcnListErrorMessage(data, t);
            } else {
                this.shadcnItems = data.items ?? [];
                this.shadcnError = '';
            }
        } catch {
            this.shadcnItems = [];
            this.shadcnError = t('componentsShadcnError');
        } finally {
            this.shadcnLoading = false;
            if (this.showCreateForm && this.createMode === 'shadcn') this.render();
        }
    }

    private async installShadcnItem(item: ShadcnRegistryItem): Promise<void> {
        this.shadcnInstallArg = item.addCommandArgument;
        this.shadcnInstallFeedback = '';
        this.shadcnInstallFeedbackTone = '';
        this.render();

        try {
            const res = await fetch(`${BRIDGE}/shadcn/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item }),
            });
            const data = await res.json() as { ok: boolean; code?: string; error?: string; conflictPaths?: string[]; installedItem?: ShadcnRegistryItem };

            if (!data.ok) {
                this.shadcnInstallFeedbackTone = 'error';
                this.shadcnInstallFeedback = resolveShadcnInstallErrorMessage(data, t);
                return;
            }

            await this.reloadComponentsList();
            this.shadcnInstallFeedbackTone = 'success';
            this.shadcnInstallFeedback = t('componentsShadcnInstallSuccess', { name: data.installedItem?.name ?? item.name });
        } catch {
            this.shadcnInstallFeedbackTone = 'error';
            this.shadcnInstallFeedback = t('componentsShadcnInstallError');
        } finally {
            this.shadcnInstallArg = '';
            this.render();
        }
    }

    private async createPresetComponent(kind: string, name: string): Promise<void> {
        const submitBtn = this.shadow.querySelector<HTMLButtonElement>('#preset-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }
        try {
            const res = await fetch(`${BRIDGE}/preset-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, name }),
            });
            const data = await res.json() as { ok: boolean; componentName?: string; newFilePath?: string; relPath?: string; error?: string };
            if (data.ok && data.newFilePath && data.componentName) {
                const newComp: ComponentInfo = {
                    name: data.componentName,
                    relPath: data.relPath ?? '',
                    filePath: data.newFilePath,
                    exports: [data.componentName],
                    origin: 'visual-edit',
                };
                this.components = [...this.components, newComp];
                this.showCreateForm = false;
                this.render();
            } else {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('componentsPresetCreate'); }
            }
        } catch {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('componentsPresetCreate'); }
        }
    }

    private async createPage(route: string, patternId?: string): Promise<void> {
        const submitBtn = this.shadow.querySelector<HTMLButtonElement>('#preset-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '…'; }
        try {
            const res = await fetch(`${BRIDGE}/page-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ route, patternId }),
            });
            const data = await res.json() as { ok: boolean; routePath?: string; error?: string };
            if (data.ok && data.routePath) {
                this.showCreateForm = false;
                this.render();
                this.callbacks.onPageCreated?.(data.routePath);
                return;
            }
        } catch { /* ignore and restore below */ }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = t('componentsPageCreate'); }
    }

    private async duplicateComponentFile(sourceFilePath: string, newName: string): Promise<void> {
        this.duplicateFilePath = null;
        try {
            const res = await fetch(`${BRIDGE}/component-duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: sourceFilePath, name: newName }),
            });
            const data = await res.json() as { ok: boolean; relPath?: string; componentName?: string; newFilePath?: string; error?: string };
            if (data.ok && data.newFilePath && data.componentName) {
                const newComp: ComponentInfo = {
                    name: data.componentName,
                    relPath: data.relPath ?? data.newFilePath.replace(/^.*?\/src\//, 'src/'),
                    filePath: data.newFilePath,
                    exports: [data.componentName],
                };
                this.components = [...this.components, newComp];
                this.render();
            } else {
                this.renderState('error', data.error ?? t('componentsDupError'));
            }
        } catch {
            this.renderState('error', t('componentsDupError'));
        }
    }

    private async deleteComponent(filePath: string): Promise<void> {
        try {
            const res = await fetch(`${BRIDGE}/component-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath }),
            });
            const data = await res.json() as { ok: boolean; error?: string };
            if (data.ok) {
                this.deleteFilePath = null;
                this.components = this.components.filter(c => c.filePath !== filePath);
                this.presenceByFile.delete(filePath);
                this.render();
            } else {
                this.deleteFilePath = null;
                this.renderState('error', data.error ?? t('componentsDeleteError'));
            }
        } catch {
            this.deleteFilePath = null;
            this.renderState('error', t('componentsDeleteError'));
        }
    }

    destroy(): void { this.unsubscribeLanguage?.(); this.dragCleanup?.(); this.host.remove(); }
}
