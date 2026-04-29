import { ensureAllNodeShapes, ensureNodesMatchEdges } from './workflowIntegrity.js';

/**
 * 遍历全部工作流：补全节点形状、边-节点一致、去重边
 */
export function normalizeAllWorkflows(workflows) {
  if (!workflows || typeof workflows !== 'object') return;
  for (const fileType of Object.keys(workflows)) {
    const w = workflows[fileType];
    if (!w || typeof w !== 'object') continue;
    ensureAllNodeShapes(w);
    ensureNodesMatchEdges(w, fileType);
    ensureAllNodeShapes(w);
  }
}
