export function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 标准节点：稳定 id + 人读标题 + 承办方 + 材料 + 说明
 * title：画布主标题（如「签署」「律所审阅」）
 * office：部门 / Office
 * role：岗位或子职责
 * materials：须准备的材料列表
 * note：简要说明或操作要点
 */
export function isValidNode(node) {
  return (
    isObject(node) &&
    typeof node.id === 'string' &&
    node.id.trim() &&
    typeof node.title === 'string' &&
    node.title.trim() &&
    typeof node.office === 'string' &&
    typeof node.role === 'string' &&
    Array.isArray(node.materials) &&
    typeof node.note === 'string' &&
    isObject(node.extendable_fields)
  );
}
