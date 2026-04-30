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
import { workflowToFlowElements, flowElementsToWorkflow, DEFAULT_EDGE, nodeLabel } from './flowUtils.js';

const API_BASE = 'http://localhost:4000/api';
const nodeTypes = { workflowNode: WorkflowNode };

function applyHighlightToNodes(rfNodes, activeType, sessionHighlights) {
  const hl = sessionHighlights[activeType] || [];
  return rfNodes.map((n) => {
    const d = n.data?.domain;
    const isAuto = Boolean(d?.extendable_fields?.auto_created);
    const h = d?.id && hl.includes(d.id);
    return {
      ...n,
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

  const [editNode, setEditNode] = useState(null);
  const workflowSigRef = useRef('');
  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const [form, setForm] = useState({ title: '', office: '', role: '', note: '', materials: '' });

  const refreshCanvasFromWorkflow = useCallback(
    (wf) => {
      if (!wf) {
        setNodes([]);
        setEdges([]);
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
  }, [activeType, workflows, refreshCanvasFromWorkflow]);

  // 仅高亮（AI 会话）变化时更新样式，不重置位置
  useEffect(() => {
    setNodes((prev) => applyHighlightToNodes(prev, activeType, sessionHighlights));
  }, [sessionHighlights, activeType, setNodes]);

  const addManualNode = useCallback(() => {
    if (!activeType) return;
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
    const n2 = applyHighlightToNodes(n, activeType, sessionHighlights);
    setNodes(n2);
    setEdges(e);
    setEditNode({ ...domain });
    setForm({ title: '新节点', office: '待补充', role: '待补充', note: '', materials: '' });
    setTimeout(() => putWorkflow(n2, e), 0);
  }, [activeType, sessionHighlights, putWorkflow]);

  const onConnect = useCallback(
    (params) => {
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
    [setEdges, putWorkflow],
  );

  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges((eds) => {
        const next = reconnectEdge(oldEdge, newConnection, eds, { shouldReplaceId: true });
        setTimeout(() => putWorkflow(nodesRef.current, next), 0);
        return next;
      });
    },
    [setEdges, putWorkflow],
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
      const v = value.trim() || null;
      setEdges((eds) => {
        const next = eds.map((e) => (e.id === edge.id ? { ...e, data: { ...e.data, condition: v }, label: v || '' } : e));
        setTimeout(() => putWorkflow(nodesRef.current, next), 0);
        return next;
      });
    },
    [setEdges, putWorkflow],
  );

  const applyNodeForm = useCallback(() => {
    if (!editNode) return;
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
  }, [editNode, form, putWorkflow]);

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
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onReconnect={onReconnect}
                onNodeDragStop={onNodeDragStop}
                onNodesDelete={onNodesDelete}
                onEdgesDelete={onEdgesDelete}
                onNodeDoubleClick={onNodeDoubleClick}
                onEdgeDoubleClick={onEdgeDoubleClick}
                onPaneClick={() => setEditNode(null)}
                defaultEdgeOptions={{ type: 'default', reconnectable: true, markerEnd: DEFAULT_EDGE.markerEnd, style: DEFAULT_EDGE.style, labelStyle: DEFAULT_EDGE.labelStyle }}
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
                <p className="hint">提示：拖拽连线端点以改接节点；选中节点/连线后按 Delete 可删。</p>
              </>
            ) : (
              <p className="hint">双击节点进行编辑。双击连线可编辑分支条件。从节点底部拖线到另一节点顶部可新连接。</p>
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
