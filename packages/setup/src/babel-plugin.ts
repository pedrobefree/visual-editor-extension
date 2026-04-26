/**
 * Babel plugin that injects data-oid into JSX elements.
 * For Next.js projects (add to .babelrc or babel.config.js):
 *
 *   { "plugins": ["@visual-edit/setup/babel"] }
 *
 * NOTE: Using this plugin in Next.js disables SWC compilation.
 * For Next.js prefer the Turbopack/webpack loader approach when available.
 */

const DATA_OID_ATTR = 'data-oid';
const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LEN = 7;

function randomOid(): string {
    let id = '';
    for (let i = 0; i < ID_LEN; i++) {
        id += VALID_CHARS[Math.floor(Math.random() * VALID_CHARS.length)];
    }
    return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function visualEditBabelPlugin(): any {
    return {
        name: 'visual-edit-inject-oids',
        visitor: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            JSXOpeningElement(path: any) {
                const { node } = path;

                // Skip React.Fragment / Fragment
                const name = node.name;
                const isFragment =
                    (name.type === 'JSXIdentifier' && name.name === 'Fragment') ||
                    (name.type === 'JSXMemberExpression' &&
                        name.object?.name === 'React' &&
                        name.property?.name === 'Fragment');
                if (isFragment) return;

                // Skip if already has data-oid
                const hasOid = node.attributes.some(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (attr: any) => attr.type === 'JSXAttribute' && attr.name?.name === DATA_OID_ATTR,
                );
                if (hasOid) return;

                // Inject new OID
                const t = path.hub.file.opts.parserOpts?.plugins
                    ? require('@babel/types')
                    : (path as any).scope.hub.file.opts.babelrc !== undefined
                      ? require('@babel/types')
                      : { jSXAttribute: null };

                // Use @babel/types if available, otherwise inline construction
                try {
                    const babel_t = require('@babel/types');
                    node.attributes.push(
                        babel_t.jSXAttribute(
                            babel_t.jSXIdentifier(DATA_OID_ATTR),
                            babel_t.stringLiteral(randomOid()),
                        ),
                    );
                } catch {
                    // Fallback: direct AST construction (no @babel/types dep)
                    node.attributes.push({
                        type: 'JSXAttribute',
                        name: { type: 'JSXIdentifier', name: DATA_OID_ATTR },
                        value: { type: 'StringLiteral', value: randomOid() },
                    });
                }
            },
        },
    };
}
