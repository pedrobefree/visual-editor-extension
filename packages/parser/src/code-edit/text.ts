import { t, type T } from '../packages';

export function updateNodeTextContent(node: T.JSXElement, textContent: string): void {
    const parts = textContent.split('\n');

    if (parts.length === 1) {
        // Find the first JSXText child that has actual (non-whitespace) content.
        // Whitespace-only JSXText nodes (newlines + indentation between JSX tags)
        // must be skipped; overwriting them would inject text as a sibling of
        // existing child elements and produce concatenated output like
        // "SurnameEmail".
        const textNode = node.children.find(
            (child) => t.isJSXText(child) && child.value.trim() !== '',
        );

        if (textNode && t.isJSXText(textNode)) {
            // In-place update: touch only the text node, leave everything else.
            textNode.value = textContent;
            // Also sync extra.raw so @babel/generator doesn't fall back to the
            // stale raw string that was captured at parse time.
            if (textNode.extra) {
                (textNode.extra as Record<string, unknown>).raw = textContent;
            }
            return;
        }

        // No real JSXText child found — the content may be a JSXExpressionContainer
        // like {label} or {t('key')}.  Replacing only whitespace nodes while
        // leaving the expression intact would duplicate text (new static string
        // + resolved expression = "First nameFirst name").
        // Instead, replace the entire children list with just the new static
        // text node; the user is intentionally converting a dynamic value to a
        // static one.
        node.children = [t.jsxText(textContent)];
        return;
    }

    // Multi-line text: replace all children with alternating text / <br /> nodes.
    node.children = [];
    parts.forEach((part, index) => {
        if (part) node.children.push(t.jsxText(part));
        if (index < parts.length - 1) {
            node.children.push(
                t.jsxElement(
                    t.jsxOpeningElement(t.jsxIdentifier('br'), [], true),
                    null,
                    [],
                    true,
                ),
            );
        }
    });
}
