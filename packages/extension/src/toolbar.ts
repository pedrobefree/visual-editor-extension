/* -----------------------------------------------------------------------
   Mini floating toolbar — Visual Edit Kit
   Appears at top-center when Visual Edit is active.
   Provides: Theme Editor, Layer Tree, Element Outline toggle, Disable.
   ----------------------------------------------------------------------- */

import { attachDrag } from './drag-util';

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#toolbar {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  z-index: 2147483646;
  display: flex; align-items: center; gap: 3px;
  background: #141414; border: 1px solid #2a2a2a; border-radius: 10px;
  padding: 5px 8px; box-shadow: 0 8px 32px rgba(0,0,0,.55);
  user-select: none;
  cursor: grab;
}
#toolbar.dragging { cursor: grabbing; }
.ve-badge {
  background: #6366f1; color: white; border-radius: 5px;
  padding: 2px 8px; font-size: 11px; font-weight: 700; letter-spacing: .03em;
  margin-right: 3px; flex-shrink: 0;
}
.divider { width: 1px; height: 18px; background: #2a2a2a; margin: 0 3px; flex-shrink: 0; }
.tb-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent;
  background: none; color: #777; font-size: 11px; font-weight: 500;
  transition: all .1s; white-space: nowrap;
}
.tb-btn:hover { background: #1e1e1e; color: #e5e5e5; border-color: #2a2a2a; }
.tb-btn.active { background: #1e1e3a; color: #818cf8; border-color: #3730a3; }
.tb-icon { width: 13px; height: 13px; flex-shrink: 0; display: block; }
.tb-close {
  padding: 4px 7px; border-radius: 6px; cursor: pointer;
  background: none; border: none; color: #555; font-size: 13px;
  transition: color .1s; margin-left: 2px;
}
.tb-close:hover { color: #e5e5e5; }
`;

/* Inline SVG icons */
const SVG_THEME = `<svg class="tb-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
  <circle cx="8" cy="8" r="5.5"/>
  <circle cx="8" cy="4" r="1" fill="currentColor" stroke="none"/>
  <circle cx="11.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
  <circle cx="4.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>
</svg>`;

const SVG_TREE = `<svg class="tb-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="1.5" y="1.5" width="5" height="3" rx="1"/>
  <rect x="9.5" y="6" width="5" height="3" rx="1"/>
  <rect x="9.5" y="11.5" width="5" height="3" rx="1"/>
  <path d="M4 4.5v5.25h5.5M4 9.75V13h5.5" stroke-linecap="round"/>
</svg>`;

const SVG_OUTLINE = `<svg class="tb-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke-dasharray="2.5 1.5"/>
  <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke-dasharray="2.5 1.5"/>
  <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke-dasharray="2.5 1.5"/>
  <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke-dasharray="2.5 1.5"/>
</svg>`;

const SVG_COMPONENTS = `<svg class="tb-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
  <rect x="1.5" y="1.5" width="6" height="6" rx="1.5"/>
  <rect x="8.5" y="1.5" width="6" height="6" rx="1.5"/>
  <rect x="1.5" y="8.5" width="6" height="6" rx="1.5"/>
  <circle cx="11.5" cy="11.5" r="2.5"/>
</svg>`;

export interface ToolbarCallbacks {
    onTheme: () => void;
    onTree: () => void;
    onComponents: () => void;
    onOutline: (active: boolean) => void;
    onDisable: () => void;
}

export class VisualEditToolbar {
    static readonly HOST_ID = 've-toolbar-host';
    static dragging = false;

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private callbacks: ToolbarCallbacks;
    private dragCleanup: (() => void) | null = null;
    private themeActive      = false;
    private treeActive       = false;
    private componentsActive = false;
    private outlineActive    = false;

    constructor(callbacks: ToolbarCallbacks) {
        this.callbacks = callbacks;
        // Remove any orphan toolbar hosts
        document.querySelectorAll(`#${VisualEditToolbar.HOST_ID}`).forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = VisualEditToolbar.HOST_ID;
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
        this.render();
    }

    setThemeActive(v: boolean):      void { if (this.themeActive      !== v) { this.themeActive      = v; this.render(); } }
    setTreeActive(v: boolean):       void { if (this.treeActive       !== v) { this.treeActive       = v; this.render(); } }
    setComponentsActive(v: boolean): void { if (this.componentsActive !== v) { this.componentsActive = v; this.render(); } }

    private render(): void {
        const style = document.createElement('style');
        style.textContent = CSS;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
          <div id="toolbar">
            <span class="ve-badge">VE</span>
            <div class="divider"></div>
            <button class="tb-btn${this.themeActive      ? ' active' : ''}" id="tb-theme">${SVG_THEME} Tema</button>
            <button class="tb-btn${this.treeActive       ? ' active' : ''}" id="tb-tree">${SVG_TREE} Árvore</button>
            <button class="tb-btn${this.componentsActive ? ' active' : ''}" id="tb-components">${SVG_COMPONENTS} Componentes</button>
            <button class="tb-btn${this.outlineActive    ? ' active' : ''}" id="tb-outline">${SVG_OUTLINE} Contornos</button>
            <div class="divider"></div>
            <button class="tb-close" id="tb-close" title="Desativar Visual Edit">✕</button>
          </div>`;
        this.shadow.innerHTML = '';
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.bindEvents();
    }

    private bindEvents(): void {
        // Block all events from leaking out of the toolbar
        const toolbar = this.shadow.querySelector('#toolbar');
        if (toolbar) {
            ['click','mousedown','pointerdown'].forEach(ev =>
                toolbar.addEventListener(ev, (e: Event) => e.stopPropagation()));
            this.dragCleanup?.();
            this.dragCleanup = attachDrag(toolbar as HTMLElement, toolbar as HTMLElement, () => (toolbar as HTMLElement).offsetWidth || 360, dragging => {
                VisualEditToolbar.dragging = dragging;
                toolbar.classList.toggle('dragging', dragging);
            });
        }

        this.shadow.querySelector('#tb-theme')?.addEventListener('click', () => {
            this.themeActive = !this.themeActive;
            this.render();
            this.callbacks.onTheme();
        });

        this.shadow.querySelector('#tb-tree')?.addEventListener('click', () => {
            this.treeActive = !this.treeActive;
            this.render();
            this.callbacks.onTree();
        });

        this.shadow.querySelector('#tb-components')?.addEventListener('click', () => {
            this.componentsActive = !this.componentsActive;
            this.render();
            this.callbacks.onComponents();
        });

        this.shadow.querySelector('#tb-outline')?.addEventListener('click', () => {
            this.outlineActive = !this.outlineActive;
            this.render();
            this.callbacks.onOutline(this.outlineActive);
        });

        this.shadow.querySelector('#tb-close')?.addEventListener('click', () => {
            this.callbacks.onDisable();
        });
    }

    destroy(): void { this.dragCleanup?.(); this.host.remove(); }
}
