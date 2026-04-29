import { isObject } from './nodeSchema.js';

/**
 * 从边推断缺失节点，并去重边（相同 from+to+condition 只保留一条）
 */
export function ensureNodesMatchEdges(workflow, fileTypeKey = '') {
  if (!workflow || !isObject(workflow)) return;
  if (!Array.isArray(workflow.nodes)) workflow.nodes = [];
  if (!Array.isArray(workflow.edges)) workflow.edges = [];

  const existing = new Set(workflow.nodes.map((n) => n.id).filter(Boolean));
  const seenEdge = new Set();
  const deduped = [];

  for (const e of workflow.edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    const key = `${e.from}\0${e.to}\0${e.condition ?? ''}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    deduped.push({
      from: e.from,
      to: e.to,
      condition: e.condition ?? null,
    });
  }
  workflow.edges = deduped;

  const needIds = new Set();
  for (const e of workflow.edges) {
    needIds.add(e.from);
    needIds.add(e.to);
  }

  for (const id of needIds) {
    if (!id || existing.has(id)) continue;
    workflow.nodes.push(buildAutoNode(id, fileTypeKey));
    existing.add(id);
  }
}

function buildAutoNode(id, fileTypeKey) {
  return {
    id,
    title: defaultTitleForId(id, fileTypeKey),
    office: '待补充',
    role: '待补充',
    materials: [],
    note: '系统根据连线自动补全的节点，请在后续编辑中补充部门、职责与材料。',
    extendable_fields: { auto_created: true, source: 'edge_without_node' },
  };
}

const TITLE_HINTS = [
  [/^DTUA_Initial_Review$/i, '初筛 / 接收材料'],
  [/^DTUA_Use_UW_Template$/i, '使用校方模板'],
  [/^DTUA_Signature$/i, '签署'],
  [/^DTUA_Patient_Data_Signature$/i, '患者数据相关签署'],
  [/^DTUA_SoM_Dean_Office_Review$/i, '医学院院长办公室审阅'],
  [/^DTUA_Complete$/i, '完成归档'],
  [/^start$/i, '开始'],
  [/^determine_office$/i, '判定承办部门'],
  [/^osp_sage_or_comotion$/i, 'OSP/SAGE 或 CoMotion'],
  [/^comotion$/i, 'CoMotion'],
  [/^som_deans_office$/i, '医学院院长办公室'],
  [/^osp-1$/i, 'OSP / SAGE 处理'],
  [/^nda-3$/i, '后续处理'],
  [/^som-data-agreement-1$/i, '数据协议（医学院）'],
  [/^comotion-ip-nda-1$/i, '知识产权相关 NDA（CoMotion）'],
];

export function defaultTitleForId(id, _fileTypeKey) {
  for (const [re, title] of TITLE_HINTS) {
    if (re.test(id)) return title;
  }
  const cleaned = id.replace(/_/g, ' ').replace(/-/g, ' ').trim();
  if (cleaned.length <= 32) return cleaned;
  return cleaned.slice(0, 29) + '…';
}

/**
 * 老数据补 title；保证 extendable_fields 为对象
 */
export function ensureNodeShape(node) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.extendable_fields !== 'object' || !node.extendable_fields) {
    node.extendable_fields = {};
  }
  if (typeof node.title !== 'string' || !node.title.trim()) {
    node.title = defaultTitleForId(String(node.id || ''), '');
  }
  if (!Array.isArray(node.materials)) node.materials = [];
  if (typeof node.office !== 'string') node.office = '待补充';
  if (typeof node.role !== 'string') node.role = '待补充';
  if (typeof node.note !== 'string') node.note = '';
}

export function ensureAllNodeShapes(workflow) {
  for (const n of workflow?.nodes || []) {
    ensureNodeShape(n);
  }
}
