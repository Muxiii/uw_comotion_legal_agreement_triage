import { MarkerType } from 'reactflow';

const DEFAULT_EDGE = {
  type: 'default',
  markerEnd: { type: MarkerType.ArrowClosed },
  reconnectable: true,
  style: { strokeWidth: 1.5 },
  labelStyle: { fill: '#0f172a', fontSize: 12 },
};

export function nodeLabel(n) {
  const title = n.title || n.id;
  const mats = Array.isArray(n.materials) && n.materials.length ? n.materials.join('、') : '（材料待列）';
  return `${title}\n${n.office || '—'} · ${n.role || '—'}\n材料：${mats}\n${n.note || ''}`.trim();
}

/**
 * 业务节点 → React Flow
 */
export function workflowToFlowElements(workflow, highlights = []) {
  const byId = new Map();
  (workflow?.nodes || []).forEach((n) => {
    if (n?.id) byId.set(n.id, n);
  });
  (workflow?.edges || []).forEach((e) => {
    if (e?.from && !byId.has(e.from)) {
      byId.set(e.from, {
        id: e.from,
        title: e.from,
        office: '—',
        role: '—',
        materials: [],
        note: '请补全节点信息',
        extendable_fields: { auto_created: true },
      });
    }
    if (e?.to && !byId.has(e.to)) {
      byId.set(e.to, {
        id: e.to,
        title: e.to,
        office: '—',
        role: '—',
        materials: [],
        note: '请补全节点信息',
        extendable_fields: { auto_created: true },
      });
    }
  });
  const orderedIds = Array.from(byId.keys());
  const nodes = orderedIds.map((id, index) => {
    const n = byId.get(id);
    const pos = n.extendable_fields?.ui?.position;
    const position = pos && typeof pos.x === 'number' && typeof pos.y === 'number' ? pos : { x: 120 + (index % 4) * 260, y: 80 + Math.floor(index / 4) * 180 };
    const isAuto = Boolean(n.extendable_fields?.auto_created);
    return {
      id: n.id,
      type: 'workflowNode',
      position,
      data: { label: nodeLabel(n), domain: n },
      style: {
        width: 240,
        borderRadius: 8,
        border: isAuto
          ? '1px dashed #94a3b8'
          : highlights.includes(n.id)
            ? '2px solid #eab308'
            : '1px solid #64748b',
        background: isAuto ? '#f1f5f9' : highlights.includes(n.id) ? '#fef9c3' : '#f8fafc',
        padding: 0,
        fontSize: 12,
      },
    };
  });
  const edges = (workflow?.edges || []).map((e, idx) => {
    const cond = e.condition ?? '';
    return {
      id: `e-${e.from}-${e.to}-${cond}-${idx}`,
      source: e.from,
      target: e.to,
      sourceHandle: 's',
      targetHandle: 't',
      label: cond,
      data: { condition: e.condition },
      ...DEFAULT_EDGE,
    };
  });
  return { nodes, edges };
}

/**
 * 合并：画布 + 上一个业务快照 → 可保存的 workflow
 */
export function flowElementsToWorkflow(rfNodes, rfEdges, previousWorkflow) {
  const prevById = new Map((previousWorkflow?.nodes || []).map((n) => [n.id, { ...n }]));
  for (const rn of rfNodes) {
    const domain = rn.data?.domain
      ? { ...rn.data.domain }
      : {
          id: rn.id,
          title: rn.id,
          office: '待补充',
          role: '待补充',
          materials: [],
          note: '',
          extendable_fields: {},
        };
    domain.id = rn.id;
    if (!domain.extendable_fields || typeof domain.extendable_fields !== 'object') {
      domain.extendable_fields = {};
    }
    domain.extendable_fields.ui = {
      ...(domain.extendable_fields.ui || {}),
      position: { x: rn.position.x, y: rn.position.y },
    };
    if (!prevById.has(domain.id) && !domain.title?.trim()) {
      domain.title = domain.id;
    }
    if (!Array.isArray(domain.materials)) domain.materials = [];
    if (typeof domain.office !== 'string') domain.office = '待补充';
    if (typeof domain.role !== 'string') domain.role = '待补充';
    if (typeof domain.note !== 'string') domain.note = '';
    if (typeof domain.title !== 'string') domain.title = domain.id;
    prevById.set(domain.id, domain);
  }
  const usedIds = new Set(rfNodes.map((n) => n.id));
  const nodes = [...usedIds].map((id) => prevById.get(id));
  const edges = rfEdges.map((e) => {
    const cond = e.data?.condition;
    if (cond !== undefined && cond !== null) {
      return { from: e.source, to: e.target, condition: String(cond).trim() || null };
    }
    const fromLabel = typeof e.label === 'string' ? e.label.trim() : '';
    return { from: e.source, to: e.target, condition: fromLabel || null };
  });
  return { nodes, edges };
}

export { DEFAULT_EDGE };
