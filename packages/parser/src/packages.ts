import { parse as babelParse } from '@babel/parser';
import _generate from '@babel/generator';
import _traverse, { type NodePath } from '@babel/traverse';
import * as T from '@babel/types';

const generate = (
    (_generate as unknown as { default?: typeof _generate }).default ?? _generate
) as typeof _generate;
const traverse = (
    (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse
) as typeof _traverse;

export { babelParse as parse, generate, traverse, T };
export const t = T;
export type { NodePath };
