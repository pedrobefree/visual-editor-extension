export { DATA_OID_ATTR } from './constants';
export { addOidsToAst, getAllExistingOids, deterministicOid } from './ids';
export { getAstFromContent, getContentFromAst, findNodeByOid, findNodeByPosition } from './parse';
export { updateNodeTextContent, setNodeTextToIdentifier } from './code-edit/text';
export { addClassToNode, replaceNodeClasses, enableSlotClassOverride } from './code-edit/style';
export {
    createJsxElement,
    findNodePathByPosition,
    insertElementAtPath,
    moveElementByOffset,
    moveElementAtPath,
    moveElementRelativeToSibling,
    removeElementAtPath,
    type InsertElementSpec,
    type InsertPlacement,
} from './code-edit/structure';
export {
    getSinglePropIdentifier,
    getExportedComponentNames,
    findPropUsages,
    updatePropValues,
    updatePropValueAtIndex,
    updateComponentUsageClassNameAtIndex,
    updateComponentUsageStringPropAtIndex,
    getAttrIdentifier,
    updateNodeAttrValue,
} from './code-edit/prop-edit';
export { customTwMerge } from './tw-merge';
export { createOid } from './oid';
export { t, traverse } from './packages';
export type { NodePath, T } from './packages';
