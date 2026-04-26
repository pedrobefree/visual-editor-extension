/* -----------------------------------------------------------------------
   Panel UI — shadow DOM
   - Seção CONTEÚDO: editar texto do elemento
   - Seção CLASSES: busca com preview ao vivo + quick-picks
   - Seção TIPOGRAFIA, ESPAÇAMENTO, BACKGROUND, BORDA, LAYOUT
   - Undo / Aplicar
   ----------------------------------------------------------------------- */

import { injectClassForPreview, injectClassesForPreview } from './tailwind-inject';

const BRIDGE = 'http://localhost:5179';

export interface I18nInfo {
    key: string;
    locales: string[];
    translations: Record<string, string>;
    files: Record<string, string>;
}

export interface PanelCallbacks {
    onApply: (oid: string, classes: string) => Promise<boolean>;
    /** newText = what the user typed; originalText = DOM text when panel opened */
    onTextApply: (oid: string, newText: string, originalText: string) => Promise<boolean>;
    /** Update a specific JSX attribute (e.g. placeholder) on the element */
    onAttrApply: (oid: string, attrName: string, newValue: string, currentValue: string) => Promise<boolean>;
    onClose: () => void;
}

/* ── Tailwind palette ───────────────────────────────────────────────────── */
const TAILWIND_COLORS = [
    'slate','gray','zinc','red','orange','amber','yellow','lime',
    'green','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose',
];
const COLOR_SHADES = [100,200,300,400,500,600,700,800,900];
const COLOR_HEX: Record<string,Record<number,string>> = {
    slate:{100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a'},
    gray:{100:'#f3f4f6',200:'#e5e7eb',300:'#d1d5db',400:'#9ca3af',500:'#6b7280',600:'#4b5563',700:'#374151',800:'#1f2937',900:'#111827'},
    zinc:{100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#52525b',700:'#3f3f46',800:'#27272a',900:'#18181b'},
    red:{100:'#fee2e2',200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d'},
    orange:{100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12'},
    amber:{100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f'},
    yellow:{100:'#fef9c3',200:'#fef08a',300:'#fde047',400:'#facc15',500:'#eab308',600:'#ca8a04',700:'#a16207',800:'#854d0e',900:'#713f12'},
    lime:{100:'#ecfccb',200:'#d9f99d',300:'#bef264',400:'#a3e635',500:'#84cc16',600:'#65a30d',700:'#4d7c0f',800:'#3f6212',900:'#365314'},
    green:{100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',800:'#166534',900:'#14532d'},
    teal:{100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a'},
    cyan:{100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63'},
    sky:{100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e'},
    blue:{100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8f'},
    indigo:{100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81'},
    violet:{100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95'},
    purple:{100:'#f3e8ff',200:'#e9d5ff',300:'#d8b4fe',400:'#c084fc',500:'#a855f7',600:'#9333ea',700:'#7e22ce',800:'#6b21a8',900:'#581c87'},
    fuchsia:{100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75'},
    pink:{100:'#fce7f3',200:'#fbcfe8',300:'#f9a8d4',400:'#f472b6',500:'#ec4899',600:'#db2777',700:'#be185d',800:'#9d174d',900:'#831843'},
    rose:{100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337'},
};

/* ── All Tailwind classes for search ────────────────────────────────────── */
const ALL_CLASSES: string[] = (() => {
    const list: string[] = [];
    // Spacing + margins
    const spacingNums = [0,0.5,1,1.5,2,2.5,3,3.5,4,5,6,7,8,9,10,11,12,14,16,20,24,28,32,36,40,44,48,52,56,60,64,72,80,96];
    for (const n of spacingNums) {
        const s = String(n);
        ['p','px','py','pt','pb','pl','pr','m','mx','my','mt','mb','ml','mr','gap','space-x','space-y'].forEach(p => list.push(`${p}-${s}`));
    }
    // m-auto helpers
    ['m','mx','my','mt','mb','ml','mr'].forEach(p => list.push(`${p}-auto`));
    // Typography
    ['xs','sm','base','lg','xl','2xl','3xl','4xl','5xl','6xl','7xl','8xl','9xl'].forEach(s => list.push(`text-${s}`));
    ['thin','extralight','light','normal','medium','semibold','bold','extrabold','black'].forEach(w => list.push(`font-${w}`));
    ['left','center','right','justify','start','end'].forEach(a => list.push(`text-${a}`));
    ['uppercase','lowercase','capitalize','normal-case'].forEach(t => list.push(t));
    ['underline','line-through','no-underline'].forEach(t => list.push(t));
    ['tracking-tighter','tracking-tight','tracking-normal','tracking-wide','tracking-wider','tracking-widest'].forEach(t => list.push(t));
    ['leading-none','leading-tight','leading-snug','leading-normal','leading-relaxed','leading-loose'].forEach(l => list.push(l));
    // Colors (bg + text + border)
    for (const color of TAILWIND_COLORS) {
        for (const shade of COLOR_SHADES) {
            list.push(`bg-${color}-${shade}`, `text-${color}-${shade}`, `border-${color}-${shade}`, `ring-${color}-${shade}`);
        }
    }
    ['white','black','transparent','current','inherit'].forEach(c => {
        list.push(`bg-${c}`,`text-${c}`,`border-${c}`);
    });
    // Layout
    ['block','inline-block','inline','flex','inline-flex','grid','inline-grid','hidden','contents'].forEach(d => list.push(d));
    ['flex-row','flex-col','flex-row-reverse','flex-col-reverse'].forEach(d => list.push(d));
    ['flex-wrap','flex-nowrap','flex-wrap-reverse'].forEach(d => list.push(d));
    ['flex-1','flex-auto','flex-initial','flex-none'].forEach(d => list.push(d));
    ['justify-start','justify-end','justify-center','justify-between','justify-around','justify-evenly'].forEach(d => list.push(d));
    ['items-start','items-end','items-center','items-baseline','items-stretch'].forEach(d => list.push(d));
    ['self-auto','self-start','self-end','self-center','self-stretch','self-baseline'].forEach(d => list.push(d));
    // Grid
    [1,2,3,4,5,6,7,8,9,10,11,12].forEach(n => {
        list.push(`grid-cols-${n}`,`col-span-${n}`,`grid-rows-${n}`,`row-span-${n}`);
    });
    // Sizing
    ['auto','full','screen','min','max','fit'].forEach(v => {
        list.push(`w-${v}`,`h-${v}`,`min-w-${v}`,`max-w-${v}`,`min-h-${v}`,`max-h-${v}`);
    });
    ['1/2','1/3','2/3','1/4','3/4','1/5','2/5','3/5','4/5'].forEach(v => {
        list.push(`w-${v}`,`h-${v}`);
    });
    spacingNums.forEach(n => { list.push(`w-${n}`,`h-${n}`,`max-w-${n}`,`max-h-${n}`); });
    ['sm','md','lg','xl','2xl','3xl','4xl','5xl','6xl','7xl','prose','none','full'].forEach(v => list.push(`max-w-${v}`));
    ['sm','md','lg','xl'].forEach(v => list.push(`max-w-screen-${v}`));
    // Border
    ['none','sm','','md','lg','xl','2xl','3xl','full'].forEach(r => list.push(`rounded${r ? '-'+r : ''}`));
    ['0','','2','4','8'].forEach(w => list.push(`border${w ? '-'+w : ''}`));
    list.push('border-solid','border-dashed','border-dotted','border-double','border-none');
    // Shadow
    ['sm','','md','lg','xl','2xl','inner','none'].forEach(s => list.push(`shadow${s ? '-'+s : ''}`));
    // Opacity
    [0,5,10,20,25,30,40,50,60,70,75,80,90,95,100].forEach(n => list.push(`opacity-${n}`));
    // Position
    ['static','fixed','absolute','relative','sticky'].forEach(p => list.push(p));
    ['inset-0','inset-x-0','inset-y-0','top-0','right-0','bottom-0','left-0',
     'top-auto','right-auto','bottom-auto','left-auto','inset-auto'].forEach(p => list.push(p));
    // Z-index
    [0,10,20,30,40,50].forEach(n => list.push(`z-${n}`));
    list.push('z-auto');
    // Overflow
    ['auto','hidden','visible','scroll','clip'].forEach(v => { list.push(`overflow-${v}`,`overflow-x-${v}`,`overflow-y-${v}`); });
    // Visibility
    ['visible','invisible','collapse'].forEach(v => list.push(v));
    // Aspect ratio
    ['aspect-auto','aspect-square','aspect-video'].forEach(v => list.push(v));
    // Object-fit
    ['object-contain','object-cover','object-fill','object-none','object-scale-down'].forEach(v => list.push(v));
    // Grid cols/rows
    for (let i = 1; i <= 12; i++) {
        list.push(`grid-cols-${i}`,`col-span-${i}`,`grid-rows-${i}`,`row-span-${i}`);
    }
    list.push('col-span-full','row-span-full');
    // Misc
    ['cursor-pointer','cursor-default','cursor-not-allowed','cursor-wait','cursor-text','cursor-move','cursor-grab','cursor-crosshair'].forEach(c => list.push(c));
    ['pointer-events-none','pointer-events-auto'].forEach(c => list.push(c));
    ['select-none','select-text','select-all','select-auto'].forEach(c => list.push(c));
    ['resize','resize-x','resize-y','resize-none'].forEach(c => list.push(c));
    ['truncate','text-ellipsis','text-clip','whitespace-nowrap','whitespace-normal','whitespace-pre','whitespace-pre-wrap'].forEach(c => list.push(c));
    ['antialiased','subpixel-antialiased'].forEach(c => list.push(c));
    ['italic','not-italic','underline','overline','line-through','no-underline'].forEach(c => list.push(c));
    ['transition','transition-all','transition-colors','transition-opacity','transition-transform','transition-none'].forEach(c => list.push(c));
    ['duration-75','duration-100','duration-150','duration-200','duration-300','duration-500','duration-700','duration-1000'].forEach(c => list.push(c));
    ['ease-linear','ease-in','ease-out','ease-in-out'].forEach(c => list.push(c));
    // Flex grow/shrink
    ['grow','grow-0','shrink','shrink-0'].forEach(c => list.push(c));
    // sr-only
    list.push('sr-only','not-sr-only');
    return [...new Set(list)];
})();

/* ── Color swatch builder ───────────────────────────────────────────────── */
function buildColorSwatches(prefix: 'bg' | 'text'): string {
    let html = '<div class="color-grid">';
    html += `<div class="color-row">
      <div class="swatch swatch-white" data-class="${prefix}-white" title="${prefix}-white"></div>
      <div class="swatch swatch-black" data-class="${prefix}-black" title="${prefix}-black"></div>
    </div>`;
    for (const color of TAILWIND_COLORS) {
        html += '<div class="color-row">';
        for (const shade of COLOR_SHADES) {
            const hex = COLOR_HEX[color]?.[shade] ?? '#888';
            html += `<div class="swatch" style="background:${hex}" data-class="${prefix}-${color}-${shade}" title="${prefix}-${color}-${shade}"></div>`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#panel {
  position: fixed; top: 80px; right: 16px; z-index: 2147483647;
  width: 310px; max-height: calc(100vh - 100px);
  background: #141414; color: #e5e5e5;
  border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column;
  font-size: 12px; overflow: hidden;
}
#panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-bottom: 1px solid #222;
  background: #1a1a1a; flex-shrink: 0;
  cursor: grab; user-select: none;
}
#panel-header.dragging { cursor: grabbing; }
.header-left { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.tag-badge { background: #6366f1; color: white; border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 600; font-family: monospace; flex-shrink: 0; }
.oid-badge { color: #555; font-size: 10px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#close-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 16px; padding: 2px 4px; flex-shrink: 0; }
#close-btn:hover { color: #e5e5e5; }
#panel-body { overflow-y: auto; flex: 1; }
#panel-body::-webkit-scrollbar { width: 4px; }
#panel-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
.section { border-bottom: 1px solid #1e1e1e; }
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; cursor: pointer; user-select: none;
  color: #666; font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
}
.section-header:hover { color: #aaa; }
.section-content { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
.section-content.hidden { display: none; }
.row { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
.row-label { font-size: 10px; color: #555; width: 52px; flex-shrink: 0; padding-top: 3px; }
.chips { display: flex; flex-wrap: wrap; gap: 3px; }
.chip {
  padding: 2px 7px; border-radius: 4px; cursor: pointer; border: 1px solid #2a2a2a;
  background: #1e1e1e; color: #888; font-size: 11px; transition: all .1s; white-space: nowrap;
}
.chip:hover { background: #2a2a2a; color: #e5e5e5; }
.chip.active { background: #6366f1; border-color: #6366f1; color: white; }
.color-grid { display: flex; flex-direction: column; gap: 2px; }
.color-row { display: flex; gap: 2px; }
.swatch { width: 16px; height: 16px; border-radius: 3px; cursor: pointer; border: 1.5px solid transparent; transition: transform .1s, border-color .1s; flex-shrink: 0; }
.swatch:hover { transform: scale(1.3); border-color: white; z-index: 1; position: relative; }
.swatch.active { border-color: white; transform: scale(1.2); }
.swatch-white { background: white; }
.swatch-black { background: black; }
/* Search */
.search-wrap { position: relative; }
.search-input {
  width: 100%; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
  color: #e5e5e5; padding: 6px 8px; font-size: 11px; font-family: monospace; outline: none;
}
.search-input:focus { border-color: #6366f1; }
.suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
  max-height: 180px; overflow-y: auto;
}
.suggestion {
  padding: 5px 10px; cursor: pointer; font-size: 11px; font-family: monospace; color: #aaa;
  display: flex; align-items: center; justify-content: space-between;
}
.suggestion:hover { background: #6366f1; color: white; }
.suggestion.active-cls { color: #4ade80; }
.suggestion-badge { font-size: 9px; opacity: .5; }
/* Classes textarea */
.classes-input {
  width: 100%; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
  color: #e5e5e5; padding: 6px 8px; font-size: 11px; font-family: monospace;
  resize: vertical; outline: none; line-height: 1.5; min-height: 52px;
}
.classes-input:focus { border-color: #6366f1; }
/* Text area */
.text-input {
  width: 100%; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
  color: #e5e5e5; padding: 6px 8px; font-size: 12px; font-family: inherit;
  resize: vertical; outline: none; line-height: 1.5; min-height: 44px;
}
.text-input:focus { border-color: #6366f1; }
.text-hint { font-size: 10px; color: #444; line-height: 1.4; }
/* Footer */
#panel-footer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #1e1e1e; background: #111; flex-shrink: 0; }
.btn { flex: 1; padding: 6px 0; border-radius: 7px; cursor: pointer; border: none; font-size: 12px; font-weight: 500; transition: all .1s; }
.btn-secondary { background: #222; color: #888; }
.btn-secondary:hover { background: #2a2a2a; color: #e5e5e5; }
.btn-primary { background: #6366f1; color: white; }
.btn-primary:hover { background: #4f46e5; }
.btn-primary:disabled { background: #333; color: #555; cursor: not-allowed; }
/* i18n */
.i18n-key { font-family: monospace; font-size: 10px; color: #818cf8; background: #1e1e3a; border-radius: 3px; padding: 2px 6px; word-break: break-all; }
.locale-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.locale-tab { padding: 3px 10px; border-radius: 5px; cursor: pointer; border: 1px solid #2a2a2a; background: #1a1a1a; color: #666; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.locale-tab:hover { border-color: #6366f1; color: #aaa; }
.locale-tab.active { background: #6366f1; border-color: #6366f1; color: white; }
.i18n-hint { font-size: 10px; color: #444; margin-top: 2px; }
/* Modifier strip (responsive & state prefixes) */
.modifier-strip { display: flex; flex-direction: column; gap: 4px; padding: 6px 0 4px; border-top: 1px solid #1e1e1e; margin-top: 2px; }
.modifier-row { display: flex; align-items: center; gap: 6px; }
.modifier-label { font-size: 10px; color: #555; width: 36px; flex-shrink: 0; }
.prefix-btn {
  padding: 2px 6px; border-radius: 4px; cursor: pointer; border: 1px solid #2a2a2a;
  background: #1e1e1e; color: #666; font-size: 10px; font-family: monospace; white-space: nowrap;
  transition: all .1s;
}
.prefix-btn:hover { background: #2a2a2a; color: #ccc; }
.prefix-btn.active { background: #4338ca; border-color: #4338ca; color: #c7d2fe; }
/* Toast */
.toast {
  position: fixed; bottom: 20px; right: 16px; z-index: 2147483648;
  background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
  padding: 8px 14px; font-size: 12px; display: flex; align-items: center; gap: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,.4); animation: slideIn .15s ease;
}
.toast.success { border-color: #16a34a; color: #4ade80; }
.toast.error { border-color: #dc2626; color: #f87171; }
@keyframes slideIn { from { transform: translateY(8px); opacity:0; } to { transform: translateY(0); opacity:1; } }
.chevron { transition: transform .15s; display: inline-block; }
.section-header.collapsed .chevron { transform: rotate(-90deg); }
`;

function chips(values: string[]): string {
    return `<div class="chips">${values.map(v =>
        `<div class="chip" data-class="${v}">${v.replace(/^(text|font|flex|justify|items|self|rounded|gap|w|h|max-w|min-w|max-h|min-h|grid-cols|col-span|grid-rows|row-span|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-/, '')}</div>`
    ).join('')}</div>`;
}

function buildCurrentClassChips(classes: string): string {
    const list = classes.split(/\s+/).filter(Boolean);
    if (!list.length) return '<span style="font-size:10px;color:#444">Nenhuma classe</span>';
    return `<div class="chips">${list.map(cls =>
        `<div class="chip active" data-class="${cls}" title="${cls}">${cls}</div>`
    ).join('')}</div>`;
}

function buildPanel(oid: string, tag: string, currentClasses: string, currentText: string, currentPlaceholder: string): string {
    const textSizes = ['text-xs','text-sm','text-base','text-lg','text-xl','text-2xl','text-3xl','text-4xl','text-5xl'];
    const fontWeights = ['font-thin','font-light','font-normal','font-medium','font-semibold','font-bold','font-extrabold','font-black'];
    const spNums = ['0','1','2','3','4','5','6','8','10','12','16','20','24'];
    const paddings = spNums.map(n => `p-${n}`);
    const ptVals   = spNums.map(n => `pt-${n}`);
    const pbVals   = spNums.map(n => `pb-${n}`);
    const pxVals   = spNums.map(n => `px-${n}`);
    const pyVals   = spNums.map(n => `py-${n}`);
    const margins  = [...spNums.map(n => `m-${n}`), 'm-auto'];
    const mtVals   = [...spNums.map(n => `mt-${n}`), 'mt-auto'];
    const mbVals   = [...spNums.map(n => `mb-${n}`), 'mb-auto'];
    const mxVals   = [...spNums.map(n => `mx-${n}`), 'mx-auto'];
    const myVals   = [...spNums.map(n => `my-${n}`), 'my-auto'];
    const gaps = ['gap-0','gap-1','gap-2','gap-3','gap-4','gap-6','gap-8','gap-10','gap-12'];
    const radii = ['rounded-none','rounded-sm','rounded','rounded-md','rounded-lg','rounded-xl','rounded-2xl','rounded-3xl','rounded-full'];
    const displays = ['block','inline','inline-block','flex','inline-flex','grid','inline-grid','hidden','contents'];
    const flexDir = ['flex-row','flex-col','flex-row-reverse','flex-col-reverse'];
    const flexOpts = ['flex-1','flex-auto','flex-none','grow','grow-0','shrink','shrink-0','flex-wrap','flex-nowrap'];
    const justify = ['justify-start','justify-center','justify-end','justify-between','justify-around','justify-evenly'];
    const items = ['items-start','items-center','items-end','items-stretch','items-baseline'];
    const self = ['self-auto','self-start','self-center','self-end','self-stretch'];
    const widths = ['w-auto','w-full','w-screen','w-fit','w-min','w-max','w-1/2','w-1/3','w-2/3','w-1/4','w-3/4'];
    const heights = ['h-auto','h-full','h-screen','h-dvh','h-fit','h-8','h-12','h-16','h-24','h-32','h-48','h-64'];
    const maxWidths = ['max-w-none','max-w-xs','max-w-sm','max-w-md','max-w-lg','max-w-xl','max-w-2xl','max-w-3xl','max-w-4xl','max-w-5xl','max-w-6xl','max-w-7xl','max-w-prose','max-w-screen-sm','max-w-screen-md','max-w-screen-lg','max-w-screen-xl','max-w-full'];
    const gridCols = ['grid-cols-1','grid-cols-2','grid-cols-3','grid-cols-4','grid-cols-5','grid-cols-6','grid-cols-7','grid-cols-8','grid-cols-9','grid-cols-10','grid-cols-11','grid-cols-12','grid-cols-none'];
    const colSpans = ['col-span-1','col-span-2','col-span-3','col-span-4','col-span-5','col-span-6','col-span-7','col-span-8','col-span-9','col-span-10','col-span-11','col-span-12','col-span-full'];
    const positions = ['static','relative','absolute','fixed','sticky'];
    const overflow = ['overflow-auto','overflow-hidden','overflow-visible','overflow-scroll','overflow-x-auto','overflow-x-hidden','overflow-y-auto','overflow-y-hidden'];
    const zIndex = ['z-0','z-10','z-20','z-30','z-40','z-50','z-auto'];

    const hasText        = currentText.trim().length > 0;
    const hasPlaceholder = currentPlaceholder.trim().length > 0;

    // Seções colapsadas por padrão — CLASSES fica aberta
    const col = 'section-content hidden';
    const hdrCol = 'section-header collapsed';

    return `
    <div id="panel">
      <div id="panel-header">
        <div class="header-left">
          <span class="tag-badge">${tag}</span>
          <span class="oid-badge">${oid}</span>
        </div>
        <button id="close-btn" title="Fechar (Esc)">✕</button>
      </div>
      <div id="panel-body">

        ${(hasText || hasPlaceholder) ? `
        <div class="section" id="sec-content">
          <div class="${hdrCol}" data-section="content">
            CONTEÚDO <span class="chevron">›</span>
          </div>
          <div class="${col}">
            ${hasText ? `
            <div style="font-size:10px;color:#555;margin-bottom:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Texto</div>
            <textarea class="text-input" id="text-input" rows="2" spellcheck="false">${currentText}</textarea>
            <span class="text-hint">Ou dê duplo-clique no elemento para editar inline.</span>
            <button class="btn btn-primary" id="text-apply-btn" style="flex:none;padding:5px 12px;font-size:11px">✓ Salvar texto</button>
            ` : ''}
            ${hasPlaceholder ? `
            <div style="font-size:10px;color:#555;margin-top:${hasText?'10px':'0'};margin-bottom:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">Placeholder</div>
            <input class="text-input" id="placeholder-input" type="text" value="${currentPlaceholder.replace(/"/g, '&quot;')}" spellcheck="false" style="min-height:unset;height:36px" />
            <button class="btn btn-primary" id="placeholder-apply-btn" style="flex:none;padding:5px 12px;font-size:11px">✓ Salvar placeholder</button>
            ` : ''}
          </div>
        </div>
        ` : ''}

        <div class="section" id="sec-i18n" style="display:none">
          <div class="${hdrCol}" data-section="i18n">
            TRADUÇÕES <span class="chevron">›</span>
          </div>
          <div class="${col}" id="i18n-content">
            <span class="i18n-hint">Detectando...</span>
          </div>
        </div>

        <div class="section" id="sec-classes">
          <div class="section-header" data-section="classes">
            CLASSES <span class="chevron">›</span>
          </div>
          <div class="section-content">
            <div id="current-chips">${buildCurrentClassChips(currentClasses)}</div>
            <div class="modifier-strip">
              <div class="modifier-row">
                <span class="modifier-label">Break</span>
                <div class="chips">
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="">—</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="sm:">sm:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="md:">md:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="lg:">lg:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="xl:">xl:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="2xl:">2xl:</div>
                </div>
              </div>
              <div class="modifier-row">
                <span class="modifier-label">Estado</span>
                <div class="chips">
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="">—</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="hover:">hover:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="focus:">focus:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="active:">active:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="dark:">dark:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="disabled:">disabled:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="focus-within:">fw:</div>
                </div>
              </div>
            </div>
            <div class="search-wrap">
              <input class="search-input" id="class-search" placeholder="Buscar ou adicionar classe..." autocomplete="off" spellcheck="false" />
              <div class="suggestions" id="suggestions" style="display:none"></div>
            </div>
            <textarea class="classes-input" id="classes-input" rows="3" spellcheck="false">${currentClasses}</textarea>
          </div>
        </div>

        <div class="section" id="sec-typography">
          <div class="${hdrCol}" data-section="typography">
            TIPOGRAFIA <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">Tamanho</span>${chips(textSizes)}</div>
            <div class="row"><span class="row-label">Peso</span>${chips(fontWeights)}</div>
            <div class="row"><span class="row-label">Cor texto</span>${buildColorSwatches('text')}</div>
          </div>
        </div>

        <div class="section" id="sec-spacing">
          <div class="${hdrCol}" data-section="spacing">
            ESPAÇAMENTO <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">p</span>${chips(paddings)}</div>
            <div class="row"><span class="row-label">pt</span>${chips(ptVals)}</div>
            <div class="row"><span class="row-label">pb</span>${chips(pbVals)}</div>
            <div class="row"><span class="row-label">px</span>${chips(pxVals)}</div>
            <div class="row"><span class="row-label">py</span>${chips(pyVals)}</div>
            <div class="row"><span class="row-label">m</span>${chips(margins)}</div>
            <div class="row"><span class="row-label">mt</span>${chips(mtVals)}</div>
            <div class="row"><span class="row-label">mb</span>${chips(mbVals)}</div>
            <div class="row"><span class="row-label">mx</span>${chips(mxVals)}</div>
            <div class="row"><span class="row-label">my</span>${chips(myVals)}</div>
            <div class="row"><span class="row-label">gap</span>${chips(gaps)}</div>
          </div>
        </div>

        <div class="section" id="sec-background">
          <div class="${hdrCol}" data-section="background">
            BACKGROUND <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row">${buildColorSwatches('bg')}</div>
          </div>
        </div>

        <div class="section" id="sec-border">
          <div class="${hdrCol}" data-section="border">
            BORDA <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">Radius</span>${chips(radii)}</div>
          </div>
        </div>

        <div class="section" id="sec-layout">
          <div class="${hdrCol}" data-section="layout">
            LAYOUT <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">Display</span>${chips(displays)}</div>
            <div class="row"><span class="row-label">Flex dir</span>${chips(flexDir)}</div>
            <div class="row"><span class="row-label">Flex</span>${chips(flexOpts)}</div>
            <div class="row"><span class="row-label">Justify</span>${chips(justify)}</div>
            <div class="row"><span class="row-label">Align</span>${chips(items)}</div>
            <div class="row"><span class="row-label">Self</span>${chips(self)}</div>
            <div class="row"><span class="row-label">Largura</span>${chips(widths)}</div>
            <div class="row"><span class="row-label">Max-w</span>${chips(maxWidths)}</div>
            <div class="row"><span class="row-label">Altura</span>${chips(heights)}</div>
            <div class="row"><span class="row-label">Grid cols</span>${chips(gridCols)}</div>
            <div class="row"><span class="row-label">Col span</span>${chips(colSpans)}</div>
            <div class="row"><span class="row-label">Position</span>${chips(positions)}</div>
            <div class="row"><span class="row-label">Overflow</span>${chips(overflow)}</div>
            <div class="row"><span class="row-label">Z-index</span>${chips(zIndex)}</div>
          </div>
        </div>

      </div>
      <div id="panel-footer">
        <button class="btn btn-secondary" id="undo-btn">↩ Desfazer</button>
        <button class="btn btn-primary" id="apply-btn">✓ Aplicar classes</button>
      </div>
    </div>`;
}

/* ── Mutual exclusion groups for Tailwind classes ────────────────────────── */
const MUTUALLY_EXCLUSIVE = [
    /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
    /^bg-/,
    /^text-(slate|gray|zinc|red|orange|amber|yellow|lime|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-/,
    /^text-(white|black)$/,
    /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden|contents)$/,
    /^flex-(row|col|row-reverse|col-reverse)$/,
    /^justify-(start|center|end|between|around|evenly)$/,
    /^items-(start|center|end|stretch|baseline)$/,
    /^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/,
    /^gap-/,
    /^p-(\d|auto)/,
    /^px-/,
    /^py-/,
    /^pt-/,
    /^pb-/,
    /^m-(\d|auto)/,
    /^mx-/,
    /^my-/,
    /^mt-/,
    /^mb-/,
    /^ml-/,
    /^mr-/,
    /^w-/,
    /^h-/,
    /^max-w-/,
    /^min-w-/,
    /^max-h-/,
    /^min-h-/,
    /^grid-cols-/,
    /^col-span-/,
    /^grid-rows-/,
    /^row-span-/,
    /^(static|fixed|absolute|relative|sticky)$/,
    /^overflow-(?!x|y)/,
    /^overflow-x-/,
    /^overflow-y-/,
];

export class VisualEditPanel {
    /** Set to true while the panel header is being dragged.
     *  content.ts reads this to skip deselect on the spurious click that
     *  fires after mouseup when the pointer is released outside the shadow DOM. */
    static dragging = false;

    private host: HTMLElement;
    private shadow: ShadowRoot;
    private oid = '';
    private element: HTMLElement | null = null;
    private elementTag = '';
    private originalClasses = '';
    private pendingClasses = '';
    private history: string[] = [];
    private i18nInfo: I18nInfo | null = null;
    private selectedLocale = '';
    private callbacks: PanelCallbacks;
    private panelPosition: { left: number; top: number } | null = null;
    private dragCleanup: (() => void) | null = null;
    /** DOM text content at the moment the panel opened — used for prop resolution. */
    private originalText = '';
    /** Active responsive breakpoint prefix, e.g. 'lg:' or '' for none. */
    private activeResponsive = '';
    /** Active state variant prefix, e.g. 'hover:' or '' for none. */
    private activeState = '';

    private get activePrefix(): string {
        return this.activeResponsive + this.activeState;
    }

    constructor(callbacks: PanelCallbacks) {
        this.callbacks = callbacks;
        // Clean up any orphan hosts left behind by previous content-script
        // injections (extension reloads leave the DOM intact while replacing
        // the JS context, so multiple hosts can accumulate).
        document.querySelectorAll('#ve-panel-host').forEach(el => el.remove());
        this.host = document.createElement('div');
        this.host.id = 've-panel-host';
        this.shadow = this.host.attachShadow({ mode: 'closed' });
        document.body.appendChild(this.host);
    }

    show(el: HTMLElement, oid: string): void {
        this.oid = oid;
        this.element = el;
        this.elementTag = el.tagName.toLowerCase();
        this.originalClasses = el.className;
        this.pendingClasses = el.className;
        this.history = [];
        this.i18nInfo = null;
        this.selectedLocale = '';
        // Snapshot the current DOM text so the bridge can locate the prop in
        // the parent component (e.g. label="First name" in ContactPage.tsx).
        this.originalText = this.currentText();
        // Reset modifier prefixes each time a new element is selected
        this.activeResponsive = '';
        this.activeState = '';
        // Injeta CSS para as classes atuais do elemento (garante preview correto)
        injectClassesForPreview(el.className);
        this.render();
        this.loadI18n(oid); // async — popula seção depois de renderizar
    }

    private async loadI18n(oid: string): Promise<void> {
        try {
            const res = await fetch(`${BRIDGE}/i18n/detect?oid=${encodeURIComponent(oid)}`, {
                signal: AbortSignal.timeout(2000),
            });
            const data = await res.json() as {
                ok: boolean; i18n: boolean;
                key?: string; locales?: string[];
                translations?: Record<string, string>;
                files?: Record<string, string>;
            };

            if (!data.ok || !data.i18n || !data.key) return;

            const sec = this.shadow.querySelector('#sec-i18n') as HTMLElement | null;
            if (!sec) return;

            this.i18nInfo = {
                key: data.key,
                locales: data.locales ?? [],
                translations: data.translations ?? {},
                files: data.files ?? {},
            };
            this.selectedLocale = this.i18nInfo.locales[0] ?? '';

            sec.style.display = 'block';
            // Auto-expande a seção quando i18n é detectado
            const i18nContent = sec.querySelector('.section-content') as HTMLElement | null;
            const i18nHdr = sec.querySelector('.section-header') as HTMLElement | null;
            i18nContent?.classList.remove('hidden');
            i18nHdr?.classList.remove('collapsed');
            this.renderI18nContent();
        } catch { /* bridge offline ou sem i18n */ }
    }

    private renderI18nContent(): void {
        const content = this.shadow.querySelector('#i18n-content');
        if (!content || !this.i18nInfo) return;

        const { key, locales, translations } = this.i18nInfo;
        const currentValue = translations[this.selectedLocale] ?? '';

        content.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:10px;color:#555">Chave:</span>
            <span class="i18n-key">${key}</span>
          </div>
          <div class="locale-tabs" id="locale-tabs">
            ${locales.map(l =>
                `<div class="locale-tab${l === this.selectedLocale ? ' active' : ''}" data-locale="${l}">${l}</div>`
            ).join('')}
          </div>
          <textarea class="text-input" id="i18n-value" rows="2" spellcheck="false">${currentValue}</textarea>
          <button class="btn btn-primary" id="i18n-save-btn" style="flex:none;padding:5px 12px;font-size:11px">✓ Salvar tradução</button>
          <span class="i18n-hint">Altera o arquivo de mensagens do idioma selecionado.</span>
        `;

        // Tabs de idioma
        content.querySelectorAll('.locale-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.selectedLocale = (tab as HTMLElement).dataset.locale ?? '';
                this.renderI18nContent();
            });
        });

        // Salvar tradução
        content.querySelector('#i18n-save-btn')?.addEventListener('click', async () => {
            const btn = content.querySelector('#i18n-save-btn') as HTMLButtonElement;
            const textarea = content.querySelector('#i18n-value') as HTMLTextAreaElement;
            if (!this.i18nInfo || !textarea) return;

            btn.disabled = true;
            btn.textContent = '…';

            try {
                const res = await fetch(`${BRIDGE}/i18n/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: this.i18nInfo.key,
                        locale: this.selectedLocale,
                        value: textarea.value,
                        filePath: this.i18nInfo.files[this.selectedLocale],
                    }),
                });
                const data = await res.json() as { ok: boolean };
                if (data.ok) {
                    this.i18nInfo.translations[this.selectedLocale] = textarea.value;
                    this.showToast(`${this.selectedLocale}: tradução salva ✓`, 'success');
                } else {
                    this.showToast('Erro ao salvar tradução', 'error');
                }
            } catch {
                this.showToast('Bridge offline?', 'error');
            }

            btn.disabled = false;
            btn.textContent = '✓ Salvar tradução';
        });
    }

    hide(): void {
        this.dragCleanup?.();
        this.dragCleanup = null;
        this.shadow.innerHTML = '';
    }
    isVisible(): boolean { return Boolean(this.shadow.querySelector('#panel')); }

    private currentText(): string {
        if (!this.element) return '';
        // Get direct text nodes only (not deeply nested)
        return Array.from(this.element.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim() ?? '')
            .filter(Boolean)
            .join(' ');
    }

    private currentPlaceholder(): string {
        return this.element?.getAttribute('placeholder') ?? '';
    }

    private render(): void {
        const tag = this.elementTag || 'div';
        const style = document.createElement('style');
        style.textContent = CSS;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildPanel(this.oid, tag, this.pendingClasses, this.currentText(), this.currentPlaceholder());
        this.shadow.innerHTML = '';
        this.shadow.appendChild(style);
        this.shadow.appendChild(wrapper);
        this.bindEvents();
        this.syncActiveChips(this.pendingClasses);

        // Restore dragged position (if the user has moved the panel before)
        if (this.panelPosition) {
            const panelEl = this.shadow.querySelector('#panel') as HTMLElement | null;
            if (panelEl) {
                panelEl.style.right = 'auto';
                panelEl.style.left = `${this.panelPosition.left}px`;
                panelEl.style.top = `${this.panelPosition.top}px`;
            }
        }

        // Auto-expande seção relevante ao tipo de elemento
        const TEXT_TAGS = new Set(['span','p','h1','h2','h3','h4','h5','h6','a','label','li','td','th','dt','dd','blockquote','em','strong','b','i','u','s','figcaption']);
        const autoSection = TEXT_TAGS.has(tag) ? 'typography' : 'layout';
        const autoContent = this.shadow.querySelector(`#sec-${autoSection} .section-content`);
        const autoHdr = this.shadow.querySelector(`#sec-${autoSection} .section-header`);
        autoContent?.classList.remove('hidden');
        autoHdr?.classList.remove('collapsed');
    }

    private syncActiveChips(classes: string): void {
        const set = new Set(classes.split(/\s+/).filter(Boolean));
        const prefix = this.activePrefix;

        // Atualiza chips de seção (tipografia, espaçamento, etc.)
        // A chip is highlighted if either the plain class OR the prefixed variant is active.
        this.shadow.querySelectorAll('.chip[data-class]').forEach(chip => {
            const cls = (chip as HTMLElement).dataset.class ?? '';
            const isCurrentChip = chip.closest('#current-chips') !== null;
            if (!isCurrentChip) {
                chip.classList.toggle('active', set.has(cls) || (prefix !== '' && set.has(prefix + cls)));
            }
        });

        // Atualiza swatches de cor
        this.shadow.querySelectorAll('.swatch').forEach(swatch => {
            const cls = (swatch as HTMLElement).dataset.class ?? '';
            swatch.classList.toggle('active', set.has(cls) || (prefix !== '' && set.has(prefix + cls)));
        });

        // Atualiza o textarea de classes
        const input = this.shadow.querySelector('#classes-input') as HTMLTextAreaElement | null;
        if (input) input.value = classes;

        // Rebuild dos current-class chips para refletir o estado atual
        const currentChipsEl = this.shadow.querySelector('#current-chips');
        if (currentChipsEl) {
            currentChipsEl.innerHTML = buildCurrentClassChips(classes);
            // Re-bind: current chips always toggle the exact class they represent (no prefix)
            currentChipsEl.querySelectorAll('.chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const cls = (chip as HTMLElement).dataset.class ?? '';
                    if (cls) this.toggleClass(cls, true);
                });
            });
        }
    }

    /** Toggle a Tailwind class, optionally prepending the active modifier prefix.
     *  @param cls        Base class name (e.g. 'grid-cols-2' or, for current-chip clicks, the full 'lg:grid-cols-2')
     *  @param ignorePrefix  When true (current-chip clicks) the active prefix is NOT prepended — cls is used verbatim.
     */
    private toggleClass(cls: string, ignorePrefix = false): void {
        const prefix = ignorePrefix ? '' : this.activePrefix;
        const fullCls = prefix + cls;
        const parts = new Set(this.pendingClasses.split(/\s+/).filter(Boolean));
        if (parts.has(fullCls)) {
            parts.delete(fullCls);
        } else {
            // Mutual exclusion: strip all existing classes in the same group that share the same prefix
            for (const re of MUTUALLY_EXCLUSIVE) {
                if (re.test(cls)) {
                    for (const ex of parts) {
                        // Strip every modifier prefix from `ex` to get the base class
                        const exBase = ex.replace(/^(?:[a-z0-9-]+:)+/, '');
                        const exPrefix = ex.slice(0, ex.length - exBase.length);
                        if (exPrefix === prefix && re.test(exBase)) parts.delete(ex);
                    }
                    break;
                }
            }
            parts.add(fullCls);
            // Garante que o CSS da nova classe existe no documento para preview imediato
            injectClassForPreview(fullCls);
        }
        this.pendingClasses = Array.from(parts).join(' ');
        if (this.element) this.element.className = this.pendingClasses;
        this.syncActiveChips(this.pendingClasses);
    }

    /** Syncs the `.active` state of all modifier prefix buttons to the current selection. */
    private updatePrefixButtons(): void {
        this.shadow.querySelectorAll('.prefix-btn[data-prefix-type]').forEach(btn => {
            const type = (btn as HTMLElement).dataset.prefixType;
            const val  = (btn as HTMLElement).dataset.prefixVal ?? '';
            if (type === 'responsive') {
                btn.classList.toggle('active', val === this.activeResponsive);
            } else if (type === 'state') {
                btn.classList.toggle('active', val === this.activeState);
            }
        });
    }

    private bindEvents(): void {
        // Belt-and-suspenders: impede que cliques/pointer events dentro do painel
        // propaguem para fora do shadow DOM e acionem handlers no document.
        const panelEl = this.shadow.querySelector('#panel');
        if (panelEl) {
            const stopAll = (e: Event) => e.stopPropagation();
            panelEl.addEventListener('click', stopAll);
            panelEl.addEventListener('mousedown', stopAll);
            panelEl.addEventListener('pointerdown', stopAll);
        }

        // ── Drag to reposition ────────────────────────────────────────────
        // We use pointer capture (setPointerCapture) so that pointermove and
        // pointerup are always dispatched to the header element inside the
        // shadow DOM, even when the pointer moves outside it.  This ensures
        // the resulting click event (if any) fires with the shadow host in its
        // composedPath, so isInsidePanel() in content.ts returns true and the
        // panel is NOT closed when the user releases the mouse.
        const headerEl = this.shadow.querySelector('#panel-header') as HTMLElement | null;
        const panelDomEl = this.shadow.querySelector('#panel') as HTMLElement | null;

        if (headerEl && panelDomEl) {
            const onPointerDown = (e: Event) => {
                const pe = e as PointerEvent;
                // Don't drag when clicking the close button
                if ((pe.target as HTMLElement).closest('#close-btn')) return;

                // Capture all subsequent pointer events to this element so
                // pointermove / pointerup stay inside the shadow DOM.
                headerEl.setPointerCapture(pe.pointerId);
                // NOTE: do NOT call pe.preventDefault() here — for mouse input,
                // Chrome interprets that as "suppress the subsequent click
                // events", which breaks shadow-DOM click handlers (close button,
                // section toggles, etc.).

                // Signal to content.ts that we are dragging so the spurious
                // click that fires after mouseup (when pointer is outside the
                // shadow host) does not trigger a deselect.
                VisualEditPanel.dragging = true;

                const rect = panelDomEl.getBoundingClientRect();
                const startX = pe.clientX;
                const startY = pe.clientY;
                const startLeft = rect.left;
                const startTop = rect.top;

                // Switch panel from right-anchored to left-anchored immediately
                panelDomEl.style.right = 'auto';
                panelDomEl.style.left = `${startLeft}px`;
                panelDomEl.style.top = `${startTop}px`;

                headerEl.classList.add('dragging');

                const PANEL_W = 310;
                const PANEL_H_MIN = 60; // at least the header stays visible

                const onPointerMove = (moveEvt: Event) => {
                    const me = moveEvt as PointerEvent;
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;
                    const newLeft = Math.max(0, Math.min(window.innerWidth - PANEL_W, startLeft + dx));
                    const newTop = Math.max(0, Math.min(window.innerHeight - PANEL_H_MIN, startTop + dy));
                    panelDomEl.style.left = `${newLeft}px`;
                    panelDomEl.style.top = `${newTop}px`;
                    this.panelPosition = { left: newLeft, top: newTop };
                };

                const onPointerUp = () => {
                    headerEl.classList.remove('dragging');
                    headerEl.removeEventListener('pointermove', onPointerMove);
                    headerEl.removeEventListener('pointerup', onPointerUp);
                    this.dragCleanup = null;
                    // Clear the drag flag AFTER the click event fires.
                    // The browser fires click synchronously after mouseup in the
                    // same task; setTimeout(0) queues a new macrotask that runs
                    // only after all pending event handlers (including onClick in
                    // content.ts) have completed.
                    setTimeout(() => { VisualEditPanel.dragging = false; }, 0);
                };

                headerEl.addEventListener('pointermove', onPointerMove);
                headerEl.addEventListener('pointerup', onPointerUp);

                // Store cleanup so hide() can tear down mid-drag listeners
                this.dragCleanup = () => {
                    headerEl.removeEventListener('pointermove', onPointerMove);
                    headerEl.removeEventListener('pointerup', onPointerUp);
                    try { headerEl.releasePointerCapture(pe.pointerId); } catch { /* ignore */ }
                    VisualEditPanel.dragging = false;
                };
            };

            headerEl.addEventListener('pointerdown', onPointerDown);
        }

        // Current-class chips (primeiro bind — depois syncActiveChips os refaz)
        this.shadow.querySelector('#current-chips')?.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const cls = (chip as HTMLElement).dataset.class ?? '';
                if (cls) this.toggleClass(cls, true); // ignore prefix: current chips are already fully-qualified
            });
        });

        // ── Modifier prefix buttons ───────────────────────────────────────
        this.shadow.querySelectorAll('.prefix-btn[data-prefix-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = (btn as HTMLElement).dataset.prefixType;
                const val  = (btn as HTMLElement).dataset.prefixVal ?? '';
                if (type === 'responsive') {
                    // Toggle: clicking the active button resets to none
                    this.activeResponsive = this.activeResponsive === val ? '' : val;
                } else if (type === 'state') {
                    this.activeState = this.activeState === val ? '' : val;
                }
                this.updatePrefixButtons();
                this.syncActiveChips(this.pendingClasses);
            });
        });
        // Set initial active state on prefix buttons
        this.updatePrefixButtons();

        // Close
        this.shadow.querySelector('#close-btn')?.addEventListener('click', () => {
            if (this.element) this.element.className = this.originalClasses;
            this.callbacks.onClose();
            this.hide();
        });

        // Section collapse
        this.shadow.querySelectorAll('.section-header').forEach(hdr => {
            hdr.addEventListener('click', () => {
                const sec = (hdr as HTMLElement).dataset.section;
                const content = this.shadow.querySelector(`#sec-${sec} .section-content`);
                if (!content) return;
                const hidden = (content as HTMLElement).classList.toggle('hidden');
                hdr.classList.toggle('collapsed', hidden);
            });
        });

        // Chips (seções de tipografia, espaçamento, etc. — não inclui current-chips que são bindados em syncActiveChips)
        this.shadow.querySelectorAll('.chip[data-class]').forEach(chip => {
            if (chip.closest('#current-chips')) return; // handled in syncActiveChips
            chip.addEventListener('click', () => {
                const cls = (chip as HTMLElement).dataset.class ?? '';
                if (cls) this.toggleClass(cls);
            });
        });

        // Swatches
        this.shadow.querySelectorAll('.swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const cls = (swatch as HTMLElement).dataset.class ?? '';
                if (cls) this.toggleClass(cls);
            });
        });

        // Class textarea manual edit
        const classInput = this.shadow.querySelector('#classes-input') as HTMLTextAreaElement;
        classInput?.addEventListener('input', () => {
            this.pendingClasses = classInput.value;
            injectClassesForPreview(this.pendingClasses);
            if (this.element) this.element.className = this.pendingClasses;
            this.syncActiveChips(this.pendingClasses);
        });

        // ── Class search ──────────────────────────────────────────────────
        const searchInput = this.shadow.querySelector('#class-search') as HTMLInputElement;
        const suggBox = this.shadow.querySelector('#suggestions') as HTMLElement;

        // Prefixos relevantes por tipo de elemento — usados para ordenar sugestões
        const TEXT_TAGS = new Set(['span','p','h1','h2','h3','h4','h5','h6','a','label','li','td','th','dt','dd','caption','figcaption','blockquote','cite','em','strong','small','b','i','u','s']);
        const IMG_TAGS  = new Set(['img','picture','figure','video','canvas','svg']);

        function relevantPrefixesForTag(tag: string): string[] {
            if (TEXT_TAGS.has(tag)) return ['text-','font-','tracking-','leading-','uppercase','lowercase','capitalize','underline','truncate','whitespace-'];
            if (IMG_TAGS.has(tag))  return ['w-','h-','max-w-','object-','rounded-','aspect-'];
            // div, section, nav, header, footer, main, article, aside, form, ul, ol …
            return ['flex','grid','items-','justify-','gap-','p-','px-','py-','pt-','pb-','w-','h-','rounded-'];
        }
        const relevantPrefixes = relevantPrefixesForTag(this.elementTag);

        /** Renderiza sugestões no dropdown. Inclui classes do elemento + lista padrão do Tailwind priorizada por tipo. */
        const showSuggestions = (q: string) => {
            const active = new Set(this.pendingClasses.split(/\s+/).filter(Boolean));
            // Classes próprias do elemento: sempre aparecem primeiro
            const elementClasses = Array.from(active);

            let matches: string[];
            if (!q) {
                // Sem query: classes do elemento + sugestões relevantes ao tipo de tag
                const elementOnly = elementClasses.slice(0, 8);
                const relevant = ALL_CLASSES
                    .filter(c => !active.has(c) && relevantPrefixes.some(p => c.startsWith(p)))
                    .slice(0, 8);
                const others = ALL_CLASSES.filter(c => !active.has(c) && !relevant.includes(c)).slice(0, 4);
                matches = [...elementOnly, ...relevant, ...others];
            } else {
                // Ranking: exact(100) > active exact(95) > starts-with relevant(60) > starts-with(50) > contains relevant(30) > contains(10)
                type Scored = { c: string; score: number };
                const scored: Scored[] = [];
                // Element's own active classes
                for (const c of elementClasses) {
                    if (!c.includes(q)) continue;
                    scored.push({ c, score: c === q ? 95 : c.startsWith(q) ? 70 : 40 });
                }
                // ALL_CLASSES
                for (const c of ALL_CLASSES) {
                    if (!c.includes(q)) continue;
                    if (active.has(c)) continue; // already in element, handled above
                    const isRelevant = relevantPrefixes.some(p => c.startsWith(p));
                    let score = c === q ? 100 : c.startsWith(q) ? (isRelevant ? 60 : 50) : (isRelevant ? 30 : 10);
                    scored.push({ c, score });
                }
                scored.sort((a, b) => b.score - a.score);
                matches = scored.slice(0, 20).map(s => s.c);
            }

            if (!matches.length) { suggBox.style.display = 'none'; return; }

            suggBox.innerHTML = matches.map(c =>
                `<div class="suggestion${active.has(c) ? ' active-cls' : ''}" data-class="${c}">
                   <span>${c}</span>
                   ${active.has(c) ? '<span class="suggestion-badge">ativo</span>' : ''}
                 </div>`
            ).join('');
            suggBox.style.display = 'block';

            // Hover preview + click
            suggBox.querySelectorAll('.suggestion').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    const cls = (item as HTMLElement).dataset.class ?? '';
                    if (this.element && cls && !active.has(cls)) {
                        injectClassForPreview(cls);
                        this.element.className = this.pendingClasses + ' ' + cls;
                    }
                });
                item.addEventListener('mouseleave', () => {
                    if (this.element) this.element.className = this.pendingClasses;
                });
                item.addEventListener('click', () => {
                    const cls = (item as HTMLElement).dataset.class ?? '';
                    if (cls) {
                        this.toggleClass(cls);
                        searchInput.value = '';
                        suggBox.style.display = 'none';
                    }
                });
            });
        };

        searchInput?.addEventListener('focus', () => showSuggestions(searchInput.value.trim().toLowerCase()));

        searchInput?.addEventListener('input', () => {
            showSuggestions(searchInput.value.trim().toLowerCase());
        });

        searchInput?.addEventListener('keydown', e => {
            if (e.key === 'Escape') { suggBox.style.display = 'none'; searchInput.value = ''; }
        });

        // Fecha dropdown ao perder foco (blur) — delay para deixar click em suggestion disparar primeiro
        searchInput?.addEventListener('blur', () => {
            setTimeout(() => { suggBox.style.display = 'none'; }, 180);
        });

        // Fecha dropdown ao clicar em qualquer área do panel fora do search-wrap
        // Nota: usamos pointerdown (antes do blur) para evitar race condition
        panelEl?.addEventListener('pointerdown', (e: Event) => {
            if (!(e.target as HTMLElement).closest('.search-wrap')) {
                suggBox.style.display = 'none';
            }
        }, { capture: false });

        // ── Text apply ────────────────────────────────────────────────────
        const textInput = this.shadow.querySelector('#text-input') as HTMLTextAreaElement | null;
        const textApplyBtn = this.shadow.querySelector('#text-apply-btn') as HTMLButtonElement | null;

        // Live preview on text input
        textInput?.addEventListener('input', () => {
            if (this.element) {
                const textNodes = Array.from(this.element.childNodes)
                    .filter(n => n.nodeType === Node.TEXT_NODE);
                if (textNodes.length > 0) {
                    textNodes[0]!.textContent = textInput.value;
                }
            }
        });

        textApplyBtn?.addEventListener('click', async () => {
            if (!textInput) return;
            textApplyBtn.disabled = true;
            textApplyBtn.textContent = '…';
            const ok = await this.callbacks.onTextApply(this.oid, textInput.value, this.originalText);
            textApplyBtn.disabled = false;
            textApplyBtn.textContent = '✓ Salvar texto';
            this.showToast(ok ? 'Texto salvo ✓' : 'Bridge offline?', ok ? 'success' : 'error');
        });

        // ── Placeholder apply ─────────────────────────────────────────────
        const placeholderInput = this.shadow.querySelector('#placeholder-input') as HTMLInputElement | null;
        const placeholderBtn   = this.shadow.querySelector('#placeholder-apply-btn') as HTMLButtonElement | null;

        // Live preview
        placeholderInput?.addEventListener('input', () => {
            if (this.element) this.element.setAttribute('placeholder', placeholderInput.value);
        });

        placeholderBtn?.addEventListener('click', async () => {
            if (!placeholderInput) return;
            placeholderBtn.disabled = true;
            placeholderBtn.textContent = '…';
            const ok = await this.callbacks.onAttrApply(this.oid, 'placeholder', placeholderInput.value, this.currentPlaceholder());
            placeholderBtn.disabled = false;
            placeholderBtn.textContent = '✓ Salvar placeholder';
            this.showToast(ok ? 'Placeholder salvo ✓' : 'Bridge offline?', ok ? 'success' : 'error');
        });

        // ── Class apply ───────────────────────────────────────────────────
        const applyBtn = this.shadow.querySelector('#apply-btn') as HTMLButtonElement;
        applyBtn?.addEventListener('click', async () => {
            applyBtn.disabled = true;
            applyBtn.textContent = '…';
            const ok = await this.callbacks.onApply(this.oid, this.pendingClasses);
            applyBtn.disabled = false;
            applyBtn.textContent = '✓ Aplicar classes';
            if (ok) {
                this.history.push(this.originalClasses);
                this.originalClasses = this.pendingClasses;
                this.showToast('Classes salvas ✓', 'success');
            } else {
                this.showToast('Erro — bridge offline?', 'error');
            }
        });

        // ── Undo ──────────────────────────────────────────────────────────
        const undoBtn = this.shadow.querySelector('#undo-btn') as HTMLButtonElement;
        undoBtn?.addEventListener('click', async () => {
            const prev = this.history.pop();
            if (!prev) { this.showToast('Nada para desfazer', 'error'); return; }
            const ok = await this.callbacks.onApply(this.oid, prev);
            if (ok) {
                this.pendingClasses = prev;
                this.originalClasses = prev;
                if (this.element) this.element.className = prev;
                this.syncActiveChips(prev);
                this.showToast('Desfeito ✓', 'success');
            }
        });
    }

    private showToast(msg: string, type: 'success' | 'error'): void {
        this.shadow.querySelector('.toast')?.remove();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        this.shadow.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    destroy(): void { this.host.remove(); }
}
