import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export type PresetKind = 'Section' | 'Card' | 'Hero' | 'FeatureGrid' | 'CTA';

export interface PresetInfo {
    kind: PresetKind;
    label: string;
    description: string;
}

export const PRESETS: PresetInfo[] = [
    { kind: 'Section',     label: 'Section',      description: 'Generic content section wrapper' },
    { kind: 'Card',        label: 'Card',         description: 'Content card with title and body' },
    { kind: 'Hero',        label: 'Hero',         description: 'Full-width hero with heading and CTA' },
    { kind: 'FeatureGrid', label: 'Feature Grid', description: 'Grid of feature items' },
    { kind: 'CTA',         label: 'CTA',          description: 'Call-to-action banner' },
];

function sectionSource(name: string): string {
    return `export interface ${name}Props {
  className?: string;
  children?: React.ReactNode;
}

export function ${name}({ className = "", children }: ${name}Props) {
  return (
    <section className={\`py-16 px-4 \${className}\`}>
      <div className="max-w-5xl mx-auto">
        {children}
      </div>
    </section>
  );
}
`;
}

function cardSource(name: string): string {
    return `export interface ${name}Props {
  className?: string;
  title?: string;
  body?: string;
}

export function ${name}({ className = "", title = "Card Title", body = "Card content goes here." }: ${name}Props) {
  return (
    <div className={\`rounded-2xl border border-neutral-200 p-6 shadow-sm \${className}\`}>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-neutral-600 text-sm">{body}</p>
    </div>
  );
}
`;
}

function heroSource(name: string): string {
    return `export interface ${name}Props {
  className?: string;
  heading?: string;
  subheading?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function ${name}({
  className = "",
  heading = "Your Headline Here",
  subheading = "A short supporting message that explains your value proposition.",
  ctaLabel = "Get Started",
  ctaHref = "#",
}: ${name}Props) {
  return (
    <section className={\`py-24 px-4 text-center \${className}\`}>
      <h1 className="text-4xl font-bold tracking-tight mb-4">{heading}</h1>
      <p className="text-lg text-neutral-600 max-w-xl mx-auto mb-8">{subheading}</p>
      <a href={ctaHref} className="inline-flex items-center px-6 py-3 rounded-full bg-black text-white font-medium hover:bg-neutral-800 transition">
        {ctaLabel}
      </a>
    </section>
  );
}
`;
}

function featureGridSource(name: string): string {
    return `const FEATURES = [
  { title: "Feature One", body: "Describe what makes this feature valuable." },
  { title: "Feature Two", body: "Another benefit your users will love." },
  { title: "Feature Three", body: "Keep it short and scannable." },
];

export interface ${name}Props {
  className?: string;
}

export function ${name}({ className = "" }: ${name}Props) {
  return (
    <section className={\`py-16 px-4 \${className}\`}>
      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map(({ title, body }) => (
          <div key={title} className="rounded-2xl border border-neutral-200 p-6">
            <h3 className="text-base font-semibold mb-2">{title}</h3>
            <p className="text-sm text-neutral-600">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
`;
}

function ctaSource(name: string): string {
    return `export interface ${name}Props {
  className?: string;
  heading?: string;
  label?: string;
  href?: string;
}

export function ${name}({
  className = "",
  heading = "Ready to get started?",
  label = "Sign Up Free",
  href = "#",
}: ${name}Props) {
  return (
    <section className={\`py-16 px-4 bg-black text-white text-center \${className}\`}>
      <h2 className="text-3xl font-bold mb-6">{heading}</h2>
      <a href={href} className="inline-flex items-center px-8 py-3 rounded-full bg-white text-black font-semibold hover:bg-neutral-100 transition">
        {label}
      </a>
    </section>
  );
}
`;
}

const PRESET_SOURCES: Record<PresetKind, (name: string) => string> = {
    Section:     sectionSource,
    Card:        cardSource,
    Hero:        heroSource,
    FeatureGrid: featureGridSource,
    CTA:         ctaSource,
};

export interface CreatePresetResult {
    ok: boolean;
    error?: string;
    newFilePath?: string;
    relPath?: string;
    componentName?: string;
}

export function createPreset(
    projectRoot: string,
    kind: PresetKind,
    name: string,
    destinationDir?: string,
): CreatePresetResult {
    const generator = PRESET_SOURCES[kind];
    if (!generator) return { ok: false, error: `Unknown preset kind: ${kind}` };

    // Resolve destination directory (same rules as componentize)
    let dir: string;
    if (destinationDir) {
        const resolved = join(projectRoot, destinationDir);
        if (!resolved.startsWith(projectRoot + '/') && resolved !== projectRoot) {
            return { ok: false, error: `Destination outside project root: ${destinationDir}` };
        }
        dir = resolved;
    } else {
        const root = existsSync(join(projectRoot, 'src')) ? join(projectRoot, 'src') : projectRoot;
        dir = join(root, 'components', 'visual-edit');
    }

    // PascalCase + collision avoidance
    const baseName = name
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
    const componentName = /^[A-Z]/.test(baseName) ? baseName : `Visual${baseName || kind}`;

    let newFilePath = join(dir, `${componentName}.tsx`);
    let idx = 2;
    while (existsSync(newFilePath)) {
        newFilePath = join(dir, `${componentName}${idx}.tsx`);
        idx += 1;
    }

    const source = `import React from 'react';\n\n${generator(componentName)}`;

    try {
        mkdirSync(dirname(newFilePath), { recursive: true });
        writeFileSync(newFilePath, source, 'utf-8');
    } catch {
        return { ok: false, error: `Cannot write preset file: ${newFilePath}` };
    }

    return {
        ok: true,
        newFilePath,
        relPath: newFilePath.replace(projectRoot + '/', ''),
        componentName,
    };
}
