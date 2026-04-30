import { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  reconnectEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import WorkflowNode from './WorkflowNode';
import {
  workflowToFlowElements,
  flowElementsToWorkflow,
  DEFAULT_EDGE,
  nodeLabel,
  getWorkflowNodeClassName,
} from './flowUtils.js';

const API_BASE = 'http://localhost:4000/api';
const nodeTypes = { workflowNode: WorkflowNode };
const MAX_HISTORY = 10;

function cloneGraphSnapshot(nodes, edges) {
  return {
    nodes: JSON.parse(JSON.stringify(nodes || [])),
    edges: JSON.parse(JSON.stringify(edges || [])),
  };
}

function autoArrangeNodes(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const adj = new Map(ids.map((id) => [id, []]));

  for (const e of edges || []) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
    adj.get(e.source).push(e.target);
  }

  const queue = ids.filter((id) => (indegree.get(id) || 0) === 0);
  const level = new Map(queue.map((id) => [id, 0]));
  const visited = new Set();

  while (queue.length) {
    const u = queue.shift();
    visited.add(u);
    const base = level.get(u) || 0;
    for (const v of adj.get(u) || []) {
      const nextLv = base + 1;
      if (!level.has(v) || nextLv > level.get(v)) level.set(v, nextLv);
      indegree.set(v, (indegree.get(v) || 0) - 1);
      if ((indegree.get(v) || 0) === 0) queue.push(v);
    }
  }

  let maxLevel = Math.max(0, ...Array.from(level.values()));
  for (const id of ids) {
    if (!visited.has(id)) {
      maxLevel += 1;
      level.set(id, maxLevel);
    }
  }

  const levelBuckets = new Map();
  for (const n of nodes) {
    const lv = level.get(n.id) || 0;
    if (!levelBuckets.has(lv)) levelBuckets.set(lv, []);
    levelBuckets.get(lv).push(n);
  }

  for (const arr of levelBuckets.values()) {
    arr.sort((a, b) => (a.position?.x || 0) - (b.position?.x || 0));
  }

  const xGap = 300;
  const yGap = 180;
  const startX = 120;
  const startY = 70;
  const byIdPos = new Map();

  for (const [lv, arr] of [...levelBuckets.entries()].sort((a, b) => a[0] - b[0])) {
    arr.forEach((n, idx) => {
      byIdPos.set(n.id, { x: startX + idx * xGap, y: startY + lv * yGap });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: byIdPos.get(n.id) || n.position,
  }));
}

function applyHighlightToNodes(rfNodes, activeType, sessionHighlights) {
  const hl = sessionHighlights[activeType] || [];
  return rfNodes.map((n) => {
    const d = n.data?.domain;
    const isAuto = Boolean(d?.extendable_fields?.auto_created);
    const h = d?.id && hl.includes(d.id);
    return {
      ...n,
      className: d ? getWorkflowNodeClassName(d, hl) : n.className,
      style: {
        ...n.style,
        width: 240,
        borderRadius: 8,
        border: isAuto
          ? '1px dashed #94a3b8'
          : h
            ? '2px solid #eab308'
            : '1px solid #64748b',
        background: isAuto ? '#f1f5f9' : h ? '#fef9c3' : '#f8fafc',
        padding: 0,
        fontSize: 12,
      },
    };
  });
}

export default function App() {
  const [workflows, setWorkflows] = useState({});
  const [sessionHighlights, setSessionHighlights] = useState({});
  const [operations, setOperations] = useState([]);
  const [activeType, setActiveType] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [files, setFiles] = useState([]);
  const [newTypesDetected, setNewTypesDetected] = useState([]);
  const [confirmedNewTypes, setConfirmedNewTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [undoDepth, setUndoDepth] = useState(0);

  const [editNode, setEditNode] = useState(null);
  const workflowSigRef = useRef('');
  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const historyRef = useRef({});
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const [form, setForm] = useState({ title: '', office: '', role: '', note: '', materials: '' });

  const syncUndoDepth = useCallback(
    (type) => {
      const t = type || activeType;
      setUndoDepth((historyRef.current[t] || []).length);
    },
    [activeType],
  );

  const pushHistorySnapshot = useCallback(
    (type, snapshot) => {
      const t = type || activeType;
      if (!t) return;
      const arr = historyRef.current[t] || [];
      arr.push(snapshot);
      if (arr.length > MAX_HISTORY) arr.shift();
      historyRef.current[t] = arr;
      if (t === activeType) setUndoDepth(arr.length);
    },
    [activeType],
  );

  const rememberCurrentGraph = useCallback(() => {
    if (!activeType) return;
    pushHistorySnapshot(activeType, cloneGraphSnapshot(nodesRef.current, edgesRef.current));
  }, [activeType, pushHistorySnapshot]);

  const refreshCanvasFromWorkflow = useCallback(
    (wf) => {
      if (!wf) {
        setNodes([]);
        setEdges([]);
        syncUndoDepth(activeType);
        return;
      }
      const h = sessionHighlights[activeType] || [];
      const { nodes: n, edges: e } = workflowToFlowElements(wf, h);
      setNodes(applyHighlightToNodes(n, activeType, sessionHighlights));
      setEdges(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在外部工作流或 Tab 变化时由调用方显式使用
    [activeType, sessionHighlights, setNodes, setEdges],
  );

  const putWorkflow = useCallback(
    async (ns, es) => {
      if (!activeType) return;
      setSaving(true);
      setError('');
      try {
        const w = flowElementsToWorkflow(ns, es, workflowsRef.current[activeType]);
        const res = await fetch(`${API_BASE}/workflow/${encodeURIComponent(activeType)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes: w.nodes, edges: w.edges }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        setWorkflows(data.workflows || {});
        workflowSigRef.current = JSON.stringify(data.workflow || {});
      } catch (e) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    },
    [activeType],
  );

  const saveCurrentWorkflow = useCallback(() => putWorkflow(nodesRef.current, edgesRef.current), [putWorkflow]);

  useEffect(() => {
    fetch(`${API_BASE}/workflows`)
      .then((r) => r.json())
      .then((data) => {
        setWorkflows(data.workflows || {});
        historyRef.current = {};
        setUndoDepth(0);
        const keys = Object.keys(data.workflows || {});
        if (keys.length) setActiveType((t) => t || keys[0]);
        if (data.latestSession) {
          setSessionHighlights(data.latestSession.highlights || {});
          setOperations(data.latestSession.operations || []);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // 外部工作流或 Tab 切换：与内存画布同步（不含仅 highlights 的刷新）
  useEffect(() => {
    if (!activeType) return;
    const wf = workflows[activeType];
    if (!wf) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const sig = JSON.stringify({ n: wf.nodes, e: wf.edges });
    if (workflowSigRef.current === sig) return;
    refreshCanvasFromWorkflow(wf);
    workflowSigRef.current = sig;
    syncUndoDepth(activeType);
  }, [activeType, workflows, refreshCanvasFromWorkflow]);

  // 仅高亮（AI 会话）变化时更新样式，不重置位置
  useEffect(() => {
    setNodes((prev) => applyHighlightToNodes(prev, activeType, sessionHighlights));
  }, [sessionHighlights, activeType, setNodes]);

  const addManualNode = useCallback(() => {
    if (!activeType) return;
    rememberCurrentGraph();
    const id = `new-${Date.now()}`;
    const domain = {
      id,
      title: '新节点',
      office: '待补充',
      role: '待补充',
      materials: [],
      note: '',
      extendable_fields: {},
    };
    const merged = {
      nodes: [...(workflowsRef.current[activeType]?.nodes || []), domain],
      edges: [...(workflowsRef.current[activeType]?.edges || [])],
    };
    const { nodes: n, edges: e } = workflowToFlowElements(merged, sessionHighlights[activeType] || []);
    const arranged = autoArrangeNodes(n, e);
    const n2 = applyHighlightToNodes(arranged, activeType, sessionHighlights);
    setNodes(n2);
    setEdges(e);
    setEditNode({ ...domain });
    setForm({ title: '新节点', office: '待补充', role: '待补充', note: '', materials: '' });
    setTimeout(() => putWorkflow(n2, e), 0);
  }, [activeType, sessionHighlights, putWorkflow, rememberCurrentGraph]);

  const onConnect = useCallback(
    (params) => {
      rememberCurrentGraph();
      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            ...DEFAULT_EDGE,
            sourceHandle: 's',
            targetHandle: 't',
            data: { condition: null },
            label: '',
            id: `e-${params.source}-${params.target}-${Date.now()}`,
          },
          eds,
        );
        setTimeout(() => putWorkflow(nodesRef.current, next), 0);
        return next;
      });
    },
    [setEdges, putWorkflow, rememberCurrentGraph],
  );

  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      rememberCurrentGraph();
      setEdges((eds) => {
        const next = reconnectEdge(oldEdge, newConnection, eds, { shouldReplaceId: true });
        setTimeout(() => putWorkflow(nodesRef.current, next), 0);
        return next;
      });
    },
    [setEdges, putWorkflow, rememberCurrentGraph],
  );

  const onNodeDragStop = useCallback(
    (_e, node) => {
      setTimeout(() => {
        const nextNodes = nodesRef.current.map((n) =>
          n.id === node.id ? { ...n, position: { x: node.position.x, y: node.position.y } } : n,
        );
        putWorkflow(nextNodes, edgesRef.current);
      }, 0);
    },
    [putWorkflow],
  );

  const onNodesDelete = useCallback(() => {
    setEditNode(null);
    setTimeout(() => putWorkflow(nodesRef.current, edgesRef.current), 0);
  }, [putWorkflow]);

  const onEdgesDelete = useCallback(() => {
    setTimeout(() => putWorkflow(nodesRef.current, edgesRef.current), 0);
  }, [putWorkflow]);

  const onNodesChangeWithHistory = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) rememberCurrentGraph();
      onNodesChange(changes);
    },
    [onNodesChange, rememberCurrentGraph],
  );

  const onEdgesChangeWithHistory = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) rememberCurrentGraph();
      onEdgesChange(changes);
    },
    [onEdgesChange, rememberCurrentGraph],
  );

  const onNodeDoubleClick = useCallback(
    (_evt, n) => {
      const d = n.data?.domain;
      if (!d) return;
      setEditNode(d);
      setForm({
        title: d.title || '',
        office: d.office || '',
        role: d.role || '',
        note: d.note || '',
        materials: (d.materials || []).join('\n'),
      });
    },
    [setForm],
  );

  const onEdgeDoubleClick = useCallback(
    (_evt, edge) => {
      const current = edge.data?.condition != null && edge.data?.condition !== '' ? String(edge.data.condition) : (edge.label && String(edge.label)) || '';
      const value = window.prompt('分支条件（可留空表示非条件边）', current);
      if (value === null) return;
      rememberCurrentGraph();
      const v = value.trim() || null;
      setEdges((eds) => {
        const next = eds.map((e) => (e.id === edge.id ? { ...e, data: { ...e.data, condition: v }, label: v || '' } : e));
        setTimeout(() => putWorkflow(nodesRef.current, next), 0);
        return next;
      });
    },
    [setEdges, putWorkflow, rememberCurrentGraph],
  );

  const applyNodeForm = useCallback(() => {
    if (!editNode) return;
    rememberCurrentGraph();
    const targetId = editNode.id;
    const mats = form.materials
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setNodes((prev) => {
      const next = prev.map((rn) => {
        if (rn.id !== targetId) return rn;
        const d = { ...rn.data.domain };
        d.title = form.title.trim() || d.id;
        d.office = form.office.trim() || '待补充';
        d.role = form.role.trim() || '待补充';
        d.note = form.note.trim() || '';
        d.materials = mats;
        if (d.extendable_fields?.auto_created) {
          d.extendable_fields = { ...d.extendable_fields };
          delete d.extendable_fields.auto_created;
        }
        return {
          ...rn,
          data: { ...rn.data, domain: d, label: nodeLabel(d) },
        };
      });
      setTimeout(() => putWorkflow(next, edgesRef.current), 0);
      return next;
    });
    setEditNode(null);
  }, [editNode, form, putWorkflow, rememberCurrentGraph]);

  const autoArrangeCurrentGraph = useCallback(() => {
    if (!activeType || nodesRef.current.length === 0) return;
    rememberCurrentGraph();
    const arranged = autoArrangeNodes(nodesRef.current, edgesRef.current);
    const highlighted = applyHighlightToNodes(arranged, activeType, sessionHighlights);
    setNodes(highlighted);
    setTimeout(() => putWorkflow(highlighted, edgesRef.current), 0);
  }, [activeType, sessionHighlights, putWorkflow, rememberCurrentGraph, setNodes]);

  const undoCanvasEdit = useCallback(() => {
    const arr = historyRef.current[activeType] || [];
    if (!arr.length) return;
    const prev = arr.pop();
    historyRef.current[activeType] = arr;
    setUndoDepth(arr.length);
    setEditNode(null);
    const highlighted = applyHighlightToNodes(prev.nodes, activeType, sessionHighlights);
    setNodes(highlighted);
    setEdges(prev.edges);
    setTimeout(() => putWorkflow(highlighted, prev.edges), 0);
  }, [activeType, putWorkflow, sessionHighlights, setNodes, setEdges]);

  async function submitAnalyze(skipConfirmation = false) {
    setError('');
    if (skipConfirmation && confirmedNewTypes.length === 0) {
      setError('请至少勾选一个要新增的文件类型，再进行第二步。');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('confirmedNewTypes', JSON.stringify(skipConfirmation ? confirmedNewTypes : []));

      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analyze failed');

      setNewTypesDetected(data.newTypesDetected || []);

      if (data.requiresTypeConfirmation) {
        setLoading(false);
        return;
      }

      setWorkflows(data.workflows || {});
      historyRef.current = {};
      setUndoDepth(0);
      setOperations(data.operations || []);
      setSessionHighlights(data.highlights || {});
      setNewTypesDetected([]);
      setConfirmedNewTypes([]);
      setFiles([]);
      workflowSigRef.current = '';
      const keys = Object.keys(data.workflows || {});
      if (keys.length && !keys.includes(activeType)) setActiveType(keys[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function undoOperation(operationId) {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/undo-operation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Undo failed');

      setWorkflows(data.workflows || {});
      historyRef.current = {};
      setUndoDepth(0);
      setOperations(data.operations || []);
      setSessionHighlights(data.highlights || {});
      workflowSigRef.current = '';
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        <button disabled={loading || files.length === 0} onClick={() => submitAnalyze(false)}>
          {loading ? 'Analyzing...' : '上传并分析'}
        </button>
        <button type="button" onClick={addManualNode} disabled={!activeType} title="在画布上添加新节点">
          添加节点
        </button>
        <button type="button" onClick={autoArrangeCurrentGraph} disabled={!activeType || nodes.length === 0}>
          自动整理节点
        </button>
        <button type="button" onClick={undoCanvasEdit} disabled={!activeType || undoDepth === 0}>
          撤销（{undoDepth}）
        </button>
        <button type="button" onClick={saveCurrentWorkflow} disabled={!activeType || saving}>
          {saving ? '保存中…' : '保存当前流程'}
        </button>
      </div>

      {newTypesDetected.length > 0 && (
        <div className="confirm-box">
          <strong>发现新文件类型：</strong>
          {newTypesDetected.map((t) => (
            <label key={t}>
              <input
                type="checkbox"
                checked={confirmedNewTypes.includes(t)}
                onChange={(e) => {
                  setConfirmedNewTypes((prev) =>
                    e.target.checked ? [...prev, t] : prev.filter((item) => item !== t),
                  );
                }}
              />
              {t}
            </label>
          ))}
          <button disabled={loading} onClick={() => submitAnalyze(true)}>
            确认并继续第二步
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="content">
        <div className="main">
          <div className="tabs">
            {Object.keys(workflows).map((type) => (
              <button
                key={type}
                className={activeType === type ? 'active' : ''}
                onClick={() => {
                  setActiveType(type);
                  setEditNode(null);
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flow-wrap">
            {activeType && (
              <ReactFlow
                key={activeType}
                nodeTypes={nodeTypes}
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChangeWithHistory}
                onEdgesChange={onEdgesChangeWithHistory}
                onConnect={onConnect}
                onReconnect={onReconnect}
                onNodeDragStop={onNodeDragStop}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onNodeDoubleClick={onNodeDoubleClick}
                onEdgeDoubleClick={onEdgeDoubleClick}
                onPaneClick={() => setEditNode(null)}
                defaultEdgeOptions={{
                  type: 'default',
                  reconnectable: true,
                  deletable: true,
                  markerEnd: DEFAULT_EDGE.markerEnd,
                  style: DEFAULT_EDGE.style,
                  labelStyle: DEFAULT_EDGE.labelStyle,
                }}
                elementsSelectable
                nodesDraggable
                nodesConnectable
                disableKeyboardA11y={false}
                connectOnClick={false}
                onInit={({ fitView }) => {
                  setTimeout(() => fitView(), 0);
                }}
                deleteKeyCode={['Backspace', 'Delete']}
              >
                <Background />
                <Controls />
              </ReactFlow>
            )}
          </div>
        </div>

        <aside className="sidebar">
          <div className="node-edit-panel">
            <h4>编辑节点 {editNode ? `（${editNode.id}）` : ''}</h4>
            {editNode ? (
              <>
                <label>标题 / 名称</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                <label>负责 Office / 部门</label>
                <input value={form.office} onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))} />
                <label>岗位 / 角色</label>
                <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
                <label>需准备的材料（每行一项或用逗号分隔）</label>
                <textarea
                  value={form.materials}
                  onChange={(e) => setForm((f) => ({ ...f, materials: e.target.value }))}
                  rows={3}
                />
                <label>说明</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                />
                <div className="node-edit-actions">
                  <button type="button" onClick={applyNodeForm}>
                    保存到节点
                  </button>
                  <button type="button" className="link" onClick={() => setEditNode(null)}>
                    取消
                  </button>
                </div>
                <p className="hint">提示：先单击选中节点或连线，再按 Backspace 或 Delete 删除；拖拽连线端点可改接。</p>
              </>
            ) : (
              <p className="hint">单击选中节点或边后按 Delete/Backspace 可删。双击节点编辑，双击连线编分支条件；从节点底部拖线到另一节点顶部可新连。</p>
            )}
          </div>
          <h3>本次操作列表</h3>
          {operations.length === 0 && <p>暂无操作</p>}
          {operations.map((op) => (
            <div className="op-item" key={op.id}>
              <div>
                <strong>{op.type}</strong>
                <p>{op.reason}</p>
              </div>
              <button onClick={() => undoOperation(op.id)}>撤回</button>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
