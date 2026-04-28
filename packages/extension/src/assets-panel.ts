import { attachDrag } from './drag-util';
import { subscribeLanguageChange, t } from './i18n';

const BRIDGE = 'http://localhost:5179';
const SUPPORTED_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);

export interface AssetInfo {
    id: string;
    name: string;
    extension: string;
    absolutePath: string;
    relativePath: string;
    source: 'public' | 'src-assets' | 'url';
    runtimePath: string;
    size: number;
}

export interface AssetsPanelCallbacks {
    onUseAsset: (asset: AssetInfo) => void;
    onClose?: () => void;
}

type AssetResponse = {
    ok: boolean;
    error?: string;
    asset?: AssetInfo;
    assets?: AssetInfo[];
};

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#assets-panel {
  position: fixed; top: 52px; right: 336px; z-index: 2147483645;
  width: 320px; height: min(760px, calc(100vh - 68px));
  min-width: 280px; min-height: 260px; max-width: calc(100vw - 24px); max-height: calc(100vh - 68px);
  background: #141414; color: #e5e5e5; border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6); display: flex; flex-direction: column; overflow: hidden; resize: both;
}
#assets-header {
  display:flex; align-items:center; justify-content:space-between; padding:9px 12px; border-bottom:1px solid #222;
  background:#1a1a1a; cursor: grab; user-select:none;
}
.assets-title { font-size:10px; font-weight:600; color:#666; letter-spacing:.08em; text-transform:uppercase; }
.assets-header-actions { display:flex; align-items:center; gap:6px; }
.assets-actions, .assets-url-row { display:flex; align-items:center; gap:6px; padding:8px 12px; border-bottom:1px solid #1e1e1e; }
.asset-status {
  margin:8px 12px 0; padding:7px 9px; border-radius:7px; font-size:10px; line-height:1.35;
  border:1px solid #2a2a2a; background:#181818; color:#a3a3a3;
}
.asset-status.success { color:#bbf7d0; border-color:#14532d; background:#052e16; }
.asset-status.error { color:#fecaca; border-color:#7f1d1d; background:#2a0f0f; }
.mini-btn, .source-btn {
  border:1px solid #2a2a2a; background:#1a1a1a; color:#888; border-radius:6px; cursor:pointer; font-size:11px;
}
.mini-btn { padding:6px 10px; }
.icon-btn { width:28px; height:26px; padding:0; display:inline-flex; align-items:center; justify-content:center; }
.url-apply-btn { flex-shrink:0; min-width:58px; }
.mini-btn:hover, .source-btn:hover { color:#fff; border-color:#444; background:#202020; }
.mini-btn:disabled, .source-btn:disabled, .asset-btn:disabled { opacity:.55; cursor:not-allowed; }
.search-input, .url-input {
  width:100%; min-width:0; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:6px;
  color:#e5e5e5; padding:6px 8px; font-size:11px; outline:none;
}
.search-input:focus, .url-input:focus { border-color:#6366f1; }
.source-toggle { display:flex; gap:4px; }
.source-btn { padding:5px 8px; }
.source-btn.active { background:#4338ca; border-color:#4338ca; color:#e0e7ff; }
#assets-body { overflow-y:auto; flex:1; padding:10px 12px; display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
.asset-card {
  border:1px solid #2a2a2a; border-radius:10px; background:#181818; overflow:hidden; display:flex; flex-direction:column;
}
.asset-thumb { width:100%; aspect-ratio:1 / 1; background:#0f0f0f; object-fit:cover; }
.asset-meta { padding:8px; display:flex; flex-direction:column; gap:6px; min-height:88px; }
.asset-name { font-size:10px; color:#ddd; line-height:1.35; word-break:break-word; }
.asset-path { font-size:9px; color:#555; line-height:1.3; word-break:break-word; }
.asset-row { display:flex; gap:4px; }
.asset-inline { display:flex; flex-direction:column; gap:6px; border-top:1px solid #242424; padding-top:6px; }
.asset-inline-input {
  width:100%; height:28px; border:1px solid #3730a3; border-radius:6px; background:#111; color:#e5e5e5;
  font-size:10px; padding:5px 7px; outline:none;
}
.asset-inline-input:focus { border-color:#6366f1; }
.asset-inline-text { color:#a3a3a3; font-size:10px; line-height:1.35; }
.asset-btn {
  flex:1; border:1px solid #2a2a2a; background:#1f1f1f; color:#888; border-radius:6px; cursor:pointer; font-size:10px; padding:5px 4px;
}
.asset-btn:hover { color:#fff; border-color:#444; background:#282828; }
.asset-btn.primary { color:#c7d2fe; border-color:#3730a3; }
.asset-btn.danger { color:#fca5a5; border-color:#4b1d1d; }
#empty, #loading {
  grid-column:1 / -1; color:#555; font-size:11px; text-align:center; padding:28px 12px; line-height:1.6;
}
`;

export class AssetsPanel {
    static readonly HOST_ID = 've-assets-host';

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private callbacks: AssetsPanelCallbacks;
    private assets: AssetInfo[] = [];
    private query = '';
    private urlDraft = '';
    private uploadTarget: 'public' | 'src-assets' = 'public';
    private loading = true;
    private status: { kind: 'success' | 'error'; text: string } | null = null;
    private busy = false;
    private renamePath: string | null = null;
    private renameDraft = '';
    private deletePath: string | null = null;
    private dragCleanup: (() => void) | null = null;
    private unsubscribeLanguage: (() => void) | null = null;

    constructor(callbacks: AssetsPanelCallbacks) {
        this.callbacks = callbacks;
        document.querySelectorAll(`#${AssetsPanel.HOST_ID}`).forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = AssetsPanel.HOST_ID;
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
        this.unsubscribeLanguage = subscribeLanguageChange(() => this.render());
        this.render();
        void this.loadAssets();
    }

    private async loadAssets(): Promise<void> {
        this.loading = true;
        this.render();
        try {
            const res = await fetch(`${BRIDGE}/assets`, { signal: AbortSignal.timeout(4000) });
            const data = await res.json() as AssetResponse;
            this.assets = data.assets ?? [];
        } catch {
            this.assets = [];
            this.status = { kind: 'error', text: t('assetsLoadError') };
        } finally {
            this.loading = false;
            this.render();
        }
    }

    private filteredAssets(): AssetInfo[] {
        const q = this.query.trim().toLowerCase();
        if (!q) return this.assets;
        return this.assets.filter(asset =>
            asset.name.toLowerCase().includes(q) ||
            asset.relativePath.toLowerCase().includes(q),
        );
    }

    private render(): void {
        const filtered = this.filteredAssets();
        const disabled = this.busy ? ' disabled' : '';
        const style = document.createElement('style');
        style.textContent = CSS;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="assets-panel">
            <div id="assets-header">
              <span class="assets-title">${t('assetsTitle')}</span>
              <div class="assets-header-actions">
                <button class="mini-btn icon-btn" id="assets-refresh" title="${t('assetsRefresh')}">↺</button>
                <button class="mini-btn icon-btn" id="assets-close" title="${t('assetsClose')}">×</button>
              </div>
            </div>
            <div class="assets-actions">
              <input class="search-input" id="assets-search" placeholder="${t('assetsSearchPlaceholder')}" value="${this.escapeHtml(this.query)}" />
            </div>
            <div class="assets-url-row">
              <input class="url-input" id="assets-url-input" placeholder="${t('assetsUrlPlaceholder')}" value="${this.escapeHtml(this.urlDraft)}" spellcheck="false" />
              <button class="mini-btn url-apply-btn" id="assets-use-url"${disabled}>${t('assetsUseUrl')}</button>
            </div>
            <div class="assets-actions">
              <div class="source-toggle">
                <button class="source-btn${this.uploadTarget === 'public' ? ' active' : ''}" data-target="public"${disabled}>${t('assetsPublic')}</button>
                <button class="source-btn${this.uploadTarget === 'src-assets' ? ' active' : ''}" data-target="src-assets"${disabled}>${t('assetsSrcAssets')}</button>
              </div>
              <button class="mini-btn" id="assets-upload"${disabled}>${this.busy ? t('assetsWorking') : t('assetsUpload')}</button>
              <input type="file" id="assets-file-input" accept="image/*" hidden />
            </div>
            ${this.status ? `<div class="asset-status ${this.status.kind}">${this.escapeHtml(this.status.text)}</div>` : ''}
            <div id="assets-body">
              ${this.loading ? `<div id="loading">${t('assetsLoading')}</div>` : filtered.length ? filtered.map(asset => this.renderAssetCard(asset, disabled)).join('') : `<div id="empty">${t('assetsEmpty')}</div>`}
            </div>
          </div>
        `;

        this.shadow.innerHTML = '';
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.bindEvents();

        this.dragCleanup?.();
        const header = this.shadow.querySelector('#assets-header') as HTMLElement | null;
        const panel = this.shadow.querySelector('#assets-panel') as HTMLElement | null;
        if (header && panel) this.dragCleanup = attachDrag(panel, header);
        this.shadow.querySelector<HTMLInputElement>('.asset-inline-input')?.focus();
    }

    private renderAssetCard(asset: AssetInfo, disabled: string): string {
        const isRenaming = this.renamePath === asset.relativePath;
        const isDeleting = this.deletePath === asset.relativePath;
        return `
          <div class="asset-card" data-asset="${this.escapeHtml(asset.relativePath)}">
            <img class="asset-thumb" src="${this.escapeHtml(asset.runtimePath)}" alt="${this.escapeHtml(asset.name)}" />
            <div class="asset-meta">
              <div class="asset-name">${this.escapeHtml(asset.name)}</div>
              <div class="asset-path">${this.escapeHtml(asset.relativePath)}</div>
              ${isRenaming ? `
                <div class="asset-inline">
                  <input class="asset-inline-input" data-rename-input="${this.escapeHtml(asset.relativePath)}" value="${this.escapeHtml(this.renameDraft)}" spellcheck="false" />
                  <div class="asset-row">
                    <button class="asset-btn primary" data-rename-save="${this.escapeHtml(asset.relativePath)}"${disabled}>${t('assetsSave')}</button>
                    <button class="asset-btn" data-inline-cancel${disabled}>${t('assetsCancel')}</button>
                  </div>
                </div>
              ` : isDeleting ? `
                <div class="asset-inline">
                  <div class="asset-inline-text">${t('assetsDeleteInlineConfirm')}</div>
                  <div class="asset-row">
                    <button class="asset-btn danger" data-delete-confirm="${this.escapeHtml(asset.relativePath)}"${disabled}>${t('assetsDelete')}</button>
                    <button class="asset-btn" data-inline-cancel${disabled}>${t('assetsCancel')}</button>
                  </div>
                </div>
              ` : `
                <div class="asset-row">
                  <button class="asset-btn primary" data-use="${this.escapeHtml(asset.relativePath)}"${disabled}>${t('assetsUse')}</button>
                  <button class="asset-btn" data-rename="${this.escapeHtml(asset.relativePath)}"${disabled}>${t('assetsRename')}</button>
                  <button class="asset-btn danger" data-delete="${this.escapeHtml(asset.relativePath)}" title="${t('assetsDelete')}"${disabled}>⌫</button>
                </div>
              `}
            </div>
          </div>
        `;
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private setStatus(kind: 'success' | 'error', text: string): void {
        this.status = { kind, text };
        this.render();
    }

    private async parseAssetResponse(res: Response): Promise<AssetResponse> {
        try {
            const data = await res.json() as AssetResponse;
            return data.ok ? data : { ok: false, error: data.error ?? t('assetsUnknownError') };
        } catch {
            return { ok: false, error: t('assetsUnknownError') };
        }
    }

    private isSupportedFile(file: File): boolean {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        return SUPPORTED_IMAGE_EXTS.has(ext);
    }

    private isSupportedUrl(value: string): boolean {
        const trimmed = value.trim();
        return /^(https?:)?\/\//.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../');
    }

    private urlAssetName(value: string): string {
        const clean = value.split(/[?#]/)[0] ?? value;
        const last = clean.split('/').filter(Boolean).pop();
        return last || t('assetsUrlAssetName');
    }

    private useUrlAsset(value: string): void {
        const runtimePath = value.trim();
        if (!this.isSupportedUrl(runtimePath)) {
            this.setStatus('error', t('assetsUrlInvalid'));
            return;
        }
        const asset: AssetInfo = {
            id: `url:${runtimePath}`,
            name: this.urlAssetName(runtimePath),
            extension: '',
            absolutePath: '',
            relativePath: runtimePath,
            source: 'url',
            runtimePath,
            size: 0,
        };
        this.callbacks.onUseAsset(asset);
        this.urlDraft = '';
        this.setStatus('success', t('assetsUseSuccess', { name: asset.name }));
    }

    private bindEvents(): void {
        const panel = this.shadow.querySelector('#assets-panel');
        if (panel) {
            ['click','mousedown','pointerdown'].forEach(ev =>
                panel.addEventListener(ev, (e: Event) => e.stopPropagation()));
        }

        this.shadow.querySelector('#assets-refresh')?.addEventListener('click', () => void this.loadAssets());
        this.shadow.querySelector('#assets-close')?.addEventListener('click', () => this.callbacks.onClose?.());
        this.shadow.querySelector('#assets-search')?.addEventListener('input', (e) => {
            this.query = (e.target as HTMLInputElement).value;
            this.renamePath = null;
            this.deletePath = null;
            this.render();
        });

        const urlInput = this.shadow.querySelector('#assets-url-input') as HTMLInputElement | null;
        urlInput?.addEventListener('input', () => {
            this.urlDraft = urlInput.value;
        });
        urlInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.useUrlAsset(urlInput.value);
            }
        });
        this.shadow.querySelector('#assets-use-url')?.addEventListener('click', () => {
            this.useUrlAsset(urlInput?.value ?? this.urlDraft);
        });

        this.shadow.querySelectorAll<HTMLElement>('.source-btn[data-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.uploadTarget = (btn.dataset.target === 'src-assets' ? 'src-assets' : 'public');
                this.renamePath = null;
                this.deletePath = null;
                this.render();
            });
        });

        const fileInput = this.shadow.querySelector('#assets-file-input') as HTMLInputElement | null;
        this.shadow.querySelector('#assets-upload')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            if (!this.isSupportedFile(file)) {
                fileInput.value = '';
                this.setStatus('error', t('assetsUnsupportedType'));
                return;
            }
            const form = new FormData();
            form.set('file', file);
            form.set('target', this.uploadTarget);
            this.busy = true;
            this.status = null;
            this.render();
            try {
                const res = await fetch(`${BRIDGE}/assets/upload`, { method: 'POST', body: form });
                const data = await this.parseAssetResponse(res);
                if (!data.ok) {
                    this.setStatus('error', data.error ?? t('assetsUploadError'));
                    return;
                }
                this.setStatus('success', t('assetsUploadSuccess', { name: data.asset?.name ?? file.name }));
                fileInput.value = '';
                await this.loadAssets();
            } catch {
                this.setStatus('error', t('assetsUploadError'));
            } finally {
                this.busy = false;
                fileInput.value = '';
                this.render();
            }
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-use]').forEach(btn => {
            btn.addEventListener('click', () => {
                const relativePath = btn.dataset.use ?? '';
                const asset = this.assets.find(item => item.relativePath === relativePath);
                if (asset) this.callbacks.onUseAsset(asset);
                if (asset) this.setStatus('success', t('assetsUseSuccess', { name: asset.name }));
            });
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-rename]').forEach(btn => {
            btn.addEventListener('click', () => {
                const relativePath = btn.dataset.rename ?? '';
                const asset = this.assets.find(item => item.relativePath === relativePath);
                if (!asset) return;
                this.renamePath = relativePath;
                this.renameDraft = asset.name;
                this.deletePath = null;
                this.status = null;
                this.render();
            });
        });

        this.shadow.querySelectorAll<HTMLInputElement>('[data-rename-input]').forEach(input => {
            input.addEventListener('input', () => {
                this.renameDraft = input.value;
            });
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    this.renamePath = null;
                    this.renameDraft = '';
                    this.render();
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const relativePath = input.dataset.renameInput ?? '';
                    void this.renameAsset(relativePath, input.value);
                }
            });
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-rename-save]').forEach(btn => {
            btn.addEventListener('click', () => {
                const relativePath = btn.dataset.renameSave ?? '';
                void this.renameAsset(relativePath, this.renameDraft);
            });
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-inline-cancel]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.renamePath = null;
                this.renameDraft = '';
                this.deletePath = null;
                this.render();
            });
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-delete]').forEach(btn => {
            btn.addEventListener('click', () => {
                const relativePath = btn.dataset.delete ?? '';
                this.deletePath = relativePath;
                this.renamePath = null;
                this.renameDraft = '';
                this.status = null;
                this.render();
            });
        });

        this.shadow.querySelectorAll<HTMLElement>('[data-delete-confirm]').forEach(btn => {
            btn.addEventListener('click', () => {
                const relativePath = btn.dataset.deleteConfirm ?? '';
                void this.deleteAsset(relativePath);
            });
        });
    }

    private async renameAsset(relativePath: string, nextName: string): Promise<void> {
        const asset = this.assets.find(item => item.relativePath === relativePath);
        if (!asset) return;
        const trimmed = nextName.trim();
        if (!trimmed || trimmed === asset.name) {
            this.renamePath = null;
            this.renameDraft = '';
            this.render();
            return;
        }
        this.busy = true;
        this.status = null;
        this.render();
        try {
            const res = await fetch(`${BRIDGE}/assets/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ relativePath, nextName: trimmed }),
            });
            const data = await this.parseAssetResponse(res);
            if (!data.ok) {
                this.setStatus('error', data.error ?? t('assetsRenameError'));
                return;
            }
            this.renamePath = null;
            this.renameDraft = '';
            this.setStatus('success', t('assetsRenameSuccess', { name: data.asset?.name ?? trimmed }));
            await this.loadAssets();
        } catch {
            this.setStatus('error', t('assetsRenameError'));
        } finally {
            this.busy = false;
            this.render();
        }
    }

    private async deleteAsset(relativePath: string): Promise<void> {
        const asset = this.assets.find(item => item.relativePath === relativePath);
        this.busy = true;
        this.status = null;
        this.render();
        try {
            const res = await fetch(`${BRIDGE}/assets/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ relativePath }),
            });
            const data = await this.parseAssetResponse(res);
            if (!data.ok) {
                this.setStatus('error', data.error ?? t('assetsDeleteError'));
                return;
            }
            this.deletePath = null;
            this.setStatus('success', t('assetsDeleteSuccess', { name: asset?.name ?? relativePath }));
            await this.loadAssets();
        } catch {
            this.setStatus('error', t('assetsDeleteError'));
        } finally {
            this.busy = false;
            this.render();
        }
    }

    destroy(): void {
        this.unsubscribeLanguage?.();
        this.dragCleanup?.();
        this.host.remove();
    }
}
