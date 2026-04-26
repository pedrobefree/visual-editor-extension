import { twMerge, type ClassNameValue } from 'tailwind-merge';

const BG_PATTERNS = {
    color: /^bg-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)|transparent|current|inherit|black|white|\[.*?\])$/,
    repeat: /^bg-(?:repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space)$/,
    size: /^bg-(?:auto|cover|contain)$/,
    position: /^bg-(?:bottom|center|left|left-bottom|left-top|right|right-bottom|right-top|top)$/,
    attachment: /^bg-(?:fixed|local|scroll)$/,
} as const;

const dedupBackgroundClasses = (classes: string[]): string[] => {
    const categories: Record<keyof typeof BG_PATTERNS, string[]> = {
        color: [],
        repeat: [],
        size: [],
        position: [],
        attachment: [],
    };
    const nonBg: string[] = [];

    for (const cls of classes) {
        let categorized = false;
        for (const [category, pattern] of Object.entries(BG_PATTERNS)) {
            if (pattern.test(cls)) {
                categories[category as keyof typeof BG_PATTERNS].push(cls);
                categorized = true;
                break;
            }
        }
        if (!categorized) nonBg.push(cls);
    }

    return [
        ...nonBg,
        ...Object.values(categories)
            .map((arr) => arr.pop())
            .filter((x): x is string => Boolean(x)),
    ];
};

export const customTwMerge = (...classLists: ClassNameValue[]): string => {
    const merged = twMerge(...classLists);
    const classes = merged.split(/\s+/).filter(Boolean);
    const deduped = dedupBackgroundClasses(classes);
    return twMerge(deduped.join(' '));
};
