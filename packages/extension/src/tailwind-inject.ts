/**
 * tailwind-inject.ts
 * Injeta regras CSS no documento da página para que classes Tailwind adicionadas
 * em tempo de execução tenham efeito visual imediato (sem rebuild do projeto).
 * Abordagem: lazy injection — gera e injeta a regra CSS somente quando a classe
 * é aplicada pela primeira vez. Inspirado pelo tifoo (syncinsect/tifoo).
 */

const VE_STYLE_ID = 've-tailwind-preview';
const injected = new Set<string>();

function getStyleEl(): HTMLStyleElement {
    let el = document.getElementById(VE_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement('style');
        el.id = VE_STYLE_ID;
        document.head.appendChild(el);
    }
    return el;
}

/** Escapa o nome da classe para uso como seletor CSS. */
function escapeCls(cls: string): string {
    return cls.replace(/[:.[\]/\\%#@!]/g, '\\$&');
}

/* ── Tailwind spacing scale ─────────────────────────────────────────────── */
const SPACE: Record<string, string> = {
    '0': '0px', 'px': '1px',
    '0.5': '0.125rem', '1': '0.25rem', '1.5': '0.375rem',
    '2': '0.5rem', '2.5': '0.625rem', '3': '0.75rem', '3.5': '0.875rem',
    '4': '1rem', '5': '1.25rem', '6': '1.5rem', '7': '1.75rem',
    '8': '2rem', '9': '2.25rem', '10': '2.5rem', '11': '2.75rem',
    '12': '3rem', '14': '3.5rem', '16': '4rem', '20': '5rem',
    '24': '6rem', '28': '7rem', '32': '8rem', '36': '9rem',
    '40': '10rem', '44': '11rem', '48': '12rem', '52': '13rem',
    '56': '14rem', '60': '15rem', '64': '16rem', '72': '18rem',
    '80': '20rem', '96': '24rem',
};

/* ── Tailwind color palette ─────────────────────────────────────────────── */
const COLOR_HEX: Record<string, Record<number, string>> = {
    slate:   { 50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a',950:'#020617' },
    gray:    { 50:'#f9fafb',100:'#f3f4f6',200:'#e5e7eb',300:'#d1d5db',400:'#9ca3af',500:'#6b7280',600:'#4b5563',700:'#374151',800:'#1f2937',900:'#111827',950:'#030712' },
    zinc:    { 50:'#fafafa',100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#52525b',700:'#3f3f46',800:'#27272a',900:'#18181b',950:'#09090b' },
    red:     { 50:'#fef2f2',100:'#fee2e2',200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d',950:'#450a0a' },
    orange:  { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407' },
    amber:   { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f',950:'#451a03' },
    yellow:  { 50:'#fefce8',100:'#fef9c3',200:'#fef08a',300:'#fde047',400:'#facc15',500:'#eab308',600:'#ca8a04',700:'#a16207',800:'#854d0e',900:'#713f12',950:'#422006' },
    lime:    { 50:'#f7fee7',100:'#ecfccb',200:'#d9f99d',300:'#bef264',400:'#a3e635',500:'#84cc16',600:'#65a30d',700:'#4d7c0f',800:'#3f6212',900:'#365314',950:'#1a2e05' },
    green:   { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',800:'#166534',900:'#14532d',950:'#052e16' },
    teal:    { 50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a',950:'#042f2e' },
    cyan:    { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63',950:'#083344' },
    sky:     { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e',950:'#082f49' },
    blue:    { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8f',950:'#172554' },
    indigo:  { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81',950:'#1e1b4b' },
    violet:  { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95',950:'#2e1065' },
    purple:  { 50:'#faf5ff',100:'#f3e8ff',200:'#e9d5ff',300:'#d8b4fe',400:'#c084fc',500:'#a855f7',600:'#9333ea',700:'#7e22ce',800:'#6b21a8',900:'#581c87',950:'#3b0764' },
    fuchsia: { 50:'#fdf4ff',100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75',950:'#4a044e' },
    pink:    { 50:'#fdf2f8',100:'#fce7f3',200:'#fbcfe8',300:'#f9a8d4',400:'#f472b6',500:'#ec4899',600:'#db2777',700:'#be185d',800:'#9d174d',900:'#831843',950:'#500724' },
    rose:    { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337',950:'#4c0519' },
};

const COLORS = Object.keys(COLOR_HEX);
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/* ── CSS declaration generator ──────────────────────────────────────────── */
function classToCss(cls: string): string | null {

    // ── Background colors ──────────────────────────────────────────────────
    for (const c of COLORS) {
        for (const s of SHADES) {
            if (cls === `bg-${c}-${s}`) return `background-color:${COLOR_HEX[c]![s]}`;
        }
    }
    if (cls === 'bg-white')       return 'background-color:#ffffff';
    if (cls === 'bg-black')       return 'background-color:#000000';
    if (cls === 'bg-transparent') return 'background-color:transparent';

    // ── Text colors ────────────────────────────────────────────────────────
    for (const c of COLORS) {
        for (const s of SHADES) {
            if (cls === `text-${c}-${s}`) return `color:${COLOR_HEX[c]![s]}`;
        }
    }
    if (cls === 'text-white')       return 'color:#ffffff';
    if (cls === 'text-black')       return 'color:#000000';
    if (cls === 'text-transparent') return 'color:transparent';

    // ── Border colors ──────────────────────────────────────────────────────
    for (const c of COLORS) {
        for (const s of SHADES) {
            if (cls === `border-${c}-${s}`) return `border-color:${COLOR_HEX[c]![s]}`;
        }
    }
    if (cls === 'border-white') return 'border-color:#ffffff';
    if (cls === 'border-black') return 'border-color:#000000';

    // ── Ring colors ────────────────────────────────────────────────────────
    for (const c of COLORS) {
        for (const s of SHADES) {
            if (cls === `ring-${c}-${s}`) return `--tw-ring-color:${COLOR_HEX[c]![s]};box-shadow:var(--tw-ring-inset,) 0 0 0 var(--tw-ring-offset-width,0px) var(--tw-ring-offset-color,#fff),var(--tw-ring-inset,) 0 0 0 calc(3px + var(--tw-ring-offset-width,0px)) var(--tw-ring-color,${COLOR_HEX[c]![s]})`;
        }
    }

    // ── Spacing ────────────────────────────────────────────────────────────
    const spacingPrefixes: Record<string, string | string[]> = {
        'p':  'padding', 'px': ['padding-left','padding-right'],
        'py': ['padding-top','padding-bottom'],
        'pt': 'padding-top', 'pb': 'padding-bottom',
        'pl': 'padding-left', 'pr': 'padding-right',
        'm':  'margin',  'mx': ['margin-left','margin-right'],
        'my': ['margin-top','margin-bottom'],
        'mt': 'margin-top', 'mb': 'margin-bottom',
        'ml': 'margin-left', 'mr': 'margin-right',
        'gap': 'gap', 'gap-x': 'column-gap', 'gap-y': 'row-gap',
        'space-x': null as unknown as string, // handled separately
        'space-y': null as unknown as string,
    };
    for (const [pfx, prop] of Object.entries(spacingPrefixes)) {
        if (!prop) continue;
        const rest = cls.startsWith(`${pfx}-`) ? cls.slice(pfx.length + 1) : null;
        if (rest === null) continue;
        // auto
        if (rest === 'auto') {
            const props = Array.isArray(prop) ? prop : [prop];
            return props.map(p => `${p}:auto`).join(';');
        }
        const val = SPACE[rest];
        if (!val) continue;
        const props = Array.isArray(prop) ? prop : [prop];
        return props.map(p => `${p}:${val}`).join(';');
    }
    // m-auto, mx-auto, etc
    if (/^(m|mx|my|mt|mb|ml|mr)-auto$/.test(cls)) {
        const pfxMap: Record<string,string[]> = { m:['margin'],mx:['margin-left','margin-right'],my:['margin-top','margin-bottom'],mt:['margin-top'],mb:['margin-bottom'],ml:['margin-left'],mr:['margin-right'] };
        const pfx2 = cls.split('-auto')[0]!;
        return (pfxMap[pfx2] ?? []).map(p => `${p}:auto`).join(';');
    }

    // ── Typography ─────────────────────────────────────────────────────────
    const textSizes: Record<string,[string,string]> = {
        'xs':  ['0.75rem','1rem'],    'sm':   ['0.875rem','1.25rem'],
        'base':['1rem','1.5rem'],     'lg':   ['1.125rem','1.75rem'],
        'xl':  ['1.25rem','1.75rem'], '2xl':  ['1.5rem','2rem'],
        '3xl': ['1.875rem','2.25rem'],'4xl':  ['2.25rem','2.5rem'],
        '5xl': ['3rem','1'],          '6xl':  ['3.75rem','1'],
        '7xl': ['4.5rem','1'],        '8xl':  ['6rem','1'],
        '9xl': ['8rem','1'],
    };
    if (cls.startsWith('text-')) {
        const sz = cls.slice(5);
        if (textSizes[sz]) return `font-size:${textSizes[sz]![0]};line-height:${textSizes[sz]![1]}`;
        const ta: Record<string,string> = { left:'left',center:'center',right:'right',justify:'justify',start:'start',end:'end' };
        if (ta[sz]) return `text-align:${ta[sz]}`;
    }
    const fontWeights: Record<string,string> = {
        'thin':'100','extralight':'200','light':'300','normal':'400',
        'medium':'500','semibold':'600','bold':'700','extrabold':'800','black':'900',
    };
    if (cls.startsWith('font-')) {
        const w = fontWeights[cls.slice(5)];
        if (w) return `font-weight:${w}`;
        const fontFamilies: Record<string,string> = {
            'sans':"ui-sans-serif,system-ui,-apple-system,sans-serif",
            'serif':"ui-serif,Georgia,serif",
            'mono':"ui-monospace,SFMono-Regular,monospace",
        };
        const ff = fontFamilies[cls.slice(5)];
        if (ff) return `font-family:${ff}`;
    }
    if (cls === 'italic') return 'font-style:italic';
    if (cls === 'not-italic') return 'font-style:normal';
    if (cls === 'underline') return 'text-decoration-line:underline';
    if (cls === 'overline') return 'text-decoration-line:overline';
    if (cls === 'line-through') return 'text-decoration-line:line-through';
    if (cls === 'no-underline') return 'text-decoration-line:none';
    if (cls === 'uppercase') return 'text-transform:uppercase';
    if (cls === 'lowercase') return 'text-transform:lowercase';
    if (cls === 'capitalize') return 'text-transform:capitalize';
    if (cls === 'normal-case') return 'text-transform:none';
    if (cls === 'truncate') return 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    if (cls === 'text-ellipsis') return 'text-overflow:ellipsis';
    if (cls === 'text-clip') return 'text-overflow:clip';
    const trackings: Record<string,string> = {
        'tracking-tighter':'-0.05em','tracking-tight':'-0.025em','tracking-normal':'0em',
        'tracking-wide':'0.025em','tracking-wider':'0.05em','tracking-widest':'0.1em',
    };
    if (trackings[cls]) return `letter-spacing:${trackings[cls]}`;
    const leadings: Record<string,string> = {
        'leading-none':'1','leading-tight':'1.25','leading-snug':'1.375',
        'leading-normal':'1.5','leading-relaxed':'1.625','leading-loose':'2',
    };
    if (leadings[cls]) return `line-height:${leadings[cls]}`;
    const whitespaces: Record<string,string> = {
        'whitespace-normal':'normal','whitespace-nowrap':'nowrap',
        'whitespace-pre':'pre','whitespace-pre-line':'pre-line','whitespace-pre-wrap':'pre-wrap',
    };
    if (whitespaces[cls]) return `white-space:${whitespaces[cls]}`;

    // ── Layout / Display ───────────────────────────────────────────────────
    const displays: Record<string,string> = {
        'block':'block','inline-block':'inline-block','inline':'inline',
        'flex':'flex','inline-flex':'inline-flex','grid':'grid',
        'inline-grid':'inline-grid','hidden':'none','contents':'contents',
        'flow-root':'flow-root','list-item':'list-item',
    };
    if (cls in displays) {
        return cls === 'hidden' ? 'display:none' : `display:${displays[cls]}`;
    }

    // ── Flexbox ────────────────────────────────────────────────────────────
    const flexMap: Record<string,string> = {
        'flex-row':'flex-direction:row','flex-col':'flex-direction:column',
        'flex-row-reverse':'flex-direction:row-reverse','flex-col-reverse':'flex-direction:column-reverse',
        'flex-wrap':'flex-wrap:wrap','flex-nowrap':'flex-wrap:nowrap','flex-wrap-reverse':'flex-wrap:wrap-reverse',
        'flex-1':'flex:1 1 0%','flex-auto':'flex:1 1 auto','flex-initial':'flex:0 1 auto','flex-none':'flex:none',
        'grow':'flex-grow:1','grow-0':'flex-grow:0','shrink':'flex-shrink:1','shrink-0':'flex-shrink:0',
    };
    if (flexMap[cls]) return flexMap[cls]!;
    const justifyMap: Record<string,string> = {
        'justify-start':'justify-content:flex-start','justify-end':'justify-content:flex-end',
        'justify-center':'justify-content:center','justify-between':'justify-content:space-between',
        'justify-around':'justify-content:space-around','justify-evenly':'justify-content:space-evenly',
    };
    if (justifyMap[cls]) return justifyMap[cls]!;
    const itemsMap: Record<string,string> = {
        'items-start':'align-items:flex-start','items-end':'align-items:flex-end',
        'items-center':'align-items:center','items-baseline':'align-items:baseline','items-stretch':'align-items:stretch',
    };
    if (itemsMap[cls]) return itemsMap[cls]!;
    const selfMap: Record<string,string> = {
        'self-auto':'align-self:auto','self-start':'align-self:flex-start','self-end':'align-self:flex-end',
        'self-center':'align-self:center','self-stretch':'align-self:stretch','self-baseline':'align-self:baseline',
    };
    if (selfMap[cls]) return selfMap[cls]!;

    // ── Grid ───────────────────────────────────────────────────────────────
    for (let i = 1; i <= 12; i++) {
        if (cls === `grid-cols-${i}`) return `grid-template-columns:repeat(${i},minmax(0,1fr))`;
        if (cls === `grid-rows-${i}`) return `grid-template-rows:repeat(${i},minmax(0,1fr))`;
        if (cls === `col-span-${i}`) return `grid-column:span ${i}/span ${i}`;
        if (cls === `row-span-${i}`) return `grid-row:span ${i}/span ${i}`;
    }
    if (cls === 'col-span-full') return 'grid-column:1/-1';
    if (cls === 'row-span-full') return 'grid-row:1/-1';

    // ── Sizing ─────────────────────────────────────────────────────────────
    const sizingMapped: Record<string,string> = {
        'w-auto':'auto','w-full':'100%','w-screen':'100vw','w-fit':'fit-content',
        'w-min':'min-content','w-max':'max-content',
        'w-1/2':'50%','w-1/3':'33.333333%','w-2/3':'66.666667%',
        'w-1/4':'25%','w-3/4':'75%','w-1/5':'20%','w-2/5':'40%','w-3/5':'60%','w-4/5':'80%',
        'h-auto':'auto','h-full':'100%','h-screen':'100vh','h-fit':'fit-content',
        'h-min':'min-content','h-max':'max-content',
        'h-dvh':'100dvh','h-lvh':'100lvh','h-svh':'100svh',
    };
    if (sizingMapped[cls]) {
        const prop = cls.startsWith('w-') ? 'width' : 'height';
        return `${prop}:${sizingMapped[cls]}`;
    }
    for (const [k,v] of Object.entries(SPACE)) {
        if (cls === `w-${k}`) return `width:${v}`;
        if (cls === `h-${k}`) return `height:${v}`;
        if (cls === `min-w-${k}`) return `min-width:${v}`;
        if (cls === `max-w-${k}`) return `max-width:${v}`;
        if (cls === `min-h-${k}`) return `min-height:${v}`;
        if (cls === `max-h-${k}`) return `max-height:${v}`;
    }
    const maxWmap: Record<string,string> = {
        'max-w-none':'none','max-w-xs':'20rem','max-w-sm':'24rem','max-w-md':'28rem',
        'max-w-lg':'32rem','max-w-xl':'36rem','max-w-2xl':'42rem','max-w-3xl':'48rem',
        'max-w-4xl':'56rem','max-w-5xl':'64rem','max-w-6xl':'72rem','max-w-7xl':'80rem',
        'max-w-full':'100%','max-w-screen-sm':'640px','max-w-screen-md':'768px',
        'max-w-screen-lg':'1024px','max-w-screen-xl':'1280px','max-w-screen-2xl':'1536px',
        'max-w-prose':'65ch',
    };
    if (maxWmap[cls]) return `max-width:${maxWmap[cls]}`;

    // ── Position ───────────────────────────────────────────────────────────
    const posMap: Record<string,string> = {
        'static':'position:static','fixed':'position:fixed',
        'absolute':'position:absolute','relative':'position:relative','sticky':'position:sticky',
    };
    if (posMap[cls]) return posMap[cls]!;
    const insetMap: Record<string,string> = {
        'inset-0':'inset:0px','inset-x-0':'left:0px;right:0px','inset-y-0':'top:0px;bottom:0px',
        'top-0':'top:0px','right-0':'right:0px','bottom-0':'bottom:0px','left-0':'left:0px',
        'top-auto':'top:auto','right-auto':'right:auto','bottom-auto':'bottom:auto','left-auto':'left:auto',
    };
    if (insetMap[cls]) return insetMap[cls]!;
    for (const [k,v] of Object.entries(SPACE)) {
        for (const side of ['top','right','bottom','left']) {
            if (cls === `${side}-${k}`) return `${side}:${v}`;
        }
    }

    // ── Border ─────────────────────────────────────────────────────────────
    const roundedMap: Record<string,string> = {
        'rounded-none':'0px','rounded-sm':'0.125rem','rounded':'0.25rem',
        'rounded-md':'0.375rem','rounded-lg':'0.5rem','rounded-xl':'0.75rem',
        'rounded-2xl':'1rem','rounded-3xl':'1.5rem','rounded-full':'9999px',
    };
    if (roundedMap[cls]) return `border-radius:${roundedMap[cls]}`;
    const borderWidths: Record<string,string> = {
        'border':'1px','border-0':'0px','border-2':'2px','border-4':'4px','border-8':'8px',
    };
    if (borderWidths[cls]) return `border-width:${borderWidths[cls]}`;
    const borderStyles: Record<string,string> = {
        'border-solid':'solid','border-dashed':'dashed','border-dotted':'dotted',
        'border-double':'double','border-none':'none',
    };
    if (cls in borderStyles) return `border-style:${borderStyles[cls as keyof typeof borderStyles]}`;

    // ── Shadow ─────────────────────────────────────────────────────────────
    const shadows: Record<string,string> = {
        'shadow-sm':'0 1px 2px 0 rgb(0 0 0/0.05)',
        'shadow':'0 1px 3px 0 rgb(0 0 0/0.1),0 1px 2px -1px rgb(0 0 0/0.1)',
        'shadow-md':'0 4px 6px -1px rgb(0 0 0/0.1),0 2px 4px -2px rgb(0 0 0/0.1)',
        'shadow-lg':'0 10px 15px -3px rgb(0 0 0/0.1),0 4px 6px -4px rgb(0 0 0/0.1)',
        'shadow-xl':'0 20px 25px -5px rgb(0 0 0/0.1),0 8px 10px -6px rgb(0 0 0/0.1)',
        'shadow-2xl':'0 25px 50px -12px rgb(0 0 0/0.25)',
        'shadow-inner':'inset 0 2px 4px 0 rgb(0 0 0/0.05)',
        'shadow-none':'0 0 #0000',
    };
    if (shadows[cls]) return `box-shadow:${shadows[cls]}`;

    // ── Opacity ────────────────────────────────────────────────────────────
    const opMatch = cls.match(/^opacity-(\d+)$/);
    if (opMatch) return `opacity:${Number(opMatch[1]) / 100}`;

    // ── Z-index ────────────────────────────────────────────────────────────
    const zMap: Record<string,string> = { 'z-0':'0','z-10':'10','z-20':'20','z-30':'30','z-40':'40','z-50':'50','z-auto':'auto' };
    if (zMap[cls]) return `z-index:${zMap[cls]}`;

    // ── Overflow ───────────────────────────────────────────────────────────
    for (const v of ['auto','hidden','visible','scroll','clip']) {
        if (cls === `overflow-${v}`) return `overflow:${v}`;
        if (cls === `overflow-x-${v}`) return `overflow-x:${v}`;
        if (cls === `overflow-y-${v}`) return `overflow-y:${v}`;
    }

    // ── Cursor ─────────────────────────────────────────────────────────────
    const cursors: Record<string,string> = {
        'cursor-auto':'auto','cursor-default':'default','cursor-pointer':'pointer',
        'cursor-wait':'wait','cursor-text':'text','cursor-move':'move',
        'cursor-not-allowed':'not-allowed','cursor-crosshair':'crosshair','cursor-grab':'grab',
    };
    if (cursors[cls]) return `cursor:${cursors[cls]}`;

    // ── Pointer events ─────────────────────────────────────────────────────
    if (cls === 'pointer-events-none') return 'pointer-events:none';
    if (cls === 'pointer-events-auto') return 'pointer-events:auto';

    // ── Visibility / misc ──────────────────────────────────────────────────
    if (cls === 'visible')   return 'visibility:visible';
    if (cls === 'invisible') return 'visibility:hidden';
    if (cls === 'collapse')  return 'visibility:collapse';

    // ── Select ─────────────────────────────────────────────────────────────
    const selects: Record<string,string> = { 'select-none':'none','select-text':'text','select-all':'all','select-auto':'auto' };
    if (selects[cls]) return `user-select:${selects[cls]}`;

    // ── Object fit ─────────────────────────────────────────────────────────
    for (const v of ['contain','cover','fill','none','scale-down']) {
        if (cls === `object-${v}`) return `object-fit:${v}`;
    }

    // ── Aspect ratio ───────────────────────────────────────────────────────
    if (cls === 'aspect-auto') return 'aspect-ratio:auto';
    if (cls === 'aspect-square') return 'aspect-ratio:1/1';
    if (cls === 'aspect-video') return 'aspect-ratio:16/9';

    // ── Transition ─────────────────────────────────────────────────────────
    const trans: Record<string,string> = {
        'transition':'transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms',
        'transition-all':'transition-property:all;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms',
        'transition-colors':'transition-property:color,background-color,border-color,text-decoration-color,fill,stroke;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms',
        'transition-opacity':'transition-property:opacity;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms',
        'transition-transform':'transition-property:transform;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms',
        'transition-none':'transition-property:none',
    };
    if (trans[cls]) return trans[cls]!;
    const durMatch = cls.match(/^duration-(\d+)$/);
    if (durMatch) return `transition-duration:${durMatch[1]}ms`;
    const easeMap: Record<string,string> = {
        'ease-linear':'linear','ease-in':'cubic-bezier(0.4,0,1,1)',
        'ease-out':'cubic-bezier(0,0,0.2,1)','ease-in-out':'cubic-bezier(0.4,0,0.2,1)',
    };
    if (easeMap[cls]) return `transition-timing-function:${easeMap[cls]}`;

    // ── Misc utilities ─────────────────────────────────────────────────────
    if (cls === 'antialiased') return '-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale';
    if (cls === 'subpixel-antialiased') return '-webkit-font-smoothing:auto;-moz-osx-font-smoothing:auto';
    if (cls === 'sr-only') return 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border-width:0';
    if (cls === 'not-sr-only') return 'position:static;width:auto;height:auto;padding:0;margin:0;overflow:visible;clip:auto;white-space:normal';

    return null;
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * Injeta a regra CSS para a classe Tailwind indicada no documento da página,
 * permitindo preview ao vivo mesmo que o CSS da classe não tenha sido gerado
 * pelo build do Tailwind do projeto.
 */
export function injectClassForPreview(cls: string): void {
    if (!cls || injected.has(cls)) return;
    const css = classToCss(cls);
    if (!css) return;
    const el = getStyleEl();
    el.textContent += `.${escapeCls(cls)}{${css}}\n`;
    injected.add(cls);
}

/**
 * Injeta CSS para todas as classes de um className string (espaços separando).
 */
export function injectClassesForPreview(classString: string): void {
    for (const cls of classString.split(/\s+/).filter(Boolean)) {
        injectClassForPreview(cls);
    }
}
