/* -----------------------------------------------------------------------
   Panel UI — shadow DOM
   - Seção CONTEÚDO: editar texto do elemento
   - Seção CLASSES: busca com preview ao vivo + quick-picks
   - Seção TIPOGRAFIA, ESPAÇAMENTO, BACKGROUND, BORDA, LAYOUT
   - Undo / Aplicar
   ----------------------------------------------------------------------- */

import { injectClassForPreview, injectClassesForPreview } from './tailwind-inject';
import { subscribeLanguageChange, t } from './i18n';

const BRIDGE = 'http://localhost:5179';

export interface I18nInfo {
    key: string;
    locales: string[];
    translations: Record<string, string>;
    files: Record<string, string>;
}

interface ProjectClassInfo {
    className: string;
    count: number;
}

interface ProjectClassBundle {
    tag: string;
    classes: string;
    count: number;
}

type EditScope = 'instance' | 'component';
export type EditResponse = { ok: boolean; error?: string };

export interface PanelShowOptions {
    forceScope?: EditScope;
    hideScopeControl?: boolean;
}

export interface PanelCallbacks {
    onApply: (oid: string, classes: string, scope: EditScope) => Promise<EditResponse>;
    /** newText = what the user typed; originalText = DOM text when panel opened */
    onTextApply: (oid: string, newText: string, originalText: string, scope: EditScope) => Promise<EditResponse>;
    /** Update a specific JSX attribute (e.g. placeholder) on the element */
    onAttrApply: (oid: string, attrName: string, newValue: string, currentValue: string, scope: EditScope) => Promise<EditResponse>;
    onInsertElement: (oid: string, preset: 'text' | 'button' | 'group' | 'image') => Promise<EditResponse>;
    onRemoveElement: (oid: string) => Promise<EditResponse>;
    onStartCopyStyle: (oid: string) => void;
    onClose: () => void;
}

/* ── Tailwind palette ───────────────────────────────────────────────────── */
const TAILWIND_COLORS = [
    'slate','gray','zinc','neutral','stone','red','orange','amber','yellow','lime',
    'green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose',
];
const COLOR_SHADES = [50,100,200,300,400,500,600,700,800,900,950];
const COLOR_HEX: Record<string,Record<number,string>> = {
    slate:{50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a',950:'#020617'},
    gray:{50:'#f9fafb',100:'#f3f4f6',200:'#e5e7eb',300:'#d1d5db',400:'#9ca3af',500:'#6b7280',600:'#4b5563',700:'#374151',800:'#1f2937',900:'#111827',950:'#030712'},
    zinc:{50:'#fafafa',100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#52525b',700:'#3f3f46',800:'#27272a',900:'#18181b',950:'#09090b'},
    neutral:{50:'#fafafa',100:'#f5f5f5',200:'#e5e5e5',300:'#d4d4d4',400:'#a3a3a3',500:'#737373',600:'#525252',700:'#404040',800:'#262626',900:'#171717',950:'#0a0a0a'},
    stone:{50:'#fafaf9',100:'#f5f5f4',200:'#e7e5e4',300:'#d6d3d1',400:'#a8a29e',500:'#78716c',600:'#57534e',700:'#44403c',800:'#292524',900:'#1c1917',950:'#0c0a09'},
    red:{50:'#fef2f2',100:'#fee2e2',200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d',950:'#450a0a'},
    orange:{50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407'},
    amber:{50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f',950:'#451a03'},
    yellow:{50:'#fefce8',100:'#fef9c3',200:'#fef08a',300:'#fde047',400:'#facc15',500:'#eab308',600:'#ca8a04',700:'#a16207',800:'#854d0e',900:'#713f12',950:'#422006'},
    lime:{50:'#f7fee7',100:'#ecfccb',200:'#d9f99d',300:'#bef264',400:'#a3e635',500:'#84cc16',600:'#65a30d',700:'#4d7c0f',800:'#3f6212',900:'#365314',950:'#1a2e05'},
    green:{50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',800:'#166534',900:'#14532d',950:'#052e16'},
    emerald:{50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b',950:'#022c22'},
    teal:{50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a',950:'#042f2e'},
    cyan:{50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63',950:'#083344'},
    sky:{50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e',950:'#082f49'},
    blue:{50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8f',950:'#172554'},
    indigo:{50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81',950:'#1e1b4b'},
    violet:{50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95',950:'#2e1065'},
    purple:{50:'#faf5ff',100:'#f3e8ff',200:'#e9d5ff',300:'#d8b4fe',400:'#c084fc',500:'#a855f7',600:'#9333ea',700:'#7e22ce',800:'#6b21a8',900:'#581c87',950:'#3b0764'},
    fuchsia:{50:'#fdf4ff',100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75',950:'#4a044e'},
    pink:{50:'#fdf2f8',100:'#fce7f3',200:'#fbcfe8',300:'#f9a8d4',400:'#f472b6',500:'#ec4899',600:'#db2777',700:'#be185d',800:'#9d174d',900:'#831843',950:'#500724'},
    rose:{50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337',950:'#4c0519'},
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
    // Gradients
    ['t','tr','r','br','b','bl','l','tl'].forEach(d => list.push(`bg-gradient-to-${d}`, `bg-linear-to-${d}`));
    [0,10,15,30,45,60,65,90,120,135,180,225,270,315].forEach(d => {
        list.push(`bg-linear-${d}`, `bg-conic-${d}`);
    });
    list.push('bg-radial','bg-radial-[at_50%_75%]','bg-radial-[at_25%_25%]','bg-conic','bg-none');
    ['srgb','hsl','oklab','oklch','longer','shorter','increasing','decreasing'].forEach(mode => {
        list.push(`bg-linear-to-r/${mode}`, `bg-radial/${mode}`, `bg-conic/${mode}`);
    });
    [0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100].forEach(p => {
        list.push(`from-${p}%`, `via-${p}%`, `to-${p}%`);
    });
    for (const color of TAILWIND_COLORS) {
        for (const shade of COLOR_SHADES) {
            list.push(`from-${color}-${shade}`, `via-${color}-${shade}`, `to-${color}-${shade}`);
        }
    }
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
    ['x','y','t','r','b','l'].forEach(side => ['0','','2','4','8'].forEach(w => list.push(`border-${side}${w ? '-'+w : ''}`)));
    list.push('border-solid','border-dashed','border-dotted','border-double','border-none');
    [0,1,2,4,8].forEach(w => list.push(`ring${w ? '-'+w : ''}`, `ring-offset-${w}`));
    // Shadow
    ['xs','sm','','md','lg','xl','2xl','inner','none'].forEach(s => list.push(`shadow${s ? '-'+s : ''}`));
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

const GRADIENT_TEMPLATES = [
    { name: 'Sunset', classes: 'bg-linear-to-r from-orange-500 via-pink-500 to-purple-600' },
    { name: 'Ocean', classes: 'bg-linear-to-r from-cyan-500 to-blue-600' },
    { name: 'Dusk', classes: 'bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500' },
    { name: 'Sunrise', classes: 'bg-linear-to-r from-yellow-400 via-orange-500 to-red-500' },
    { name: 'Cool Water', classes: 'bg-linear-to-r from-sky-400 via-cyan-300 to-teal-400' },
    { name: 'Warm Sand', classes: 'bg-linear-to-r from-amber-200 via-orange-300 to-rose-300' },
    { name: 'Tropical Rainforest', classes: 'bg-linear-to-r from-emerald-500 via-teal-500 to-lime-500' },
    { name: 'Desert', classes: 'bg-linear-to-r from-yellow-200 via-orange-400 to-amber-700' },
    { name: 'Iceberg', classes: 'bg-linear-to-r from-slate-100 via-sky-200 to-blue-400' },
    { name: 'Lavender Field', classes: 'bg-linear-to-r from-violet-300 via-purple-400 to-fuchsia-500' },
    { name: 'Peachy', classes: 'bg-linear-to-r from-orange-200 via-pink-300 to-rose-400' },
    { name: 'Midnight Sky', classes: 'bg-linear-to-r from-slate-900 via-indigo-900 to-sky-900' },
    { name: 'Limeade', classes: 'bg-linear-to-r from-lime-300 via-green-400 to-emerald-500' },
    { name: 'Coral Reef', classes: 'bg-linear-to-r from-rose-400 via-orange-300 to-cyan-400' },
    { name: 'Cool Mint', classes: 'bg-linear-to-r from-teal-200 via-emerald-300 to-lime-300' },
    { name: 'Deep Sea', classes: 'bg-linear-to-r from-cyan-900 via-blue-900 to-indigo-950' },
    { name: 'Citrus', classes: 'bg-linear-to-r from-yellow-300 via-lime-400 to-green-500' },
    { name: 'Violet', classes: 'bg-linear-to-r from-violet-600 via-purple-600 to-indigo-600' },
    { name: 'Rose Petal', classes: 'bg-linear-to-r from-rose-100 via-pink-300 to-red-400' },
    { name: 'Blue Lagoon', classes: 'bg-linear-to-r from-blue-500 via-cyan-400 to-teal-300' },
];

const GRADIENT_CLASS_RE = /^(?:-?bg-(?:gradient-to|linear-to)-|(?:-?bg-linear-\d+)|bg-radial(?:$|[-[/])|(?:-?bg-conic(?:$|[-/]))|from-|via-|to-)/;
const BG_COLOR_RE = /^bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)$|^bg-(?:white|black|transparent|current|inherit)$/;

const SPACE_VALUES: Record<string, string> = {
    '0': '0px', 'px': '1px',
    '0.5': '0.125rem (2px)', '1': '0.25rem (4px)', '1.5': '0.375rem (6px)',
    '2': '0.5rem (8px)', '2.5': '0.625rem (10px)', '3': '0.75rem (12px)', '3.5': '0.875rem (14px)',
    '4': '1rem (16px)', '5': '1.25rem (20px)', '6': '1.5rem (24px)', '7': '1.75rem (28px)',
    '8': '2rem (32px)', '9': '2.25rem (36px)', '10': '2.5rem (40px)', '11': '2.75rem (44px)',
    '12': '3rem (48px)', '14': '3.5rem (56px)', '16': '4rem (64px)', '20': '5rem (80px)',
    '24': '6rem (96px)', '28': '7rem (112px)', '32': '8rem (128px)', '36': '9rem (144px)',
    '40': '10rem (160px)', '44': '11rem (176px)', '48': '12rem (192px)', '52': '13rem (208px)',
    '56': '14rem (224px)', '60': '15rem (240px)', '64': '16rem (256px)', '72': '18rem (288px)',
    '80': '20rem (320px)', '96': '24rem (384px)',
};

const TEXT_SIZE_VALUES: Record<string, string> = {
    xs: 'font-size: 0.75rem (12px); line-height: 1rem (16px)',
    sm: 'font-size: 0.875rem (14px); line-height: 1.25rem (20px)',
    base: 'font-size: 1rem (16px); line-height: 1.5rem (24px)',
    lg: 'font-size: 1.125rem (18px); line-height: 1.75rem (28px)',
    xl: 'font-size: 1.25rem (20px); line-height: 1.75rem (28px)',
    '2xl': 'font-size: 1.5rem (24px); line-height: 2rem (32px)',
    '3xl': 'font-size: 1.875rem (30px); line-height: 2.25rem (36px)',
    '4xl': 'font-size: 2.25rem (36px); line-height: 2.5rem (40px)',
    '5xl': 'font-size: 3rem (48px); line-height: 1',
    '6xl': 'font-size: 3.75rem (60px); line-height: 1',
    '7xl': 'font-size: 4.5rem (72px); line-height: 1',
    '8xl': 'font-size: 6rem (96px); line-height: 1',
    '9xl': 'font-size: 8rem (128px); line-height: 1',
};

const FONT_WEIGHT_VALUES: Record<string, string> = {
    thin: 'font-weight: 100',
    extralight: 'font-weight: 200',
    light: 'font-weight: 300',
    normal: 'font-weight: 400',
    medium: 'font-weight: 500',
    semibold: 'font-weight: 600',
    bold: 'font-weight: 700',
    extrabold: 'font-weight: 800',
    black: 'font-weight: 900',
};

const RADIUS_VALUES: Record<string, string> = {
    'rounded-none': 'border-radius: 0px',
    'rounded-sm': 'border-radius: 0.125rem (2px)',
    rounded: 'border-radius: 0.25rem (4px)',
    'rounded-md': 'border-radius: 0.375rem (6px)',
    'rounded-lg': 'border-radius: 0.5rem (8px)',
    'rounded-xl': 'border-radius: 0.75rem (12px)',
    'rounded-2xl': 'border-radius: 1rem (16px)',
    'rounded-3xl': 'border-radius: 1.5rem (24px)',
    'rounded-full': 'border-radius: 9999px',
};

const BORDER_WIDTH_VALUES: Record<string, string> = {
    border: 'border-width: 1px',
    'border-0': 'border-width: 0px',
    'border-2': 'border-width: 2px',
    'border-4': 'border-width: 4px',
    'border-8': 'border-width: 8px',
};

const RING_WIDTH_VALUES: Record<string, string> = {
    ring: 'box-shadow ring width: 3px',
    'ring-0': 'box-shadow ring width: 0px',
    'ring-1': 'box-shadow ring width: 1px',
    'ring-2': 'box-shadow ring width: 2px',
    'ring-4': 'box-shadow ring width: 4px',
    'ring-8': 'box-shadow ring width: 8px',
};

const SHADOW_VALUES: Record<string, string> = {
    'shadow-xs': 'box-shadow: 0 1px 1px 0 rgb(0 0 0 / 0.05)',
    'shadow-sm': 'box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)',
    shadow: 'box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    'shadow-md': 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    'shadow-lg': 'box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    'shadow-xl': 'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    'shadow-2xl': 'box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)',
    'shadow-inner': 'box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    'shadow-none': 'box-shadow: 0 0 #0000',
};

/* ── Color swatch builder ───────────────────────────────────────────────── */
function buildColorSwatches(prefix: 'bg' | 'text' | 'border' | 'ring'): string {
    const label = prefix === 'bg' ? t('panelBackground') : prefix === 'text' ? t('panelText') : prefix === 'border' ? t('panelBorder') : t('panelRing');
    let grid = '<div class="color-grid">';
    grid += `<div class="color-row">
      <div class="swatch swatch-white" data-class="${prefix}-white" title="${prefix}-white: #ffffff"></div>
      <div class="swatch swatch-black" data-class="${prefix}-black" title="${prefix}-black: #000000"></div>
    </div>`;
    for (const color of TAILWIND_COLORS) {
        grid += '<div class="color-row">';
        for (const shade of COLOR_SHADES) {
            const hex = COLOR_HEX[color]?.[shade] ?? '#888';
            grid += `<div class="swatch" style="background:${hex}" data-class="${prefix}-${color}-${shade}" title="${prefix}-${color}-${shade}: ${hex}"></div>`;
        }
        grid += '</div>';
    }
    grid += '</div>';
    return `
      <div class="color-picker" data-prefix="${prefix}">
        <button class="color-picker-trigger" type="button" title="${prefix === 'ring' ? t('panelRingColor') : label}">
          <span class="swatch-preview"></span>
          <span>${label}</span>
        </button>
        <div class="color-popover hidden">
          <input class="color-search-input" type="text" spellcheck="false" autocomplete="off" placeholder="${t('panelColorSearchPlaceholder')}" />
          ${grid}
        </div>
      </div>`;
}

/* ── CSS ────────────────────────────────────────────────────────────────── */
const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
#panel {
  position: fixed; top: 80px; right: 16px; z-index: 2147483647;
  width: 310px; height: min(760px, calc(100vh - 100px)); min-width: 280px; min-height: 220px; max-width: min(620px, calc(100vw - 24px)); max-height: calc(100vh - 100px);
  background: #141414; color: #e5e5e5;
  border: 1px solid #2a2a2a; border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
  display: flex; flex-direction: column;
  font-size: 12px; overflow: hidden; resize: both;
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
.color-picker { position: relative; width: 100%; max-width: 190px; }
.color-picker-trigger {
  width: 100%; display: inline-flex; align-items: center; gap: 7px;
  background: #1a1a1a; border: 1px solid #2a2a2a; color: #ddd;
  border-radius: 6px; padding: 5px 7px; font-size: 11px; cursor: pointer;
}
.color-picker-trigger:hover { border-color: #444; background: #202020; }
.swatch-preview { width: 16px; height: 16px; border-radius: 4px; border: 1px solid #555; background: linear-gradient(135deg,#fff,#111); flex-shrink: 0; }
.color-popover {
  position: absolute; top: calc(100% + 5px); left: 0; z-index: 40;
  background: #101010; border: 1px solid #2a2a2a; border-radius: 8px;
  padding: 8px; box-shadow: 0 12px 34px rgba(0,0,0,.55);
  max-height: 260px; overflow: auto;
}
.color-popover.hidden { display: none; }
.color-search-input {
  width: 100%; background: #171717; border: 1px solid #2a2a2a; border-radius: 6px;
  color: #ddd; padding: 6px 7px; font-size: 11px; outline: none; margin-bottom: 8px;
}
.color-search-input:focus { border-color: #6366f1; }
.color-grid { display: flex; flex-direction: column; gap: 2px; }
.color-row { display: flex; gap: 2px; }
.color-row.hidden { display: none; }
.swatch { width: 16px; height: 16px; border-radius: 3px; cursor: pointer; border: 1.5px solid transparent; transition: transform .1s, border-color .1s; flex-shrink: 0; }
.swatch.hidden { display: none; }
.swatch:hover { transform: scale(1.3); border-color: white; z-index: 1; position: relative; }
.swatch.active { border-color: white; transform: scale(1.2); }
.swatch-white { background: white; }
.swatch-black { background: black; }
.gradient-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%; }
.gradient-chip {
  min-height: 34px; border-radius: 7px; border: 1px solid #2a2a2a; cursor: pointer;
  color: white; font-size: 10px; font-weight: 600; display: flex; align-items: flex-end;
  padding: 6px; text-shadow: 0 1px 2px rgba(0,0,0,.45); overflow: hidden;
}
.gradient-chip:hover { border-color: #fff; }
.gradient-controls {
  width: 100%; display: flex; flex-direction: column; gap: 7px;
  border: 1px solid #232323; border-radius: 8px; padding: 8px; background: #111;
}
.gradient-empty {
  width: 100%; display: flex; flex-direction: column; gap: 6px;
  border: 1px dashed #2a2a2a; border-radius: 8px; padding: 8px; background: #111;
}
.control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: 100%; }
.control-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.control-label { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: .06em; }
.control-input, .control-select {
  width: 100%; min-width: 0; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 5px;
  color: #ddd; padding: 5px 6px; font-size: 11px; outline: none;
}
.control-input:focus, .control-select:focus { border-color: #6366f1; }
.stop-grid { display: grid; grid-template-columns: 1fr 52px; gap: 5px; align-items: end; }
.mini-btn-row { display: flex; gap: 6px; }
.mini-btn {
  flex: 1; background: #1e1e1e; color: #888; border: 1px solid #2a2a2a; border-radius: 6px;
  padding: 5px 6px; font-size: 11px; cursor: pointer;
}
.mini-btn:hover { background: #2a2a2a; color: #e5e5e5; }
.mini-btn.primary { background: #4f46e5; color: white; border-color: #4f46e5; }
.mini-btn.danger { color: #f87171; }
.gradient-output { font-size: 10px; color: #666; font-family: monospace; line-height: 1.4; word-break: break-word; }
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
.suggestion-group { padding: 6px 10px 3px; color: #555; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border-top: 1px solid #242424; }
.suggestion-group:first-child { border-top: none; }
.suggestion-category {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 7px 10px; border: 0; border-top: 1px solid #242424;
  background: transparent; color: #aaa; cursor: pointer;
  font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
}
.suggestion-category:first-child { border-top: 0; }
.suggestion-category:hover { background: #202020; color: #fff; }
.suggestion-category-count { color: #555; font-size: 9px; font-weight: 600; }
.suggestion-category-items { display: none; border-top: 1px solid #222; }
.suggestion-category-items.open { display: block; }
.suggestion-category-items .suggestion { padding-left: 16px; }
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
.structure-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.structure-btn {
  background: #1e1e1e; color: #ddd; border: 1px solid #2a2a2a; border-radius: 9px;
  padding: 0; min-height: 38px; font-size: 11px; cursor: pointer; text-align: center;
  display: inline-flex; align-items: center; justify-content: center;
}
.structure-btn:hover { background: #252525; border-color: #444; }
.structure-btn.danger { color: #fca5a5; border-color: #4b1d1d; }
.structure-btn.secondary { color: #c7d2fe; border-color: #3730a3; }
.structure-btn-icon { font-size: 15px; line-height: 1; }
.project-style-section {
  display: flex; flex-direction: column; gap: 6px; padding: 8px 0 2px; border-top: 1px solid #1e1e1e;
}
.project-style-label {
  font-size: 10px; color: #555; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
}
.preset-list { display: flex; flex-direction: column; gap: 6px; }
.preset-chip {
  width: 100%; text-align: left; background: #171717; color: #cfd4ff; border: 1px solid #29295a;
  border-radius: 8px; padding: 8px 10px; font-size: 10px; font-family: monospace; cursor: pointer;
}
.preset-chip:hover { background: #202040; border-color: #4f46e5; }
.preset-meta { display: block; color: #666; font-size: 9px; margin-top: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
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
.scope-control {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  background: #101010; border: 1px solid #222; border-radius: 7px; padding: 3px;
}
.scope-btn {
  border: none; border-radius: 5px; padding: 5px 6px; cursor: pointer;
  background: transparent; color: #777; font-size: 11px; font-weight: 600;
}
.scope-btn:hover { color: #ddd; background: #1e1e1e; }
.scope-btn.active { background: #4338ca; color: #e0e7ff; }
.scope-hint { font-size: 10px; color: #555; line-height: 1.35; }
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
        `<div class="chip" data-class="${v}" title="${classTooltip(v)}">${v.replace(/^(text|font|flex|justify|items|self|rounded|gap|w|h|max-w|min-w|max-h|min-h|grid-cols|col-span|grid-rows|row-span|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-/, '')}</div>`
    ).join('')}</div>`;
}

function buildCurrentClassChips(classes: string): string {
    const list = classes.split(/\s+/).filter(Boolean);
    if (!list.length) return `<span style="font-size:10px;color:#444">${t('panelNoClasses')}</span>`;
    return `<div class="chips">${list.map(cls =>
        `<div class="chip active" data-class="${cls}" title="${classTooltip(cls)}">${cls}</div>`
    ).join('')}</div>`;
}

function buildProjectSuggestionsControl(): string {
    return `
      <div class="project-style-section">
        <div class="project-style-label">${t('panelProjectStyles')}</div>
        <div class="search-wrap">
          <input class="search-input" id="project-style-search" placeholder="${t('panelProjectStyleSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
          <div class="suggestions" id="project-style-suggestions" style="display:none"></div>
        </div>
      </div>`;
}

const CLASS_CATEGORIES = [
    { key: 'Layout', keywords: ['layout', 'display', 'position', 'overflow', 'z-index'], match: (c: string) => /^(block|inline|inline-block|hidden|contents|static|fixed|absolute|relative|sticky|overflow|z-)/.test(c) },
    { key: 'Flexbox & Grid', keywords: ['flex', 'grid', 'align', 'justify'], match: (c: string) => /^(flex|inline-flex|grid|inline-grid|basis|grow|shrink|justify-|items-|self-|content-|place-|grid-|col-|row-)/.test(c) },
    { key: 'Spacing', keywords: ['spacing', 'padding', 'margin', 'gap'], match: (c: string) => /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-[xy])-/.test(c) },
    { key: 'Sizing', keywords: ['size', 'width', 'height'], match: (c: string) => /^(w|h|min-w|max-w|min-h|max-h|size|aspect)-/.test(c) },
    { key: 'Typography', keywords: ['type', 'font', 'text', 'leading', 'tracking'], match: (c: string) => /^(text|font|leading|tracking|uppercase|lowercase|capitalize|normal-case|underline|line-through|no-underline|whitespace|truncate)/.test(c) },
    { key: 'Backgrounds', keywords: ['background', 'color', 'gradient'], match: (c: string) => /^(bg-|from-|via-|to-)/.test(c) },
    { key: 'Borders', keywords: ['border', 'radius', 'ring', 'outline'], match: (c: string) => /^(border|rounded|ring|outline)-?/.test(c) },
    { key: 'Effects', keywords: ['effect', 'shadow', 'opacity', 'blend'], match: (c: string) => /^(shadow|opacity|mix-blend|bg-blend)-?/.test(c) },
    { key: 'Filters', keywords: ['filter', 'blur', 'brightness', 'contrast'], match: (c: string) => /^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop)-/.test(c) },
    { key: 'Tables', keywords: ['table'], match: (c: string) => /^(table|border-collapse|border-separate|caption)-?/.test(c) },
    { key: 'Transitions & Animation', keywords: ['transition', 'animation', 'duration', 'ease'], match: (c: string) => /^(transition|duration|ease|delay|animate)-?/.test(c) },
    { key: 'Transforms', keywords: ['transform', 'scale', 'rotate', 'translate', 'skew'], match: (c: string) => /^(transform|scale|rotate|translate|skew|origin)-?/.test(c) },
    { key: 'Interactivity', keywords: ['cursor', 'pointer', 'select', 'resize', 'scroll'], match: (c: string) => /^(cursor|pointer-events|select|resize|scroll|snap|touch|user)-?/.test(c) },
    { key: 'SVG', keywords: ['svg', 'fill', 'stroke'], match: (c: string) => /^(fill|stroke)-/.test(c) },
    { key: 'Accessibility', keywords: ['accessibility', 'screen reader', 'sr'], match: (c: string) => /^(sr-only|not-sr-only)$/.test(c) },
];

function classCategory(cls: string): string {
    const base = getBaseClass(cls);
    return CLASS_CATEGORIES.find(group => group.match(base))?.key ?? 'Other';
}

function categoryMatchesQuery(cls: string, q: string): boolean {
    if (!q) return false;
    const base = getBaseClass(cls);
    const group = CLASS_CATEGORIES.find(item => item.match(base));
    if (!group) return false;
    const haystack = [group.key, ...group.keywords].join(' ').toLowerCase();
    return haystack.includes(q);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const BREAKPOINT_TOOLTIPS: Record<string, string> = {
    '': 'Default/mobile: applies at all viewport widths unless overridden.',
    'sm:': 'sm: Minimum width of 40rem (640px).',
    'md:': 'md: Minimum width of 48rem (768px).',
    'lg:': 'lg: Minimum width of 64rem (1024px).',
    'xl:': 'xl: Minimum width of 80rem (1280px).',
    '2xl:': '2xl: Minimum width of 96rem (1536px).',
};

function classTooltip(cls: string): string {
    const prefixMatch = cls.match(/^((?:[a-z0-9-]+:)+)(.+)$/);
    const prefixes = prefixMatch?.[1] ?? '';
    const base = prefixMatch?.[2] ?? cls;
    const prefixText = prefixes
        ? prefixes.split(':').filter(Boolean).map(p => BREAKPOINT_TOOLTIPS[`${p}:`] ?? `${p}: variant`).join(' ')
        : '';
    const textAlignMap: Record<string, string> = {
        'text-left': 'text-align: left',
        'text-center': 'text-align: center',
        'text-right': 'text-align: right',
        'text-justify': 'text-align: justify',
        'text-start': 'text-align: start',
        'text-end': 'text-align: end',
    };
    const textStyleMap: Record<string, string> = {
        italic: 'font-style: italic',
        'not-italic': 'font-style: normal',
        underline: 'text-decoration-line: underline',
        'no-underline': 'text-decoration-line: none',
        'line-through': 'text-decoration-line: line-through',
        uppercase: 'text-transform: uppercase',
        lowercase: 'text-transform: lowercase',
        capitalize: 'text-transform: capitalize',
        'normal-case': 'text-transform: none',
    };
    const leadingMap: Record<string, string> = {
        'leading-none': 'line-height: 1',
        'leading-tight': 'line-height: 1.25',
        'leading-snug': 'line-height: 1.375',
        'leading-normal': 'line-height: 1.5',
        'leading-relaxed': 'line-height: 1.625',
        'leading-loose': 'line-height: 2',
    };
    const trackingMap: Record<string, string> = {
        'tracking-tighter': 'letter-spacing: -0.05em',
        'tracking-tight': 'letter-spacing: -0.025em',
        'tracking-normal': 'letter-spacing: 0em',
        'tracking-wide': 'letter-spacing: 0.025em',
        'tracking-wider': 'letter-spacing: 0.05em',
        'tracking-widest': 'letter-spacing: 0.1em',
    };
    let detail = `${base}: Tailwind ${classCategory(base)} utility.`;
    if (/^2xl:/.test(cls)) detail = `${base}: ${BREAKPOINT_TOOLTIPS['2xl:']}`;
    else if (/^sm:|^md:|^lg:|^xl:/.test(cls)) detail = `${base}: ${prefixText}`;
    else if (TEXT_SIZE_VALUES[base.replace(/^text-/, '')]) detail = `${base}: ${TEXT_SIZE_VALUES[base.replace(/^text-/, '')]}`;
    else if (FONT_WEIGHT_VALUES[base.replace(/^font-/, '')]) detail = `${base}: ${FONT_WEIGHT_VALUES[base.replace(/^font-/, '')]}`;
    else if (textAlignMap[base]) detail = `${base}: ${textAlignMap[base]}`;
    else if (textStyleMap[base]) detail = `${base}: ${textStyleMap[base]}`;
    else if (leadingMap[base]) detail = `${base}: ${leadingMap[base]}`;
    else if (trackingMap[base]) detail = `${base}: ${trackingMap[base]}`;
    else if (RADIUS_VALUES[base]) detail = `${base}: ${RADIUS_VALUES[base]}`;
    else if (BORDER_WIDTH_VALUES[base]) detail = `${base}: ${BORDER_WIDTH_VALUES[base]}`;
    else if (RING_WIDTH_VALUES[base]) detail = `${base}: ${RING_WIDTH_VALUES[base]}`;
    else if (SHADOW_VALUES[base]) detail = `${base}: ${SHADOW_VALUES[base]}`;
    else {
        const spacing = base.match(/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(.+)$/);
        const sizing = base.match(/^(w|h|min-w|max-w|min-h|max-h)-(.+)$/);
        const gridCols = base.match(/^grid-cols-(\d+)$/);
        const colSpan = base.match(/^col-span-(\d+)$/);
        const borderSide = base.match(/^border-([xytrbl])(?:-(0|2|4|8))?$/);
        const ringOffset = base.match(/^ring-offset-(0|1|2|4|8)$/);
        const opacity = base.match(/^opacity-(\d+)$/);
        const duration = base.match(/^duration-(\d+)$/);
        const color = colorValueForClass(base);

        if (spacing && SPACE_VALUES[spacing[2]!]) {
            const propMap: Record<string, string> = {
                p: 'padding', px: 'padding-left/right', py: 'padding-top/bottom', pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left',
                m: 'margin', mx: 'margin-left/right', my: 'margin-top/bottom', mt: 'margin-top', mr: 'margin-right', mb: 'margin-bottom', ml: 'margin-left',
                gap: 'gap', 'gap-x': 'column-gap', 'gap-y': 'row-gap', 'space-x': 'horizontal child spacing', 'space-y': 'vertical child spacing',
            };
            detail = `${base}: ${propMap[spacing[1]!] ?? spacing[1]} = ${SPACE_VALUES[spacing[2]!]}`;
        } else if (sizing && SPACE_VALUES[sizing[2]!]) {
            const propMap: Record<string, string> = { w: 'width', h: 'height', 'min-w': 'min-width', 'max-w': 'max-width', 'min-h': 'min-height', 'max-h': 'max-height' };
            detail = `${base}: ${propMap[sizing[1]!] ?? sizing[1]} = ${SPACE_VALUES[sizing[2]!]}`;
        } else if (base === 'w-full' || base === 'h-full') detail = `${base}: ${base[0] === 'w' ? 'width' : 'height'} = 100%`;
        else if (base === 'w-screen') detail = `${base}: width = 100vw`;
        else if (base === 'h-screen') detail = `${base}: height = 100vh`;
        else if (gridCols) detail = `${base}: grid-template-columns = repeat(${gridCols[1]}, minmax(0, 1fr))`;
        else if (base === 'grid-cols-none') detail = `${base}: grid-template-columns = none`;
        else if (colSpan) detail = `${base}: grid-column = span ${colSpan[1]} / span ${colSpan[1]}`;
        else if (base === 'col-span-full') detail = `${base}: grid-column = 1 / -1`;
        else if (borderSide) {
            const sideMap: Record<string, string> = { x: 'left/right', y: 'top/bottom', t: 'top', r: 'right', b: 'bottom', l: 'left' };
            detail = `${base}: border-${sideMap[borderSide[1]!] ?? borderSide[1]} width = ${borderSide[2] ?? 1}px`;
        } else if (/^border-(solid|dashed|dotted|double|none)$/.test(base)) detail = `${base}: border-style = ${base.replace('border-', '')}`;
        else if (ringOffset) detail = `${base}: --tw-ring-offset-width = ${ringOffset[1]}px`;
        else if (opacity) detail = `${base}: opacity = ${Number(opacity[1]) / 100}`;
        else if (duration) detail = `${base}: transition-duration = ${duration[1]}ms`;
        else if (color) detail = `${base}: ${base.startsWith('bg-') ? 'background-color' : base.startsWith('text-') ? 'color' : base.startsWith('border-') ? 'border-color' : 'color'} = ${color}`;
        else if (/^bg-(?:gradient|linear|radial|conic)/.test(base)) detail = `${base}: background-image gradient utility.`;
        else if (/^(from|via|to)-\d+%$/.test(base)) detail = `${base}: gradient color stop position.`;
        else if (/^(from|via|to)-/.test(base) && colorValueForClass(base)) detail = `${base}: gradient stop color = ${colorValueForClass(base)}`;
        else if (/^flex/.test(base)) detail = `${base}: flexbox utility.`;
        else if (/^text-/.test(base)) detail = `${base}: text color/alignment/size utility.`;
        else if (/^bg-/.test(base)) detail = `${base}: background color/image utility.`;
    }
    return prefixText && !detail.includes(prefixText) ? `${prefixText} ${detail}` : detail;
}

function buildGradientTemplates(): string {
    return `<div class="gradient-grid">${GRADIENT_TEMPLATES.map(g => {
        const colors = g.classes.split(/\s+/).filter(c => /^(from|via|to)-/.test(c));
        const cssColors = colors.map(c => {
            const [, role, color, shade] = c.match(/^(from|via|to)-([a-z-]+)-(\d+)$/) ?? [];
            return role && color && shade ? COLOR_HEX[color]?.[Number(shade)] : undefined;
        }).filter(Boolean);
        const bg = cssColors.length ? `linear-gradient(90deg, ${cssColors.join(', ')})` : '#333';
        return `<div class="gradient-chip" style="background:${bg}" data-classes="${g.classes}" title="${g.classes}">${g.name}</div>`;
    }).join('')}</div>`;
}

function colorOptions(selected: string): string {
    const options: string[] = [];
    for (const color of TAILWIND_COLORS) {
        for (const shade of [100,200,300,400,500,600,700,800,900]) {
            const value = `${color}-${shade}`;
            options.push(`<option value="${value}"${value === selected ? ' selected' : ''}>${value}</option>`);
        }
    }
    return options.join('');
}

function getBaseClass(cls: string): string {
    return cls.replace(/^(?:[a-z0-9-]+:)+/, '');
}

function isGradientClass(cls: string): boolean {
    return GRADIENT_CLASS_RE.test(getBaseClass(cls));
}

function hasGradientClasses(classes: string): boolean {
    return classes.split(/\s+/).filter(Boolean).some(isGradientClass);
}

function colorValueForClass(cls: string): string | null {
    const base = getBaseClass(cls);
    const named = base.match(/^(?:bg|text|border|ring)-(white|black|transparent)$/)?.[1];
    if (named === 'white') return '#fff';
    if (named === 'black') return '#000';
    if (named === 'transparent') return 'transparent';
    const match = base.match(/^(?:bg|text|border|ring|from|via|to)-([a-z-]+)-(\d+)$/);
    if (!match) return null;
    return COLOR_HEX[match[1] ?? '']?.[Number(match[2])] ?? null;
}

function gradientStateFromClasses(classes: string): {
    type: 'linear' | 'radial' | 'conic';
    direction: string;
    linearAngle: string;
    radialPosition: string;
    conicAngle: string;
    interpolation: string;
    fromColor: string;
    viaColor: string;
    toColor: string;
    fromPos: string;
    viaPos: string;
    toPos: string;
} {
    const list = classes.split(/\s+/).filter(Boolean).map(getBaseClass);
    const bg = list.find(c => /^-?bg-(?:gradient-to|linear-to)-/.test(c) || /^-?bg-linear-\d+/.test(c) || /^bg-radial/.test(c) || /^-?bg-conic/.test(c));
    const [bgBase, interpolation = ''] = (bg ?? '').split('/') as [string, string?];
    const type = bgBase?.includes('radial') ? 'radial' : bgBase?.includes('conic') ? 'conic' : 'linear';
    const direction = bgBase?.match(/(?:gradient-to|linear-to)-([a-z]+)$/)?.[1] ?? 'r';
    const linearAngle = bgBase?.match(/bg-linear-(\d+)$/)?.[1] ?? '';
    const radialPosition = bgBase?.match(/^bg-radial-\[(.+)\]$/)?.[1] ?? '';
    const conicAngle = bgBase?.match(/bg-conic-(\d+)$/)?.[1] ?? '';
    const colorFor = (kind: 'from' | 'via' | 'to', fallback: string) => {
        const match = list.find(c => new RegExp(`^${kind}-[a-z-]+-\\d+$`).test(c));
        return match ? match.replace(`${kind}-`, '') : fallback;
    };
    const posFor = (kind: 'from' | 'via' | 'to', fallback: string) => {
        const match = list.find(c => new RegExp(`^${kind}-\\d+%$`).test(c));
        return match ? match.replace(`${kind}-`, '').replace('%', '') : fallback;
    };
    return {
        type,
        direction,
        linearAngle,
        radialPosition,
        conicAngle,
        interpolation,
        fromColor: colorFor('from', 'cyan-500'),
        viaColor: colorFor('via', 'purple-500'),
        toColor: colorFor('to', 'blue-600'),
        fromPos: posFor('from', '0'),
        viaPos: posFor('via', '50'),
        toPos: posFor('to', '100'),
    };
}

function buildGradientControls(currentClasses: string, open: boolean): string {
    if (!open && !hasGradientClasses(currentClasses)) {
        return `
          <div class="gradient-empty">
            <button class="mini-btn primary" id="grad-open-btn" type="button">${t('panelGradientOpen')}</button>
            <div class="gradient-output">${t('panelNoGradient')}</div>
          </div>`;
    }

    const state = gradientStateFromClasses(currentClasses);
    const directions = [
        ['t','top'],['tr','top right'],['r','right'],['br','bottom right'],
        ['b','bottom'],['bl','bottom left'],['l','left'],['tl','top left'],
    ];
    const modes = ['', 'srgb', 'hsl', 'oklab', 'oklch', 'longer', 'shorter', 'increasing', 'decreasing'];
    const radialPositions = [
        ['', 'center'],
        ['at_50%_75%', 'at 50% 75%'],
        ['at_25%_25%', 'at 25% 25%'],
        ['at_75%_25%', 'at 75% 25%'],
    ];
    const classes = buildGradientClassSet(state);
    return `
      <div class="gradient-controls">
        <div class="control-grid">
          <label class="control-field">
            <span class="control-label">${t('panelGradientType')}</span>
            <select class="control-select" id="grad-type">
              ${['linear','radial','conic'].map(v => `<option value="${v}"${state.type === v ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </label>
          <label class="control-field">
            <span class="control-label">${t('panelGradientInterpolation')}</span>
            <select class="control-select" id="grad-mode">
              ${modes.map(v => `<option value="${v}"${state.interpolation === v ? ' selected' : ''}>${v || 'default'}</option>`).join('')}
            </select>
          </label>
          <label class="control-field" data-grad-field="linear">
            <span class="control-label">${t('panelGradientDirection')}</span>
            <select class="control-select" id="grad-direction">
              ${directions.map(([v,label]) => `<option value="${v}"${state.direction === v ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <label class="control-field" data-grad-field="linear">
            <span class="control-label">${t('panelGradientAngle')}</span>
            <input class="control-input" id="grad-linear-angle" value="${state.linearAngle}" placeholder="ex: 65" inputmode="numeric" />
          </label>
          <label class="control-field" data-grad-field="radial">
            <span class="control-label">${t('panelGradientPosition')}</span>
            <select class="control-select" id="grad-radial-position">
              ${radialPositions.map(([v,label]) => `<option value="${v}"${state.radialPosition === v ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <label class="control-field" data-grad-field="conic">
            <span class="control-label">${t('panelGradientAngle')}</span>
            <input class="control-input" id="grad-conic-angle" value="${state.conicAngle}" placeholder="ex: 180" inputmode="numeric" />
          </label>
        </div>
        <div class="stop-grid">
          <label class="control-field"><span class="control-label">From</span><select class="control-select" id="grad-from-color">${colorOptions(state.fromColor)}</select></label>
          <label class="control-field"><span class="control-label">%</span><input class="control-input" id="grad-from-pos" value="${state.fromPos}" inputmode="numeric" /></label>
          <label class="control-field"><span class="control-label">Via</span><select class="control-select" id="grad-via-color">${colorOptions(state.viaColor)}</select></label>
          <label class="control-field"><span class="control-label">%</span><input class="control-input" id="grad-via-pos" value="${state.viaPos}" inputmode="numeric" /></label>
          <label class="control-field"><span class="control-label">To</span><select class="control-select" id="grad-to-color">${colorOptions(state.toColor)}</select></label>
          <label class="control-field"><span class="control-label">%</span><input class="control-input" id="grad-to-pos" value="${state.toPos}" inputmode="numeric" /></label>
        </div>
        <div class="mini-btn-row">
          <button class="mini-btn danger" id="grad-clear-btn">${t('panelGradientClear')}</button>
          <button class="mini-btn primary" id="grad-apply-btn">${t('panelGradientApply')}</button>
        </div>
        <div class="gradient-output" id="grad-output">${classes}</div>
      </div>`;
}

function buildGradientClassSet(state: ReturnType<typeof gradientStateFromClasses>): string {
    const mode = state.interpolation ? `/${state.interpolation}` : '';
    let bgClass = '';
    if (state.type === 'linear') {
        bgClass = state.linearAngle.trim() ? `bg-linear-${clampPercent(state.linearAngle)}` : `bg-linear-to-${state.direction || 'r'}`;
    } else if (state.type === 'radial') {
        bgClass = state.radialPosition ? `bg-radial-[${state.radialPosition}]` : 'bg-radial';
    } else {
        bgClass = state.conicAngle.trim() ? `bg-conic-${clampPercent(state.conicAngle)}` : 'bg-conic';
    }
    const classes = [
        `${bgClass}${mode}`,
        `from-${state.fromColor}`,
        `from-${clampPercent(state.fromPos)}%`,
        `via-${state.viaColor}`,
        `via-${clampPercent(state.viaPos)}%`,
        `to-${state.toColor}`,
        `to-${clampPercent(state.toPos)}%`,
    ];
    return classes.join(' ');
}

function clampPercent(value: string): string {
    const parsed = Number.parseInt(value || '0', 10);
    if (Number.isNaN(parsed)) return '0';
    return String(Math.max(0, Math.min(100, parsed)));
}

function buildScopeControl(hidden: boolean): string {
    if (hidden) return '';
    return `
      <div class="scope-control">
        <button class="scope-btn active" data-scope="instance">${t('panelScopeInstance')}</button>
        <button class="scope-btn" data-scope="component">${t('panelScopeComponent')}</button>
      </div>`;
}

function buildPanel(
    oid: string,
    tag: string,
    currentClasses: string,
    currentText: string,
    currentPlaceholder: string,
    currentSrc: string,
    currentAlt: string,
    gradientEditorOpen: boolean,
    hideScopeControl: boolean,
): string {
    const textSizes = ['text-xs','text-sm','text-base','text-lg','text-xl','text-2xl','text-3xl','text-4xl','text-5xl'];
    const fontWeights = ['font-thin','font-light','font-normal','font-medium','font-semibold','font-bold','font-extrabold','font-black'];
    const textAlign = ['text-left','text-center','text-right','text-justify'];
    const textStyle = ['italic','not-italic','underline','no-underline','uppercase','lowercase','capitalize','normal-case'];
    const textLeading = ['leading-none','leading-tight','leading-snug','leading-normal','leading-relaxed','leading-loose'];
    const textTracking = ['tracking-tighter','tracking-tight','tracking-normal','tracking-wide','tracking-wider','tracking-widest'];
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
    const borderWidths = ['border-0','border','border-2','border-4','border-8'];
    const borderStyles = ['border-solid','border-dashed','border-dotted','border-double','border-none'];
    const ringWidths = ['ring-0','ring','ring-1','ring-2','ring-4','ring-8'];
    const ringOffsets = ['ring-offset-0','ring-offset-1','ring-offset-2','ring-offset-4','ring-offset-8'];
    const shadows = ['shadow-xs','shadow-sm','shadow','shadow-md','shadow-lg','shadow-xl','shadow-2xl','shadow-inner','shadow-none'];
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
    const isImage = tag === 'img';

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
        <button id="close-btn" title="${t('panelClose')}">✕</button>
      </div>
      <div id="panel-body">

        ${(hasText || hasPlaceholder || isImage) ? `
        <div class="section" id="sec-content">
          <div class="${hdrCol}" data-section="content">
            ${t('panelContent')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            ${buildScopeControl(hideScopeControl)}
            ${hideScopeControl ? '' : `<span class="scope-hint">${t('panelScopeContentHint')}</span>`}
            ${hasText ? `
            <div style="font-size:10px;color:#555;margin-bottom:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">${t('panelText')}</div>
            <textarea class="text-input" id="text-input" rows="2" spellcheck="false">${currentText}</textarea>
            <span class="text-hint">${t('panelTextHint')}</span>
            <button class="btn btn-primary" id="text-apply-btn" style="flex:none;padding:5px 12px;font-size:11px">${t('panelSaveText')}</button>
            ` : ''}
            ${hasPlaceholder ? `
            <div style="font-size:10px;color:#555;margin-top:${hasText?'10px':'0'};margin-bottom:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">${t('panelPlaceholder')}</div>
            <input class="text-input" id="placeholder-input" type="text" value="${currentPlaceholder.replace(/"/g, '&quot;')}" spellcheck="false" style="min-height:unset;height:36px" />
            <button class="btn btn-primary" id="placeholder-apply-btn" style="flex:none;padding:5px 12px;font-size:11px">${t('panelSavePlaceholder')}</button>
            ` : ''}
            ${isImage ? `
            <div style="font-size:10px;color:#555;margin-top:${(hasText || hasPlaceholder) ? '10px' : '0'};margin-bottom:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">${t('panelImageSrc')}</div>
            <input class="text-input" id="image-src-input" type="text" value="${currentSrc.replace(/"/g, '&quot;')}" spellcheck="false" style="min-height:unset;height:36px" />
            <button class="btn btn-primary" id="image-src-apply-btn" style="flex:none;padding:5px 12px;font-size:11px">${t('panelSaveImageSrc')}</button>
            <div style="font-size:10px;color:#555;margin-top:10px;margin-bottom:3px;font-weight:600;letter-spacing:.05em;text-transform:uppercase">${t('panelImageAlt')}</div>
            <input class="text-input" id="image-alt-input" type="text" value="${currentAlt.replace(/"/g, '&quot;')}" spellcheck="false" style="min-height:unset;height:36px" />
            <button class="btn btn-primary" id="image-alt-apply-btn" style="flex:none;padding:5px 12px;font-size:11px">${t('panelSaveImageAlt')}</button>
            ` : ''}
          </div>
        </div>
        ` : ''}

        <div class="section" id="sec-i18n" style="display:none">
          <div class="${hdrCol}" data-section="i18n">
            ${t('panelTranslations')} <span class="chevron">›</span>
          </div>
          <div class="${col}" id="i18n-content">
            <span class="i18n-hint">${t('panelDetecting')}</span>
          </div>
        </div>

        <div class="section" id="sec-structure">
          <div class="${hdrCol}" data-section="structure">
            ${t('panelStructure')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="structure-grid">
              <button class="structure-btn" id="insert-text-btn" title="${t('panelInsertText')}"><span class="structure-btn-icon">T</span></button>
              <button class="structure-btn" id="insert-button-btn" title="${t('panelInsertButton')}"><span class="structure-btn-icon">⌘</span></button>
              <button class="structure-btn" id="insert-group-btn" title="${t('panelInsertGroup')}"><span class="structure-btn-icon">▣</span></button>
              <button class="structure-btn" id="insert-image-btn" title="${t('panelInsertImage')}"><span class="structure-btn-icon">▧</span></button>
              <button class="structure-btn danger" id="remove-element-btn" title="${t('panelRemoveElement')}"><span class="structure-btn-icon">⌫</span></button>
            </div>
          </div>
        </div>

        <div class="section" id="sec-classes">
          <div class="section-header" data-section="classes">
            ${t('panelClasses')} <span class="chevron">›</span>
          </div>
          <div class="section-content">
            ${buildScopeControl(hideScopeControl)}
            ${hideScopeControl ? '' : `<span class="scope-hint">${t('panelScopeClassesHint')}</span>`}
            <div id="current-chips">${buildCurrentClassChips(currentClasses)}</div>
            <button class="structure-btn secondary" id="copy-style-btn">${t('panelCopyStyle')}</button>
            ${buildProjectSuggestionsControl()}
            <div class="modifier-strip">
              <div class="modifier-row">
                <span class="modifier-label">${t('panelBreak')}</span>
                <div class="chips">
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="" title="${BREAKPOINT_TOOLTIPS['']}">—</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="sm:" title="${BREAKPOINT_TOOLTIPS['sm:']}">sm:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="md:" title="${BREAKPOINT_TOOLTIPS['md:']}">md:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="lg:" title="${BREAKPOINT_TOOLTIPS['lg:']}">lg:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="xl:" title="${BREAKPOINT_TOOLTIPS['xl:']}">xl:</div>
                  <div class="prefix-btn" data-prefix-type="responsive" data-prefix-val="2xl:" title="${BREAKPOINT_TOOLTIPS['2xl:']}">2xl:</div>
                </div>
              </div>
              <div class="modifier-row">
                <span class="modifier-label">${t('panelState')}</span>
                <div class="chips">
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="" title="${t('panelStateNone')}">—</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="hover:" title="${t('panelStateHover')}">hover:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="focus:" title="${t('panelStateFocus')}">focus:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="active:" title="${t('panelStateActive')}">active:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="dark:" title="${t('panelStateDark')}">dark:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="disabled:" title="${t('panelStateDisabled')}">disabled:</div>
                  <div class="prefix-btn" data-prefix-type="state" data-prefix-val="focus-within:" title="${t('panelStateFocusWithin')}">fw:</div>
                </div>
              </div>
            </div>
            <div class="search-wrap">
              <input class="search-input" id="class-search" placeholder="${t('panelClassSearchPlaceholder')}" autocomplete="off" spellcheck="false" />
              <div class="suggestions" id="suggestions" style="display:none"></div>
            </div>
            <textarea class="classes-input" id="classes-input" rows="3" spellcheck="false">${currentClasses}</textarea>
          </div>
        </div>

        <div class="section" id="sec-typography">
          <div class="${hdrCol}" data-section="typography">
            ${t('panelTypography')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">${t('panelSize')}</span>${chips(textSizes)}</div>
            <div class="row"><span class="row-label">${t('panelWeight')}</span>${chips(fontWeights)}</div>
            <div class="row"><span class="row-label">${t('panelAlign')}</span>${chips(textAlign)}</div>
            <div class="row"><span class="row-label">${t('panelStyle')}</span>${chips(textStyle)}</div>
            <div class="row"><span class="row-label">${t('panelLeading')}</span>${chips(textLeading)}</div>
            <div class="row"><span class="row-label">${t('panelTracking')}</span>${chips(textTracking)}</div>
            <div class="row"><span class="row-label">${t('panelTextColor')}</span>${buildColorSwatches('text')}</div>
          </div>
        </div>

        <div class="section" id="sec-spacing">
          <div class="${hdrCol}" data-section="spacing">
            ${t('panelSpacing')} <span class="chevron">›</span>
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
            ${t('panelBackground')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row">${buildColorSwatches('bg')}</div>
            <div class="row"><span class="row-label">${t('panelEditor')}</span>${buildGradientControls(currentClasses, gradientEditorOpen)}</div>
            <div class="row"><span class="row-label">${t('panelGradient')}</span>${buildGradientTemplates()}</div>
          </div>
        </div>

        <div class="section" id="sec-border">
          <div class="${hdrCol}" data-section="border">
            ${t('panelBorder')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">${t('panelRadius')}</span>${chips(radii)}</div>
            <div class="row"><span class="row-label">${t('panelWidth')}</span>${chips(borderWidths)}</div>
            <div class="row"><span class="row-label">${t('panelStyle')}</span>${chips(borderStyles)}</div>
            <div class="row"><span class="row-label">${t('panelColor')}</span>${buildColorSwatches('border')}</div>
            <div class="row"><span class="row-label">${t('panelRing')}</span>${chips(ringWidths)}</div>
            <div class="row"><span class="row-label">${t('panelOffset')}</span>${chips(ringOffsets)}</div>
            <div class="row"><span class="row-label">${t('panelRingColor')}</span>${buildColorSwatches('ring')}</div>
          </div>
        </div>

        <div class="section" id="sec-shadow">
          <div class="${hdrCol}" data-section="shadow">
            ${t('panelShadow')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">Shadow</span>${chips(shadows)}</div>
          </div>
        </div>

        <div class="section" id="sec-layout">
          <div class="${hdrCol}" data-section="layout">
            ${t('panelLayout')} <span class="chevron">›</span>
          </div>
          <div class="${col}">
            <div class="row"><span class="row-label">${t('panelDisplay')}</span>${chips(displays)}</div>
            <div class="row"><span class="row-label">${t('panelFlexDir')}</span>${chips(flexDir)}</div>
            <div class="row"><span class="row-label">${t('panelFlex')}</span>${chips(flexOpts)}</div>
            <div class="row"><span class="row-label">${t('panelJustify')}</span>${chips(justify)}</div>
            <div class="row"><span class="row-label">${t('panelAlign')}</span>${chips(items)}</div>
            <div class="row"><span class="row-label">${t('panelSelf')}</span>${chips(self)}</div>
            <div class="row"><span class="row-label">${t('panelLayoutWidth')}</span>${chips(widths)}</div>
            <div class="row"><span class="row-label">${t('panelMaxWidth')}</span>${chips(maxWidths)}</div>
            <div class="row"><span class="row-label">${t('panelHeight')}</span>${chips(heights)}</div>
            <div class="row"><span class="row-label">${t('panelGridCols')}</span>${chips(gridCols)}</div>
            <div class="row"><span class="row-label">${t('panelColSpan')}</span>${chips(colSpans)}</div>
            <div class="row"><span class="row-label">${t('panelPosition')}</span>${chips(positions)}</div>
            <div class="row"><span class="row-label">${t('panelOverflow')}</span>${chips(overflow)}</div>
            <div class="row"><span class="row-label">${t('panelZIndex')}</span>${chips(zIndex)}</div>
          </div>
        </div>

      </div>
      <div id="panel-footer">
        <button class="btn btn-secondary" id="undo-btn">${t('panelUndo')}</button>
        <button class="btn btn-primary" id="apply-btn">${t('panelApplyClasses')}</button>
      </div>
    </div>`;
}

/* ── Mutual exclusion groups for Tailwind classes ────────────────────────── */
const MUTUALLY_EXCLUSIVE = [
    /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/,
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
    /^bg-/,
    /^text-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-/,
    /^text-(white|black)$/,
    /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|hidden|contents)$/,
    /^flex-(row|col|row-reverse|col-reverse)$/,
    /^justify-(start|center|end|between|around|evenly)$/,
    /^items-(start|center|end|stretch|baseline)$/,
    /^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/,
    /^border(-0|-2|-4|-8)?$/,
    /^border-(solid|dashed|dotted|double|none)$/,
    /^border-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-/,
    /^ring(-0|-1|-2|-4|-8)?$/,
    /^ring-offset-/,
    /^ring-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-/,
    /^shadow(-xs|-sm|-md|-lg|-xl|-2xl|-inner|-none)?$/,
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
    private projectClasses: ProjectClassInfo[] = [];
    private projectBundles: ProjectClassBundle[] = [];
    private callbacks: PanelCallbacks;
    private panelPosition: { left: number; top: number } | null = null;
    private dragCleanup: (() => void) | null = null;
    /** DOM text content at the moment the panel opened — used for prop resolution. */
    private originalText = '';
    private originalPlaceholder = '';
    private originalSrc = '';
    private originalAlt = '';
    private editScope: EditScope = 'instance';
    private forceScope: EditScope | null = null;
    private hideScopeControl = false;
    private gradientEditorOpen = false;
    private unsubscribeLanguage: (() => void) | null = null;
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
        this.unsubscribeLanguage = subscribeLanguageChange(() => {
            if (this.isVisible()) {
                this.render();
                if (this.i18nInfo) this.renderI18nContent();
            }
        });
    }

    show(el: HTMLElement, oid: string, options: PanelShowOptions = {}): void {
        this.oid = oid;
        this.element = el;
        this.elementTag = el.tagName.toLowerCase();
        this.originalClasses = el.className;
        this.pendingClasses = el.className;
        this.history = [];
        this.i18nInfo = null;
        this.selectedLocale = '';
        this.projectClasses = [];
        this.projectBundles = [];
        // Snapshot the current DOM text so the bridge can locate the prop in
        // the parent component (e.g. label="First name" in ContactPage.tsx).
        this.originalText = this.currentText();
        this.originalPlaceholder = this.currentPlaceholder();
        this.originalSrc = this.currentSrc();
        this.originalAlt = this.currentAlt();
        this.forceScope = options.forceScope ?? null;
        this.hideScopeControl = options.hideScopeControl ?? false;
        this.editScope = this.forceScope ?? 'instance';
        this.gradientEditorOpen = hasGradientClasses(el.className);
        // Reset modifier prefixes each time a new element is selected
        this.activeResponsive = '';
        this.activeState = '';
        // Injeta CSS para as classes atuais do elemento (garante preview correto)
        injectClassesForPreview(el.className);
        this.render();
        this.loadI18n(oid); // async — popula seção depois de renderizar
        void this.loadProjectClassSuggestions();
    }

    private async loadProjectClassSuggestions(): Promise<void> {
        try {
            const res = await fetch(`${BRIDGE}/classes?tag=${encodeURIComponent(this.elementTag)}&limit=80`, {
                signal: AbortSignal.timeout(2500),
            });
            const data = await res.json() as { ok: boolean; classes?: ProjectClassInfo[]; bundles?: ProjectClassBundle[] };
            if (!data.ok) return;
            this.projectClasses = (data.classes ?? []).slice(0, 18);
            this.projectBundles = (data.bundles ?? []).slice(0, 6);
            if (this.isVisible()) this.render();
        } catch {
            // keep panel usable when bridge is offline
        }
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
            <span style="font-size:10px;color:#555">${t('panelTranslationKey')}</span>
            <span class="i18n-key">${key}</span>
          </div>
          <div class="locale-tabs" id="locale-tabs">
            ${locales.map(l =>
                `<div class="locale-tab${l === this.selectedLocale ? ' active' : ''}" data-locale="${l}">${l}</div>`
            ).join('')}
          </div>
          <textarea class="text-input" id="i18n-value" rows="2" spellcheck="false">${currentValue}</textarea>
          <button class="btn btn-primary" id="i18n-save-btn" style="flex:none;padding:5px 12px;font-size:11px">${t('panelSaveTranslation')}</button>
          <span class="i18n-hint">${t('panelTranslationHint')}</span>
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
                    this.showToast(t('panelTranslationSaved', { locale: this.selectedLocale }), 'success');
                } else {
                    this.showToast(t('panelTranslationSaveError'), 'error');
                }
            } catch {
                this.showToast(t('bridgeOfflineShort'), 'error');
            }

            btn.disabled = false;
            btn.textContent = t('panelSaveTranslation');
        });
    }

    hide(): void {
        this.dragCleanup?.();
        this.dragCleanup = null;
        this.shadow.innerHTML = '';
    }
    isVisible(): boolean { return Boolean(this.shadow.querySelector('#panel')); }

    setResponsivePrefix(prefix: string): void {
        this.activeResponsive = prefix;
        this.updatePrefixButtons();
        this.syncActiveChips(this.pendingClasses);
    }

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

    private currentSrc(): string {
        return this.element?.getAttribute('src') ?? '';
    }

    private currentAlt(): string {
        return this.element?.getAttribute('alt') ?? '';
    }

    private hasSharedOid(): boolean {
        return document.querySelectorAll(`[data-oid="${this.oid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`).length > 1;
    }

    private pushClassHistory(): void {
        if (this.history[this.history.length - 1] !== this.pendingClasses) {
            this.history.push(this.pendingClasses);
        }
    }

    private render(): void {
        const tag = this.elementTag || 'div';
        const style = document.createElement('style');
        style.textContent = CSS;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildPanel(
            this.oid,
            tag,
            this.pendingClasses,
            this.currentText(),
            this.currentPlaceholder(),
            this.currentSrc(),
            this.currentAlt(),
            this.gradientEditorOpen,
            this.hideScopeControl,
        );
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
        const structureContent = this.shadow.querySelector('#sec-structure .section-content');
        const structureHdr = this.shadow.querySelector('#sec-structure .section-header');
        structureContent?.classList.remove('hidden');
        structureHdr?.classList.remove('collapsed');
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
        this.shadow.querySelectorAll<HTMLElement>('.color-picker').forEach(picker => {
            const prefixName = picker.dataset.prefix ?? '';
            const activeClass = Array.from(set).find(cls => {
                const base = getBaseClass(cls);
                return base.startsWith(`${prefixName}-`) && colorValueForClass(base);
            });
            const preview = picker.querySelector<HTMLElement>('.swatch-preview');
            const value = activeClass ? colorValueForClass(activeClass) : null;
            if (preview && value) preview.style.background = value;
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
        this.pushClassHistory();
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

    private applyClassSet(classes: string, removePatterns: RegExp[]): void {
        this.pushClassHistory();
        const parts = new Set(this.pendingClasses.split(/\s+/).filter(Boolean));
        for (const ex of Array.from(parts)) {
            const base = ex.replace(/^(?:[a-z0-9-]+:)+/, '');
            if (removePatterns.some(re => re.test(base))) parts.delete(ex);
        }
        for (const cls of classes.split(/\s+/).filter(Boolean)) {
            const fullCls = this.activePrefix + cls;
            parts.add(fullCls);
            injectClassForPreview(fullCls);
        }
        this.pendingClasses = Array.from(parts).join(' ');
        if (this.element) this.element.className = this.pendingClasses;
        this.syncActiveChips(this.pendingClasses);
    }

    private clearClassesMatching(match: (baseClass: string) => boolean): void {
        this.pushClassHistory();
        const parts = new Set(this.pendingClasses.split(/\s+/).filter(Boolean));
        for (const ex of Array.from(parts)) {
            if (match(getBaseClass(ex))) parts.delete(ex);
        }
        this.pendingClasses = Array.from(parts).join(' ');
        if (this.element) this.element.className = this.pendingClasses;
        this.syncActiveChips(this.pendingClasses);
    }

    private applyGradientClassSet(classes: string): void {
        const next = classes.split(/\s+/).filter(Boolean);
        const currentBase = new Set(this.pendingClasses.split(/\s+/).filter(Boolean).map(getBaseClass));
        const sameGradient = next.every(cls => currentBase.has(cls));
        if (sameGradient) {
            this.clearClassesMatching(isGradientClass);
            return;
        }
        this.applyClassSet(classes, [GRADIENT_CLASS_RE, BG_COLOR_RE]);
    }

    private gradientPreviewClassName(classes: string): string {
        const base = this.pendingClasses.split(/\s+/).filter(Boolean).filter(cls => {
            const baseCls = getBaseClass(cls);
            return !isGradientClass(baseCls) && !BG_COLOR_RE.test(baseCls);
        });
        return [...base, ...classes.split(/\s+/).filter(Boolean).map(cls => this.activePrefix + cls)].join(' ');
    }

    private previewGradientControls(): void {
        const classes = this.readGradientControls();
        injectClassesForPreview(classes.split(/\s+/).filter(Boolean).map(cls => this.activePrefix + cls).join(' '));
        const output = this.shadow.querySelector('#grad-output');
        if (output) output.textContent = classes;
        if (this.element) this.element.className = this.gradientPreviewClassName(classes);
    }

    private readGradientControls(): string {
        const value = (id: string) => (this.shadow.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
        const state = {
            type: (value('grad-type') || 'linear') as 'linear' | 'radial' | 'conic',
            direction: value('grad-direction') || 'r',
            linearAngle: value('grad-linear-angle'),
            radialPosition: value('grad-radial-position'),
            conicAngle: value('grad-conic-angle'),
            interpolation: value('grad-mode'),
            fromColor: value('grad-from-color') || 'cyan-500',
            viaColor: value('grad-via-color') || 'purple-500',
            toColor: value('grad-to-color') || 'blue-600',
            fromPos: value('grad-from-pos') || '0',
            viaPos: value('grad-via-pos') || '50',
            toPos: value('grad-to-pos') || '100',
        };
        return buildGradientClassSet(state);
    }

    private syncGradientControls(preview = true): void {
        const type = (this.shadow.querySelector('#grad-type') as HTMLSelectElement | null)?.value ?? 'linear';
        this.shadow.querySelectorAll<HTMLElement>('[data-grad-field]').forEach(field => {
            field.style.display = field.dataset.gradField === type ? 'flex' : 'none';
        });
        if (preview) this.previewGradientControls();
        else {
            const output = this.shadow.querySelector('#grad-output');
            if (output) output.textContent = this.readGradientControls();
        }
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

        this.shadow.querySelectorAll('.scope-btn[data-scope]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editScope = ((btn as HTMLElement).dataset.scope as EditScope) ?? 'instance';
                this.shadow.querySelectorAll('.scope-btn[data-scope]').forEach(scopeBtn => {
                    scopeBtn.classList.toggle('active', (scopeBtn as HTMLElement).dataset.scope === this.editScope);
                });
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
        this.shadow.querySelectorAll('.color-picker-trigger').forEach(trigger => {
            trigger.addEventListener('click', () => {
                const picker = (trigger as HTMLElement).closest('.color-picker');
                if (!picker) return;
                const popover = picker.querySelector('.color-popover');
                const willOpen = popover?.classList.contains('hidden') ?? false;
                this.shadow.querySelectorAll('.color-popover').forEach(el => el.classList.add('hidden'));
                if (willOpen) {
                    popover?.querySelectorAll<HTMLElement>('.swatch, .color-row').forEach(el => el.classList.remove('hidden'));
                    const search = popover?.querySelector<HTMLInputElement>('.color-search-input');
                    if (search) search.value = '';
                    popover?.classList.remove('hidden');
                }
            });
        });

        this.shadow.querySelectorAll('.swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const cls = (swatch as HTMLElement).dataset.class ?? '';
                if (!cls) return;
                if (cls.startsWith('bg-')) {
                    this.applyClassSet(cls, [GRADIENT_CLASS_RE, BG_COLOR_RE]);
                    this.gradientEditorOpen = false;
                    this.render();
                } else {
                    this.toggleClass(cls);
                }
                (swatch as HTMLElement).closest('.color-popover')?.classList.add('hidden');
            });
        });

        this.shadow.querySelectorAll('.color-search-input').forEach(inputEl => {
            inputEl.addEventListener('input', () => {
                const input = inputEl as HTMLInputElement;
                const query = input.value.trim().toLowerCase();
                const popover = input.closest('.color-popover');
                if (!popover) return;
                popover.querySelectorAll<HTMLElement>('.color-row').forEach(row => {
                    let hasVisible = false;
                    row.querySelectorAll<HTMLElement>('.swatch').forEach(swatch => {
                        const label = `${swatch.dataset.class ?? ''} ${swatch.title ?? ''}`.toLowerCase();
                        const visible = !query || label.includes(query);
                        swatch.classList.toggle('hidden', !visible);
                        if (visible) hasVisible = true;
                    });
                    row.classList.toggle('hidden', !hasVisible);
                });
            });
        });

        this.shadow.querySelectorAll('.gradient-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const classSet = (chip as HTMLElement).dataset.classes ?? '';
                if (!classSet) return;
                this.gradientEditorOpen = true;
                this.applyGradientClassSet(classSet);
                this.gradientEditorOpen = hasGradientClasses(this.pendingClasses);
                this.render();
            });
        });

        this.shadow.querySelector('#grad-open-btn')?.addEventListener('click', () => {
            this.gradientEditorOpen = true;
            this.render();
        });

        this.shadow.querySelectorAll('#grad-type,#grad-mode,#grad-direction,#grad-linear-angle,#grad-radial-position,#grad-conic-angle,#grad-from-color,#grad-via-color,#grad-to-color,#grad-from-pos,#grad-via-pos,#grad-to-pos').forEach(control => {
            control.addEventListener('input', () => this.syncGradientControls());
            control.addEventListener('change', () => this.syncGradientControls());
        });
        if (this.shadow.querySelector('#grad-type')) this.syncGradientControls(false);

        this.shadow.querySelector('#grad-apply-btn')?.addEventListener('click', () => {
            this.gradientEditorOpen = true;
            this.applyGradientClassSet(this.readGradientControls());
            this.gradientEditorOpen = hasGradientClasses(this.pendingClasses);
        });

        this.shadow.querySelector('#grad-clear-btn')?.addEventListener('click', () => {
            this.clearClassesMatching(isGradientClass);
            this.gradientEditorOpen = false;
            this.render();
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
        const projectStyleInput = this.shadow.querySelector('#project-style-search') as HTMLInputElement | null;
        const projectStyleBox = this.shadow.querySelector('#project-style-suggestions') as HTMLElement | null;

        // Prefixos relevantes por tipo de elemento — usados para ordenar sugestões
        const TEXT_TAGS = new Set(['span','p','h1','h2','h3','h4','h5','h6','a','label','li','td','th','dt','dd','caption','figcaption','blockquote','cite','em','strong','small','b','i','u','s']);
        const IMG_TAGS  = new Set(['img','picture','figure','video','canvas','svg']);

        const projectClassNames = this.projectClasses.map(item => item.className);

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
                const projectSameTag = projectClassNames
                    .filter(c => !active.has(c))
                    .slice(0, 8);
                const relevant = ALL_CLASSES
                    .filter(c => !active.has(c) && !projectSameTag.includes(c) && relevantPrefixes.some(p => c.startsWith(p)))
                    .slice(0, 8);
                const others = ALL_CLASSES.filter(c => !active.has(c) && !relevant.includes(c)).slice(0, 4);
                matches = [...elementOnly, ...projectSameTag, ...relevant, ...others];
            } else {
                // Ranking: exact > active/relevant > category match > contains.
                type Scored = { c: string; score: number };
                const scored = new Map<string, number>();
                const pushScore = (cls: string, score: number) => {
                    scored.set(cls, Math.max(score, scored.get(cls) ?? 0));
                };
                // Element's own active classes
                for (const c of elementClasses) {
                    const categoryMatch = categoryMatchesQuery(c, q);
                    if (!c.includes(q) && !categoryMatch) continue;
                    pushScore(c, c === q ? 95 : c.startsWith(q) ? 70 : categoryMatch ? 55 : 40);
                }
                for (const c of projectClassNames) {
                    const categoryMatch = categoryMatchesQuery(c, q);
                    if (!c.includes(q) && !categoryMatch) continue;
                    if (active.has(c)) continue;
                    pushScore(c, c === q ? 98 : c.startsWith(q) ? 78 : categoryMatch ? 60 : 42);
                }
                // ALL_CLASSES
                for (const c of ALL_CLASSES) {
                    const categoryMatch = categoryMatchesQuery(c, q);
                    if (!c.includes(q) && !categoryMatch) continue;
                    if (active.has(c)) continue; // already in element, handled above
                    const isRelevant = relevantPrefixes.some(p => c.startsWith(p));
                    let score = c === q ? 100 : c.startsWith(q) ? (isRelevant ? 60 : 50) : categoryMatch ? (isRelevant ? 45 : 35) : (isRelevant ? 30 : 10);
                    pushScore(c, score);
                }
                matches = Array.from(scored.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 20)
                    .map(([cls]) => cls);
            }

            if (!matches.length) { suggBox.style.display = 'none'; return; }

            const groups = new Map<string, string[]>();
            for (const c of matches) {
                const group = classCategory(c);
                groups.set(group, [...(groups.get(group) ?? []), c]);
            }

            suggBox.innerHTML = Array.from(groups.entries()).map(([group, items]) => `
                <div class="suggestion-group">${escapeHtml(group)}</div>
                ${items.map(c => {
                    const escaped = escapeHtml(c);
                    return `<div class="suggestion${active.has(c) ? ' active-cls' : ''}" data-class="${escaped}" title="${escapeHtml(classTooltip(c))}">
                       <span>${escaped}</span>
                       ${active.has(c) ? `<span class="suggestion-badge">${t('panelActiveBadge')}</span>` : ''}
                     </div>`;
                }).join('')}
            `).join('');
            suggBox.style.display = 'block';

            // Hover preview + click
            suggBox.querySelectorAll('.suggestion').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    const cls = (item as HTMLElement).dataset.class ?? '';
                    if (this.element && cls && !active.has(cls)) {
                        const fullCls = this.activePrefix + cls;
                        injectClassForPreview(fullCls);
                        this.element.className = this.pendingClasses + ' ' + fullCls;
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

        const renderCategoryAccordion = () => {
            const active = new Set(this.pendingClasses.split(/\s+/).filter(Boolean));
            const groups = CLASS_CATEGORIES.map(category => ({
                    name: category.key,
                items: ALL_CLASSES.filter(c => category.match(getBaseClass(c))),
            })).filter(group => group.items.length > 0);

            suggBox.innerHTML = groups.map(group => `
                <button class="suggestion-category" type="button" data-category="${escapeHtml(group.name)}">
                  <span>${escapeHtml(group.name)}</span>
                  <span class="suggestion-category-count">${group.items.length}</span>
                </button>
                <div class="suggestion-category-items" data-category-items="${escapeHtml(group.name)}">
                  ${group.items.map(c => {
                      const escaped = escapeHtml(c);
                      return `<div class="suggestion${active.has(c) ? ' active-cls' : ''}" data-class="${escaped}" title="${escapeHtml(classTooltip(c))}">
                        <span>${escaped}</span>
                        ${active.has(c) ? `<span class="suggestion-badge">${t('panelActiveBadge')}</span>` : ''}
                      </div>`;
                  }).join('')}
                </div>
            `).join('');
            suggBox.style.display = 'block';

            suggBox.querySelectorAll('.suggestion-category').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const items = (btn as HTMLElement).nextElementSibling;
                    items?.classList.toggle('open');
                    suggBox.style.display = 'block';
                });
            });

            suggBox.querySelectorAll('.suggestion').forEach(item => {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                item.addEventListener('mouseenter', () => {
                    const cls = (item as HTMLElement).dataset.class ?? '';
                    if (this.element && cls && !active.has(cls)) {
                        const fullCls = this.activePrefix + cls;
                        injectClassForPreview(fullCls);
                        this.element.className = this.pendingClasses + ' ' + fullCls;
                    }
                });
                item.addEventListener('mouseleave', () => {
                    if (this.element) this.element.className = this.pendingClasses;
                });
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const cls = (item as HTMLElement).dataset.class ?? '';
                    if (cls) {
                        this.toggleClass(cls);
                        searchInput.value = '';
                        suggBox.style.display = 'none';
                    }
                });
            });
        };

        const showProjectStyles = (q: string) => {
            if (!projectStyleBox) return;
            const query = q.trim().toLowerCase();
            const bundles = this.projectBundles
                .filter(bundle => !query || bundle.classes.toLowerCase().includes(query))
                .slice(0, 8);
            const classes = this.projectClasses
                .filter(item => !query || item.className.toLowerCase().includes(query))
                .slice(0, 16);

            if (!bundles.length && !classes.length) {
                projectStyleBox.style.display = 'none';
                return;
            }

            projectStyleBox.innerHTML = `
              ${bundles.length ? `
                <div class="suggestion-group">${escapeHtml(t('panelProjectBundlesGroup'))}</div>
                ${bundles.map(bundle => `
                  <div class="suggestion" data-project-kind="bundle" data-project-value="${escapeHtml(bundle.classes)}" title="${escapeHtml(bundle.classes)}">
                    <span>${escapeHtml(bundle.classes)}</span>
                    <span class="suggestion-badge">${escapeHtml(t('panelPresetUsed', { count: bundle.count }))}</span>
                  </div>
                `).join('')}
              ` : ''}
              ${classes.length ? `
                <div class="suggestion-group">${escapeHtml(t('panelProjectClassesGroup'))}</div>
                ${classes.map(item => `
                  <div class="suggestion" data-project-kind="class" data-project-value="${escapeHtml(item.className)}" title="${escapeHtml(classTooltip(item.className))}">
                    <span>${escapeHtml(item.className)}</span>
                    <span class="suggestion-badge">${item.count}</span>
                  </div>
                `).join('')}
              ` : ''}
            `;
            projectStyleBox.style.display = 'block';

            projectStyleBox.querySelectorAll<HTMLElement>('.suggestion[data-project-kind]').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    if (!this.element) return;
                    const kind = item.dataset.projectKind ?? '';
                    const value = item.dataset.projectValue ?? '';
                    if (!value) return;
                    if (kind === 'bundle') {
                        injectClassesForPreview(value);
                        this.element.className = value;
                    } else {
                        injectClassForPreview(value);
                        this.element.className = `${this.pendingClasses} ${value}`.trim();
                    }
                });
                item.addEventListener('mouseleave', () => {
                    if (this.element) this.element.className = this.pendingClasses;
                });
                item.addEventListener('click', () => {
                    const kind = item.dataset.projectKind ?? '';
                    const value = item.dataset.projectValue ?? '';
                    if (!value) return;
                    if (kind === 'bundle') {
                        this.pushClassHistory();
                        this.pendingClasses = value;
                        injectClassesForPreview(value);
                        if (this.element) this.element.className = value;
                        this.syncActiveChips(value);
                    } else {
                        this.toggleClass(value);
                    }
                    if (projectStyleInput) projectStyleInput.value = '';
                    projectStyleBox.style.display = 'none';
                });
            });
        };

        searchInput?.addEventListener('focus', () => {
            const q = searchInput.value.trim().toLowerCase();
            if (q) showSuggestions(q);
            else renderCategoryAccordion();
        });

        searchInput?.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            if (q) showSuggestions(q);
            else renderCategoryAccordion();
        });

        searchInput?.addEventListener('keydown', e => {
            if (e.key === 'Escape') { suggBox.style.display = 'none'; searchInput.value = ''; }
        });

        // Fecha dropdown ao perder foco (blur) — delay para deixar click em suggestion disparar primeiro
        searchInput?.addEventListener('blur', () => {
            setTimeout(() => { suggBox.style.display = 'none'; }, 180);
        });

        projectStyleInput?.addEventListener('focus', () => showProjectStyles(projectStyleInput.value));
        projectStyleInput?.addEventListener('input', () => showProjectStyles(projectStyleInput.value));
        projectStyleInput?.addEventListener('keydown', e => {
            if (e.key === 'Escape' && projectStyleBox) {
                projectStyleBox.style.display = 'none';
                projectStyleInput.value = '';
            }
        });
        projectStyleInput?.addEventListener('blur', () => {
            setTimeout(() => { if (projectStyleBox) projectStyleBox.style.display = 'none'; }, 180);
        });

        // Fecha dropdown ao clicar em qualquer área do panel fora do search-wrap
        // Nota: usamos pointerdown (antes do blur) para evitar race condition
        panelEl?.addEventListener('pointerdown', (e: Event) => {
            if (!(e.target as HTMLElement).closest('.search-wrap')) {
                suggBox.style.display = 'none';
                if (projectStyleBox) projectStyleBox.style.display = 'none';
            }
            if (!(e.target as HTMLElement).closest('.color-picker')) {
                this.shadow.querySelectorAll('.color-popover').forEach(el => el.classList.add('hidden'));
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
            const result = await this.callbacks.onTextApply(this.oid, textInput.value, this.originalText, this.editScope);
            textApplyBtn.disabled = false;
            textApplyBtn.textContent = t('panelSaveText');
            if (result.ok) this.originalText = textInput.value;
            this.showToast(result.ok ? t('panelTextSaved') : result.error ?? t('panelTextSaveError'), result.ok ? 'success' : 'error');
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
            const result = await this.callbacks.onAttrApply(this.oid, 'placeholder', placeholderInput.value, this.originalPlaceholder, this.editScope);
            if (result.ok) this.originalPlaceholder = placeholderInput.value;
            placeholderBtn.disabled = false;
            placeholderBtn.textContent = t('panelSavePlaceholder');
            this.showToast(result.ok ? t('panelPlaceholderSaved') : result.error ?? t('panelPlaceholderSaveError'), result.ok ? 'success' : 'error');
        });

        const imageSrcInput = this.shadow.querySelector('#image-src-input') as HTMLInputElement | null;
        const imageSrcBtn = this.shadow.querySelector('#image-src-apply-btn') as HTMLButtonElement | null;
        imageSrcInput?.addEventListener('input', () => {
            if (this.element) this.element.setAttribute('src', imageSrcInput.value);
        });
        imageSrcBtn?.addEventListener('click', async () => {
            if (!imageSrcInput) return;
            imageSrcBtn.disabled = true;
            imageSrcBtn.textContent = '…';
            const result = await this.callbacks.onAttrApply(this.oid, 'src', imageSrcInput.value, this.originalSrc, this.editScope);
            imageSrcBtn.disabled = false;
            imageSrcBtn.textContent = t('panelSaveImageSrc');
            if (result.ok) this.originalSrc = imageSrcInput.value;
            this.showToast(result.ok ? t('panelImageSrcSaved') : result.error ?? t('panelImageSrcSaveError'), result.ok ? 'success' : 'error');
        });

        const imageAltInput = this.shadow.querySelector('#image-alt-input') as HTMLInputElement | null;
        const imageAltBtn = this.shadow.querySelector('#image-alt-apply-btn') as HTMLButtonElement | null;
        imageAltInput?.addEventListener('input', () => {
            if (this.element) this.element.setAttribute('alt', imageAltInput.value);
        });
        imageAltBtn?.addEventListener('click', async () => {
            if (!imageAltInput) return;
            imageAltBtn.disabled = true;
            imageAltBtn.textContent = '…';
            const result = await this.callbacks.onAttrApply(this.oid, 'alt', imageAltInput.value, this.originalAlt, this.editScope);
            imageAltBtn.disabled = false;
            imageAltBtn.textContent = t('panelSaveImageAlt');
            if (result.ok) this.originalAlt = imageAltInput.value;
            this.showToast(result.ok ? t('panelImageAltSaved') : result.error ?? t('panelImageAltSaveError'), result.ok ? 'success' : 'error');
        });

        // ── Structure actions ────────────────────────────────────────────
        const bindStructureAction = (
            selector: string,
            action: () => Promise<EditResponse>,
            successMessage: string,
        ) => {
            const button = this.shadow.querySelector(selector) as HTMLButtonElement | null;
            button?.addEventListener('click', async () => {
                button.disabled = true;
                const original = button.textContent ?? '';
                button.textContent = '…';
                const result = await action();
                button.disabled = false;
                button.textContent = original;
                this.showToast(result.ok ? successMessage : result.error ?? t('panelStructureError'), result.ok ? 'success' : 'error');
            });
        };

        bindStructureAction('#insert-text-btn', () => this.callbacks.onInsertElement(this.oid, 'text'), t('panelInsertSuccess'));
        bindStructureAction('#insert-button-btn', () => this.callbacks.onInsertElement(this.oid, 'button'), t('panelInsertSuccess'));
        bindStructureAction('#insert-group-btn', () => this.callbacks.onInsertElement(this.oid, 'group'), t('panelInsertSuccess'));
        bindStructureAction('#insert-image-btn', () => this.callbacks.onInsertElement(this.oid, 'image'), t('panelInsertSuccess'));
        bindStructureAction('#remove-element-btn', () => this.callbacks.onRemoveElement(this.oid), t('panelRemoveSuccess'));

        this.shadow.querySelector('#copy-style-btn')?.addEventListener('click', () => {
            this.callbacks.onStartCopyStyle(this.oid);
            this.showToast(t('panelCopyStylePending'), 'success');
        });

        // ── Class apply ───────────────────────────────────────────────────
        const applyBtn = this.shadow.querySelector('#apply-btn') as HTMLButtonElement;
        applyBtn?.addEventListener('click', async () => {
            applyBtn.disabled = true;
            applyBtn.textContent = '…';
            const result = await this.callbacks.onApply(this.oid, this.pendingClasses, this.editScope);
            applyBtn.disabled = false;
            applyBtn.textContent = t('panelApplyClasses');
            if (result.ok) {
                this.originalClasses = this.pendingClasses;
                this.showToast(t('panelClassesSaved'), 'success');
            } else {
                this.showToast(result.error ?? t('panelClassesSaveError'), 'error');
            }
        });

        // ── Undo ──────────────────────────────────────────────────────────
        const undoBtn = this.shadow.querySelector('#undo-btn') as HTMLButtonElement;
        undoBtn?.addEventListener('click', async () => {
            const prev = this.history.pop();
            if (!prev) { this.showToast(t('panelNothingToUndo'), 'error'); return; }
            const shouldPersistUndo = this.originalClasses === this.pendingClasses;
            this.pendingClasses = prev;
            if (this.element) this.element.className = prev;
            this.syncActiveChips(prev);

            if (!shouldPersistUndo) {
                this.showToast(t('panelPreviewUndone'), 'success');
                return;
            }

            const result = await this.callbacks.onApply(this.oid, prev, this.editScope);
            if (result.ok) this.originalClasses = prev;
            this.showToast(result.ok ? t('panelUndone') : result.error ?? t('panelUndoError'), result.ok ? 'success' : 'error');
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

    destroy(): void { this.unsubscribeLanguage?.(); this.host.remove(); }
}
