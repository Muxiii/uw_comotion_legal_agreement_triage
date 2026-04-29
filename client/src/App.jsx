import { useMemo, useState, useEffect } from 'react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';

const API_BASE = 'http://localhost:4000/api';

function nodeLabel(n) {
  const title = n.title || n.id;
  const mats = Array.isArray(n.materials) && n.materials.length ? n.materials.join('、') : '（材料待列）';
  return `${title}\n${n.office || '—'} · ${n.role || '—'}\n材料：${mats}\n${n.note || ''}`.trim();
}

function toFlowData(workflow, highlights = []) {
  const byId = new Map();
  (workflow?.nodes || []).forEach((n) => {
    if (n?.id) byId.set(n.id, n);
  });
  (workflow?.edges || []).forEach((e) => {
    if (e?.from && !byId.has(e.from)) {
      byId.set(e.from, { id: e.from, title: e.from, office: '—', role: '—', materials: [], note: '边存在但无节点，后端应已自动补全' });
    }
    if (e?.to && !byId.has(e.to)) {
      byId.set(e.to, { id: e.to, title: e.to, office: '—', role: '—', materials: [], note: '边存在但无节点，后端应已自动补全' });
    }
  });
  const orderedIds = Array.from(byId.keys());
  const nodes = orderedIds.map((id, index) => {
    const n = byId.get(id);
    const isAuto = Boolean(n.extendable_fields?.auto_created);
    return {
      id: n.id,
      data: { label: nodeLabel(n) },
      position: { x: 120 + (index % 4) * 260, y: 80 + Math.floor(index / 4) * 180 },
      style: {
        width: 240,
        borderRadius: 8,
        border: isAuto
          ? '1px dashed #94a3b8'
          : highlights.includes(n.id)
            ? '2px solid #eab308'
            : '1px solid #64748b',
        background: isAuto ? '#f1f5f9' : highlights.includes(n.id) ? '#fef9c3' : '#f8fafc',
        whiteSpace: 'pre-line',
        padding: 10,
        fontSize: 12,
      },
    };
  });

  const edges = (workflow?.edges || []).map((e, idx) => ({
    id: `${e.from}-${e.to}-${e.condition || 'default'}-${idx}`,
    source: e.from,
    target: e.to,
    label: e.condition || '',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 1.5 },
    labelStyle: { fill: '#0f172a', fontSize: 12 },
  }));

  return { nodes, edges };
}

export default function App() {
  const [workflows, setWorkflows] = useState({});
  const [sessionHighlights, setSessionHighlights] = useState({});
  const [operations, setOperations] = useState([]);
  const [activeType, setActiveType] = useState('');

  const [files, setFiles] = useState([]);
  const [newTypesDetected, setNewTypesDetected] = useState([]);
  const [confirmedNewTypes, setConfirmedNewTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/workflows`)
      .then((r) => r.json())
      .then((data) => {
        setWorkflows(data.workflows || {});
        const keys = Object.keys(data.workflows || {});
        if (keys.length) setActiveType(keys[0]);

        if (data.latestSession) {
          setSessionHighlights(data.latestSession.highlights || {});
          setOperations(data.latestSession.operations || []);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const flowData = useMemo(() => {
    if (!activeType) return { nodes: [], edges: [] };
    return toFlowData(workflows[activeType], sessionHighlights[activeType] || []);
  }, [activeType, workflows, sessionHighlights]);

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
          <button disabled={loading} onClick={() => submitAnalyze(true)}>确认并继续第二步</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="content">
        <div className="main">
          <div className="tabs">
            {Object.keys(workflows).map((type) => (
              <button key={type} className={activeType === type ? 'active' : ''} onClick={() => setActiveType(type)}>
                {type}
              </button>
            ))}
          </div>

          <div className="flow-wrap">
            <ReactFlow key={activeType} nodes={flowData.nodes} edges={flowData.edges} fitView>
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </div>

        <aside className="sidebar">
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
