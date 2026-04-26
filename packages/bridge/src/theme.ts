import { readFileSync, writeFileSync, statSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface ThemeColor {
    name: string;
    value: string;     // display value (original CSS string)
    hex: string;       // hex for the color picker (#rrggbb)
    variable?: string;
    filePath?: string;
}

export interface ThemeFont {
    name: string;
    value: string;
    variable?: string;
    filePath?: string;
}

export interface ThemeData {
    colors: ThemeColor[];
    fonts: ThemeFont[];
}

export interface ThemeUpdate {
    type: 'color' | 'font';
    name: string;
    value: string;
    variable?: string;
    filePath?: string;
}

/* ── Colour helpers ───────────────────────────────────────────────────────── */
function clamp(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(n => clamp(n).toString(16).padStart(2, '0')).join('');
}

/**
 * Tries to parse any CSS colour string into a #rrggbb hex.
 * Handles:
 *  - #abc, #aabbcc, #aabbccdd
 *  - rgb(r, g, b) or rgb(r g b)      ← Tailwind v4 space-separated
 *  - rgba(r, g, b, a)
 * Returns null for formats we can't convert (hsl, oklch, etc.)
 */
function toHex(value: string): string | null {
    const v = value.trim();
    // Already hex
    if (/^#[0-9a-f]{3}$/i.test(v)) {
        const [, r, g, b] = v.match(/^#(.)(.)(.)$/)!;
        return `#${r!+r!}${g!+g!}${b!+b!}`;
    }
    if (/^#[0-9a-f]{6,8}$/i.test(v)) return v.slice(0, 7);

    // rgb / rgba — comma or space separated
    const m = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    if (m) return rgbToHex(parseFloat(m[1]!), parseFloat(m[2]!), parseFloat(m[3]!));

    return null; // hsl, oklch, lch, calc() — can't trivially convert
}

/* ── File discovery ───────────────────────────────────────────────────────── */
const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'build', 'out', '.turbo', '.cache']);

function walkForCss(dir: string, found: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return found; }
    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        try {
            const st = statSync(full);
            if (st.isDirectory()) walkForCss(full, found);
            else if (entry.endsWith('.css')) found.push(full);
        } catch { /* skip */ }
    }
    return found;
}

/* ── CSS block extractor ──────────────────────────────────────────────────── */
/**
 * Extracts the contents of `:root { }` and `@theme { }` blocks.
 * Uses a brace-counting approach so nested blocks don't trip us up.
 */
function extractBlocks(content: string): string[] {
    const blocks: string[] = [];
    // Match the start of a :root or @theme rule
    const startRe = /(?::root|@theme)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(content)) !== null) {
        const openPos = m.index + m[0].length - 1; // position of the opening '{'
        let depth = 1;
        let i = openPos + 1;
        while (i < content.length && depth > 0) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') depth--;
            i++;
        }
        blocks.push(content.slice(openPos + 1, i - 1));
    }
    return blocks;
}

/* ── Variable parser ──────────────────────────────────────────────────────── */
function parseBlocks(blocks: string[], filePath: string): { colors: ThemeColor[]; fonts: ThemeFont[] } {
    const colors: ThemeColor[] = [];
    const fonts:  ThemeFont[]  = [];

    // Matches a single CSS custom property declaration
    // -- var-name : value ;   (value may contain spaces, parens, etc.)
    const propRe = /--([A-Za-z0-9_-]+)\s*:\s*([^;]+?)\s*;/g;

    for (const block of blocks) {
        let pm: RegExpExecArray | null;
        while ((pm = propRe.exec(block)) !== null) {
            const varName = pm[1]!;
            const raw     = pm[2]!.trim();

            // --- Colour variable ---
            // A property is a colour if its value parses to a hex colour
            const hex = toHex(raw);
            if (hex) {
                // Skip non-colour-looking variable names (spacing, radius, etc.)
                const isLikelyColor =
                    /color|colour|brand|primary|secondary|accent|bg|background|text|border|ring|shadow|fill|stroke/i.test(varName) ||
                    /^#/.test(raw) ||
                    /^rgb/.test(raw);

                if (isLikelyColor) {
                    const friendlyName = varName
                        .replace(/^color-/, '')
                        .replace(/^col-/, '');
                    colors.push({ name: friendlyName, value: raw, hex, variable: `--${varName}`, filePath });
                }
                continue;
            }

            // --- Font variable ---
            if (/font/i.test(varName)) {
                // Skip if the value looks like spacing/calc
                if (/^calc|^var\(--spacing/.test(raw)) continue;
                const value = raw.replace(/^['"]|['"]$/g, '').split(',')[0]!.trim();
                if (!value) continue;
                const friendlyName = varName.replace(/^font-?/, '') || varName;
                fonts.push({ name: friendlyName, value: raw, variable: `--${varName}`, filePath });
            }
        }
    }

    return { colors, fonts };
}

/* ── Public API ───────────────────────────────────────────────────────────── */

export function readTheme(projectRoot: string): ThemeData {
    const cssFiles  = walkForCss(projectRoot);
    const allColors: ThemeColor[] = [];
    const allFonts:  ThemeFont[]  = [];
    const seenVars  = new Set<string>();

    for (const file of cssFiles) {
        try {
            const content = readFileSync(file, 'utf-8');
            const blocks  = extractBlocks(content);
            if (!blocks.length) continue;

            const parsed = parseBlocks(blocks, file);

            for (const c of parsed.colors) {
                if (c.variable && seenVars.has(c.variable)) continue;
                if (c.variable) seenVars.add(c.variable);
                allColors.push(c);
            }
            for (const f of parsed.fonts) {
                if (f.variable && seenVars.has(f.variable)) continue;
                if (f.variable) seenVars.add(f.variable);
                allFonts.push(f);
            }
        } catch { /* skip unreadable */ }
    }

    return { colors: allColors, fonts: allFonts };
}

export function writeTheme(update: ThemeUpdate): boolean {
    if (!update.filePath || !existsSync(update.filePath)) return false;
    if (!update.variable) return false;

    try {
        const content    = readFileSync(update.filePath, 'utf-8');
        const escaped    = update.variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re         = new RegExp(`(${escaped}\\s*:\\s*)([^;]+)(;)`, 'g');
        const newContent = content.replace(re, `$1${update.value}$3`);
        if (newContent === content) return false;
        writeFileSync(update.filePath, newContent, 'utf-8');
        return true;
    } catch { return false; }
}
