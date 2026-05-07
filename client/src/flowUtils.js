import { MarkerType } from 'reactflow';

const DEFAULT_EDGE = {
  type: 'wrapped',
  markerEnd: { type: MarkerType.ArrowClosed },
  reconnectable: true,
  deletable: true,
  style: { strokeWidth: 1.5 },
  labelStyle: { fill: '#0f172a', fontSize: 12 },
};

/** 画布上显示的标题：中文用 title；英文优先 title_en，否则回退 title */
export function nodeDisplayTitle(n, locale = 'zh') {
  const id = n?.id || '';
  if (locale === 'en') {
    const en = typeof n.title_en === 'string' ? n.title_en.trim() : '';
    if (en) return en;
  }
  const primary = typeof n.title === 'string' ? n.title.trim() : '';
  return primary || id;
}

export function nodeLabel(n, locale = 'zh') {
  const title = nodeDisplayTitle(n, locale);
  const mats = Array.isArray(n.materials) && n.materials.length ? n.materials.join(locale === 'zh' ? '、' : ', ') : locale === 'zh' ? '（材料待列）' : '(materials pending)';
  const materialsLabel = locale === 'zh' ? '材料' : 'Materials';
  return `${title}\n${n.office || '—'} · ${n.role || '—'}\n${materialsLabel}: ${mats}`;
}

/** 连线显示文案：英文优先 condition_en，否则回退 condition */
export function edgeDisplayCondition(edgeLike, locale = 'zh') {
  const zh = typeof edgeLike?.condition === 'string' ? edgeLike.condition.trim() : '';
  const en = typeof edgeLike?.condition_en === 'string' ? edgeLike.condition_en.trim() : '';
  const raw = locale === 'en' ? en || zh || '' : zh || en || '';
  return wrapEdgeLabel(raw);
}

function wrapEdgeLabel(text) {
  if (!text) return '';
  const hasWhitespace = /\s/.test(text);
  const maxLen = hasWhitespace ? 24 : 14;
  if (text.length <= maxLen) return text;
  if (!hasWhitespace) {
    const lines = [];
    for (let i = 0; i < text.length; i += maxLen) lines.push(text.slice(i, i + maxLen));
    return lines.join('\n');
  }
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLen) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function normalizeNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/** 与节点填充/描边色一致，供连接点样式用 */
export function getWorkflowNodeClassName(domainNode, highlightIds = []) {
  if (!domainNode?.id) return 'wf-node wf-node--std';
  const isAuto = Boolean(domainNode.extendable_fields?.auto_created);
  const h = highlightIds.includes(domainNode.id);
  if (isAuto) return 'wf-node wf-node--auto';
  if (h) return 'wf-node wf-node--hl';
  return 'wf-node wf-node--std';
}

/**
 * 业务节点 → React Flow
 */
export function workflowToFlowElements(workflow, highlights = [], locale = 'zh') {
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
        note: locale === 'zh' ? '请补全节点信息' : 'Please complete node details',
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
        note: locale === 'zh' ? '请补全节点信息' : 'Please complete node details',
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
      data: { label: nodeLabel(n, locale), domain: n },
      className: getWorkflowNodeClassName(n, highlights),
      deletable: true,
      selectable: true,
      draggable: true,
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
    const cond = edgeDisplayCondition(e, locale);
    return {
      id: `e-${e.from}-${e.to}-${e.condition ?? ''}-${idx}`,
      source: e.from,
      target: e.to,
      sourceHandle: 's',
      targetHandle: 't',
      label: cond,
      data: {
        condition: normalizeNullableText(e.condition),
        condition_en: normalizeNullableText(e.condition_en),
      },
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
    if (domain.title_en != null && typeof domain.title_en !== 'string') domain.title_en = '';
    prevById.set(domain.id, domain);
  }
  const usedIds = new Set(rfNodes.map((n) => n.id));
  const nodes = [...usedIds].map((id) => prevById.get(id));
  const edges = rfEdges.map((e) => {
    const cond = normalizeNullableText(e.data?.condition);
    const condEn = normalizeNullableText(e.data?.condition_en);
    if (e.data?.condition !== undefined || e.data?.condition_en !== undefined) {
      return { from: e.source, to: e.target, condition: cond, condition_en: condEn };
    }
    const fromLabel = typeof e.label === 'string' ? e.label.trim() : '';
    return { from: e.source, to: e.target, condition: fromLabel || null, condition_en: null };
  });
  return { nodes, edges };
}

export { DEFAULT_EDGE };
