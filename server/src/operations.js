import { isValidNode, isObject } from './nodeSchema.js';
import { ensureNodeShape, ensureAllNodeShapes, ensureNodesMatchEdges } from './workflowIntegrity.js';
import { normalizeAllWorkflows } from './workflowNormalize.js';

function ensureWorkflow(workflows, fileType) {
  if (!workflows[fileType]) {
    workflows[fileType] = { nodes: [], edges: [] };
  }
}

function upsertHighlight(highlightMap, fileType, nodeId) {
  if (!highlightMap[fileType]) highlightMap[fileType] = [];
  if (!highlightMap[fileType].includes(nodeId)) highlightMap[fileType].push(nodeId);
}

function validateOperation(operation) {
  const { type, payload } = operation || {};
  if (!type || !isObject(payload)) return false;

  if (type === 'ADD_WORKFLOW') {
    return typeof payload.type === 'string' && isObject(payload.workflow);
  }

  if (typeof payload.fileType !== 'string') return false;

  if (type === 'INSERT_NODE') {
    const n = { ...payload.node };
    ensureNodeShape(n);
    return isValidNode(n);
  }
  if (type === 'DELETE_NODE') return typeof payload.id === 'string';
  if (type === 'UPDATE_NODE') return typeof payload.id === 'string' && isObject(payload.fields);
  if (type === 'ADD_BRANCH' || type === 'REMOVE_BRANCH') {
    return typeof payload.from === 'string' && typeof payload.to === 'string';
  }

  return false;
}

export function applyOperation(workflows, operation, highlightMap) {
  if (!validateOperation(operation)) return false;

  const { type, payload } = operation;

  if (type === 'ADD_WORKFLOW') {
    const workflowType = payload.type;
    workflows[workflowType] = {
      nodes: payload.workflow?.nodes || [],
      edges: payload.workflow?.edges || [],
    };
    normalizeAllWorkflows({ [workflowType]: workflows[workflowType] });
    (workflows[workflowType].nodes || []).forEach((n) => upsertHighlight(highlightMap, workflowType, n.id));
    return true;
  }

  const workflowType = payload.fileType;
  ensureWorkflow(workflows, workflowType);
  const workflow = workflows[workflowType];

  if (type === 'INSERT_NODE') {
    const n = { ...payload.node };
    ensureNodeShape(n);
    if (!isValidNode(n)) return false;
    workflow.nodes.push(n);
    upsertHighlight(highlightMap, workflowType, n.id);
    ensureNodesMatchEdges(workflow, workflowType);
    return true;
  }

  if (type === 'DELETE_NODE') {
    workflow.nodes = workflow.nodes.filter((n) => n.id !== payload.id);
    workflow.edges = workflow.edges.filter((e) => e.from !== payload.id && e.to !== payload.id);
    return true;
  }

  if (type === 'UPDATE_NODE') {
    const idx = workflow.nodes.findIndex((n) => n.id === payload.id);
    if (idx !== -1) {
      workflow.nodes[idx] = { ...workflow.nodes[idx], ...payload.fields };
      ensureNodeShape(workflow.nodes[idx]);
      upsertHighlight(highlightMap, workflowType, payload.id);
    }
    return true;
  }

  if (type === 'ADD_BRANCH') {
    workflow.edges.push({
      from: payload.from,
      to: payload.to,
      condition: payload.condition ?? null,
    });
    ensureNodesMatchEdges(workflow, workflowType);
    return true;
  }

  if (type === 'REMOVE_BRANCH') {
    workflow.edges = workflow.edges.filter(
      (e) => !(e.from === payload.from && e.to === payload.to && (e.condition ?? null) === (payload.condition ?? null)),
    );
    return true;
  }

  return false;
}

export function applyOperations(workflows, operations) {
  const cloned = JSON.parse(JSON.stringify(workflows));
  const highlights = {};
  const skippedOperations = [];

  for (const op of operations) {
    const applied = applyOperation(cloned, op, highlights);
    if (!applied) skippedOperations.push(op);
  }

  normalizeAllWorkflows(cloned);

  return { workflows: cloned, highlights, skippedOperations };
}
