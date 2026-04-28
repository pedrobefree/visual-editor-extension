export { DATA_OID_ATTR } from './constants';
export { addOidsToAst, getAllExistingOids, deterministicOid } from './ids';
export { getAstFromContent, getContentFromAst, findNodeByOid, findNodeByPosition } from './parse';
export { updateNodeTextContent, setNodeTextToIdentifier, enableTextPropOverride } from './code-edit/text';
export { addClassToNode, replaceNodeClasses, enableSlotClassOverride } from './code-edit/style';
export {
    createJsxElement,
    duplicateElementAtPath,
    extractElementToComponentAtPath,
    findNodePathByPosition,
    insertElementAtPath,
    moveElementByOffset,
    moveElementAtPath,
    moveElementRelativeToSibling,
    moveElementToParentPath,
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
    updateComponentUsageChildrenAtIndex,
    duplicateComponentUsageAtIndex,
    removeComponentUsageAtIndex,
    removeComponentUsageByText,
    getAttrIdentifier,
    updateNodeAttrValue,
} from './code-edit/prop-edit';
export { customTwMerge } from './tw-merge';
export { createOid } from './oid';
export { t, traverse } from './packages';
export type { NodePath, T } from './packages';
