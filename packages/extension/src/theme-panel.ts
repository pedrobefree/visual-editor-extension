/* -----------------------------------------------------------------------
   Theme Panel — Visual Edit Kit
   Reads brand colors + font families from CSS custom properties via the
   bridge (/theme endpoint) and lets the user edit them visually.
   ----------------------------------------------------------------------- */

import { attachDrag } from './drag-util';

const BRIDGE = 'http://localhost:5179';

/* ── Data types (mirrored from bridge/src/theme.ts) ─────────────────────── */
export interface ThemeColor {
    name: string;
    value: string;   // original CSS string (may be rgb(), oklch, etc.)
    hex: string;     // hex for the color picker (#rrggbb)
    variable?: string;
    filePath?: string;
}
export interface ThemeFont {
    name: string;
    value: string;
    displayValue?: string;
    variable?: string;
    filePath?: string;
}
export interface ThemeData {
    colors: ThemeColor[];
    fonts: ThemeFont[];
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#theme-panel {
  position: fixed; top: 52px; right: 328px; z-index: 2147483645;
  width: 292px; max-height: calc(100vh - 68px);
  background: #141414; color: #e5e5e5;
  border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column;
  font-size: 12px; overflow: hidden;
}
#theme-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; border-bottom: 1px solid #222;
  background: #1a1a1a; flex-shrink: 0;
  cursor: grab; user-select: none;
}
.theme-title { font-size: 10px; font-weight: 600; color: #666; letter-spacing: .08em; text-transform: uppercase; }
#theme-body { overflow-y: auto; flex: 1; padding: 10px 12px; display: flex; flex-direction: column; gap: 14px; }
#theme-body::-webkit-scrollbar { width: 3px; }
#theme-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
/* Section labels */
.sec-label { font-size: 10px; font-weight: 600; color: #555; letter-spacing: .07em; text-transform: uppercase; margin-bottom: 8px; }
/* Color groups */
.color-group { margin-bottom: 10px; }
.group-name { font-size: 10px; color: #666; margin-bottom: 5px; text-transform: capitalize; }
.color-row { display: flex; flex-wrap: wrap; gap: 5px; }
/* Individual chip */
.color-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 6px; cursor: pointer;
  background: #1e1e1e; border: 1px solid #2a2a2a;
  transition: border-color .1s;
}
.color-chip:hover { border-color: #555; }
.color-chip.open { border-color: #6366f1; }
.swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(255,255,255,.1); flex-shrink: 0; }
.chip-name { font-size: 10px; color: #888; font-family: monospace; }
/* Inline color editor */
.color-editor {
  display: none; flex-direction: column; gap: 7px;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
  padding: 10px; margin-top: 6px;
}
.color-editor.open { display: flex; }
.editor-preview { width: 100%; height: 30px; border-radius: 5px; border: 1px solid rgba(255,255,255,.1); transition: background .1s; }
.editor-var { font-size: 9px; color: #555; font-family: monospace; word-break: break-all; margin-bottom: -2px; }
.editor-row { display: flex; gap: 6px; align-items: center; }
.editor-hex {
  flex: 1; background: #111; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #e5e5e5; padding: 5px 8px; font-size: 11px; font-family: monospace; outline: none;
}
.editor-hex:focus { border-color: #6366f1; }
.native-picker {
  width: 30px; height: 28px; border-radius: 5px; border: 1px solid #2a2a2a;
  cursor: pointer; background: transparent; padding: 1px; overflow: hidden;
}
.btn-save {
  background: #6366f1; color: white; border: none; border-radius: 5px;
  padding: 5px 12px; font-size: 11px; cursor: pointer; flex-shrink: 0;
}
.btn-save:hover { background: #4f46e5; }
.btn-save:disabled { background: #333; color: #555; cursor: not-allowed; }
/* Fonts */
.font-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.font-label { font-size: 10px; color: #666; width: 44px; flex-shrink: 0; font-family: monospace; }
.font-input {
  flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #e5e5e5; padding: 5px 8px; font-size: 11px; outline: none; min-width: 0;
}
.font-input:focus { border-color: #6366f1; }
.btn-font-save { background: #6366f1; color: white; border: none; border-radius: 5px; padding: 5px 10px; font-size: 11px; cursor: pointer; flex-shrink: 0; }
.btn-font-save:hover { background: #4f46e5; }
/* States */
.state-msg { padding: 32px 16px; text-align: center; font-size: 11px; line-height: 1.6; }
.state-loading { color: #555; }
.state-error   { color: #f87171; }
.state-empty   { color: #555; }
/* Toast */
.toast {
  position: fixed; bottom: 20px; right: 12px; z-index: 2147483648;
  background: #1a1a1a; border-radius: 8px; padding: 8px 14px;
  font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.4);
}
.toast.success { border: 1px solid #16a34a; color: #4ade80; }
.toast.error   { border: 1px solid #dc2626; color: #f87171; }
`;

/* ── ThemePanel class ───────────────────────────────────────────────────── */
export class ThemePanel {
    static readonly HOST_ID = 've-theme-host';

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private theme: ThemeData | null = null;
    /** OID of the color chip currently open for editing (chip.dataset.colorVar) */
    private openEditorVar = '';
    private dragCleanup:  (() => void) | null = null;

    constructor() {
        document.querySelectorAll(`#${ThemePanel.HOST_ID}`).forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = ThemePanel.HOST_ID;
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
        this.renderState('loading');
        this.loadTheme();
    }

    private renderState(state: 'loading' | 'error' | 'empty', msg = ''): void {
        const messages: Record<string, string> = {
            loading: 'Carregando tema do projeto…',
            error:   msg || 'Bridge offline ou sem suporte a tema.',
            empty:   'Nenhuma variável CSS de cor/fonte encontrada.<br>Certifique-se de que o projeto define variáveis<br>em <code>:root { }</code> no CSS.',
        };
        this.shadow.innerHTML = '';
        const style = document.createElement('style');
        style.textContent = CSS;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="theme-panel">
            <div id="theme-header"><span class="theme-title">Tema do projeto</span></div>
            <div id="theme-body">
              <div class="state-msg state-${state}">${messages[state]}</div>
            </div>
          </div>`;
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.blockEvents();
    }

    private async loadTheme(): Promise<void> {
        try {
            const res  = await fetch(`${BRIDGE}/theme`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json() as { ok: boolean; theme?: ThemeData; error?: string };
            if (!data.ok || !data.theme) {
                this.renderState('error', data.error);
                return;
            }
            this.theme = data.theme;
            if (!data.theme.colors.length && !data.theme.fonts.length) {
                this.renderState('empty');
                return;
            }
            this.render();
        } catch {
            this.renderState('error');
        }
    }

    private render(): void {
        if (!this.theme) return;
        const { colors, fonts } = this.theme;

        // Group colors by their "family" (everything before the last dash-separated segment)
        const groups = new Map<string, ThemeColor[]>();
        for (const c of colors) {
            const parts = c.name.split('-');
            const group = parts.length > 1 ? parts.slice(0, -1).join('-') : c.name;
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)!.push(c);
        }

        // Build color HTML
        const colorHtml = Array.from(groups.entries()).map(([group, cols]) => {
            const chips = cols.map(c => {
                return `
                  <div class="color-chip"
                       data-color-var="${c.variable ?? ''}"
                       data-color-file="${c.filePath ?? ''}"
                       data-color-name="${c.name}"
                       data-color-val="${c.value}"
                       data-color-hex="${c.hex}"
                       title="${c.variable ?? c.name}: ${c.value}">
                    <div class="swatch" style="background:${c.hex}"></div>
                    <span class="chip-name">${c.name.split('-').pop()}</span>
                  </div>`;
            }).join('');

            const editorId = `editor-${group.replace(/[^a-z0-9]/gi, '_')}`;
            return `
              <div class="color-group">
                <div class="group-name">${group}</div>
                <div class="color-row">${chips}</div>
                <div class="color-editor" id="${editorId}"></div>
              </div>`;
        }).join('');

        // Build fonts HTML
        const fontsHtml = fonts.length ? `
          <div>
            <div class="sec-label">Fontes</div>
            ${fonts.map(f => `
              <div class="font-row">
                <span class="font-label">${f.name}</span>
                <input class="font-input" data-font-name="${f.name}" value="${f.displayValue ?? f.value}" title="${f.value.replace(/"/g, '&quot;')}" spellcheck="false" />
                <button class="btn-font-save" data-font-name="${f.name}">✓</button>
              </div>`).join('')}
          </div>` : '';

        this.shadow.innerHTML = '';
        const style = document.createElement('style');
        style.textContent = CSS;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="theme-panel">
            <div id="theme-header"><span class="theme-title">Tema do projeto</span></div>
            <div id="theme-body">
              ${colors.length ? `<div><div class="sec-label">Cores</div>${colorHtml}</div>` : ''}
              ${fontsHtml}
            </div>
          </div>`;
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.bindEvents();
    }

    private blockEvents(): void {
        const panel = this.shadow.querySelector('#theme-panel');
        if (panel) {
            ['click','mousedown','pointerdown'].forEach(ev =>
                panel.addEventListener(ev, (e: Event) => e.stopPropagation()));
        }
    }

    private bindEvents(): void {
        this.blockEvents();

        // ── Drag ─────────────────────────────────────────────────────────
        this.dragCleanup?.();
        const headerEl = this.shadow.querySelector('#theme-header') as HTMLElement | null;
        const panelEl  = this.shadow.querySelector('#theme-panel') as HTMLElement | null;
        if (headerEl && panelEl) {
            this.dragCleanup = attachDrag(panelEl, headerEl);
        }

        // ── Color chip click → open inline editor ────────────────────────
        this.shadow.querySelectorAll('.color-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const chipEl    = chip as HTMLElement;
                const colorVar  = chipEl.dataset.colorVar  ?? '';
                const colorVal  = chipEl.dataset.colorVal  ?? '';
                const colorName = chipEl.dataset.colorName ?? '';
                const filePath  = chipEl.dataset.colorFile ?? '';

                // Determine which editor container to use
                const parts     = colorName.split('-');
                const group     = parts.length > 1 ? parts.slice(0, -1).join('-') : colorName;
                const editorId  = `editor-${group.replace(/[^a-z0-9]/gi, '_')}`;
                const editor    = this.shadow.querySelector(`#${editorId}`) as HTMLElement | null;
                if (!editor) return;

                const isAlreadyOpen = this.openEditorVar === colorVar && editor.classList.contains('open');

                // Close all editors and un-mark chips
                this.shadow.querySelectorAll('.color-editor').forEach(e => e.classList.remove('open'));
                this.shadow.querySelectorAll('.color-chip').forEach(c => c.classList.remove('open'));
                this.openEditorVar = '';

                if (isAlreadyOpen) return;

                this.openEditorVar = colorVar;
                chip.classList.add('open');
                editor.classList.add('open');

                // Compute an initial hex for the native picker (best effort)
                const initHex = /^#[0-9a-f]{6}$/i.test(colorVal) ? colorVal : '#000000';

                const colorHex = (chip as HTMLElement).dataset.colorHex ?? initHex;
                editor.innerHTML = `
                  <div class="editor-preview" id="ep" style="background:${colorHex}"></div>
                  ${colorVar ? `<div class="editor-var">${colorVar}</div>` : ''}
                  <div class="editor-row">
                    <input type="color" class="native-picker" id="np" value="${colorHex}" />
                    <input class="editor-hex" id="eh" value="${colorHex}" placeholder="#rrggbb" spellcheck="false" />
                    <button class="btn-save" id="save-btn">✓</button>
                  </div>`;

                const preview   = editor.querySelector('#ep') as HTMLElement;
                const native    = editor.querySelector('#np') as HTMLInputElement;
                const hexInp    = editor.querySelector('#eh') as HTMLInputElement;
                const saveBtn   = editor.querySelector('#save-btn') as HTMLButtonElement;

                const applyValue = (v: string) => {
                    preview.style.background = v;
                    // Live CSS variable preview on the host page
                    if (colorVar) document.documentElement.style.setProperty(colorVar, v);
                    // Update chip swatch live
                    (chip.querySelector('.swatch') as HTMLElement).style.background = v;
                };

                native.addEventListener('input', () => {
                    hexInp.value = native.value;
                    applyValue(native.value);
                });

                hexInp.addEventListener('input', () => {
                    const v = hexInp.value.trim();
                    preview.style.background = v;
                    if (/^#[0-9a-f]{6}$/i.test(v)) { native.value = v; applyValue(v); }
                });

                saveBtn.addEventListener('click', async () => {
                    const newVal = hexInp.value.trim();
                    saveBtn.disabled = true;
                    saveBtn.textContent = '…';

                    const ok = await this.callBridge({ type: 'color', name: colorName, value: newVal, variable: colorVar, filePath });

                    saveBtn.disabled = false;
                    saveBtn.textContent = '✓';

                    if (ok) {
                        // Update local model
                        const colorObj = this.theme?.colors.find(c => c.name === colorName);
                        if (colorObj) colorObj.value = newVal;
                        (chipEl.dataset as DOMStringMap).colorVal = newVal;
                        editor.classList.remove('open');
                        chip.classList.remove('open');
                        this.openEditorVar = '';
                        this.showToast('Cor salva ✓', 'success');
                    } else {
                        this.showToast('Erro ao salvar — bridge offline?', 'error');
                    }
                });
            });
        });

        // ── Font save buttons ────────────────────────────────────────────
        this.shadow.querySelectorAll('.btn-font-save').forEach(btn => {
            btn.addEventListener('click', async () => {
                const name  = (btn as HTMLElement).dataset.fontName ?? '';
                const input = this.shadow.querySelector<HTMLInputElement>(`.font-input[data-font-name="${name}"]`);
                if (!input) return;
                const font  = this.theme?.fonts.find(f => f.name === name);
                const ok    = await this.callBridge({
                    type: 'font', name, value: input.value.trim(),
                    variable: font?.variable, filePath: font?.filePath,
                });
                if (ok) {
                    if (font) font.value = input.value.trim();
                    this.showToast('Fonte salva ✓', 'success');
                } else {
                    this.showToast('Erro ao salvar fonte', 'error');
                }
            });
        });
    }

    private async callBridge(body: Record<string, string | undefined>): Promise<boolean> {
        try {
            const res  = await fetch(`${BRIDGE}/theme`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json() as { ok: boolean };
            return data.ok;
        } catch { return false; }
    }

    private showToast(msg: string, type: 'success' | 'error'): void {
        this.shadow.querySelector('.toast')?.remove();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        this.shadow.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    destroy(): void { this.dragCleanup?.(); this.host.remove(); }
}
