import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  reconnectEdge,
  useReactFlow,
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
import aiChatIcon from './assets/icons/ai-chat-icon.svg';
import operationHistoryIcon from './assets/icons/operation-history-icon.svg';
import { WorkflowGraphContext } from './WorkflowGraphContext.jsx';

const API_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:4000/api').replace(/\/$/, '');
const nodeTypes = { workflowNode: WorkflowNode };
const MAX_HISTORY = 10;
const I18N = {
  zh: {
    uploadAnalyze: '上传并分析',
    addNode: '添加节点',
    autoArrange: '自动整理节点',
    undo: '撤销',
    save: '保存当前流程',
    saving: '保存中…',
    analyzing: 'Analyzing...',
    confirmContinue: '确认并继续第二步',
    newTypesFound: '发现新文件类型：',
    opList: '本次操作列表',
    noOps: '暂无操作',
    rollback: '撤回',
    editNode: '编辑节点',
    title: '标题 / 名称',
    office: '负责 Office / 部门',
    role: '岗位 / 角色',
    materials: '需准备的材料（每行一项或用逗号分隔）',
    note: '说明',
    saveNode: '保存到节点',
    cancel: '取消',
    hintEdit: '提示：先单击选中节点或连线，再按 Backspace 或 Delete 删除；拖拽连线端点可改接。',
    hintIdle:
      '单击节点在右侧编辑（需点保存才写入）；选中后节点右上角可删。双击连线编辑分支条件；从节点底部拖线到另一节点顶部可连接。',
    deleteNodeConfirm: '确定删除该节点？相关连线也会被移除。',
    discardChangesConfirm: '有未保存的修改，确定放弃吗？',
    nodeIdLabel: '节点 ID',
    deleteNodeShort: '删除节点',
    deleteNode: '删除',
    deleteNodeConfirmAgain: '再次确认删除该节点？此操作无法撤销。',
    newNodeTitle: '新节点',
    pending: '待补充',
    chooseTypeFirst: '请至少勾选一个要新增的文件类型，再进行第二步。',
    edgeConditionPrompt: '分支条件（可留空表示非条件边）',
    zh: '中文',
    en: 'English',
    workspace: '工作区',
    triageBuilder: '流程构建',
    fitView: '适应画布',
    redo: '重做',
    chatEmptyHint: '可以通过对话直接修改工作流，AI会自动识别需要修改的流程并更新到画布。',
  },
  en: {
    uploadAnalyze: 'Upload & Analyze',
    addNode: 'Add Node',
    autoArrange: 'Auto Arrange',
    undo: 'Undo',
    save: 'Save Workflow',
    saving: 'Saving...',
    analyzing: 'Analyzing...',
    confirmContinue: 'Confirm and Continue Step 2',
    newTypesFound: 'New file types detected:',
    opList: 'Operations in This Session',
    noOps: 'No operations yet',
    rollback: 'Undo',
    editNode: 'Edit Node',
    title: 'Title',
    office: 'Office / Department',
    role: 'Role',
    materials: 'Required materials (one per line or comma-separated)',
    note: 'Note',
    saveNode: 'Save Node',
    cancel: 'Cancel',
    hintEdit: 'Tip: select a node/edge, then press Backspace/Delete to remove; drag edge endpoints to reconnect.',
    hintIdle:
      'Click a node to edit in the sidebar (Save to apply). Use × on the node when selected to delete. Double-click an edge to edit its condition; drag from the bottom handle to connect.',
    deleteNodeConfirm: 'Delete this node? Connected edges will be removed.',
    discardChangesConfirm: 'You have unsaved changes. Discard them?',
    nodeIdLabel: 'Node ID',
    deleteNodeShort: 'Delete node',
    deleteNode: 'Delete',
    deleteNodeConfirmAgain: 'Confirm again to delete this node? This cannot be undone.',
    newNodeTitle: 'New Node',
    pending: 'Pending',
    chooseTypeFirst: 'Please select at least one new file type before continuing to step 2.',
    edgeConditionPrompt: 'Branch condition (leave empty for unconditional edge)',
    zh: '中文',
    en: 'English',
    workspace: 'WORKSPACE',
    triageBuilder: 'Triage Builder',
    fitView: 'Fit view',
    redo: 'Redo',
    chatEmptyHint:
      'Modify the workflow through chat—the AI will detect what needs to change and update the canvas.',
  },
};

function CanvasFloatingToolbar({
  locale,
  activeType,
  undoDepth,
  redoDepth,
  nodesLength,
  onUndo,
  onRedo,
  onAddNode,
  onAutoArrange,
}) {
  const { fitView } = useReactFlow();
  const zh = locale === 'zh';
  const busy = !activeType;
  return (
    <Panel position="bottom-center" className="canvas-float-toolbar">
      <button
        type="button"
        className="canvas-tool-btn"
        onClick={onUndo}
        disabled={busy || undoDepth === 0}
        title={zh ? `${I18N.zh.undo} (${undoDepth})` : `${I18N.en.undo} (${undoDepth})`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>
      <button
        type="button"
        className="canvas-tool-btn"
        onClick={onRedo}
        disabled={busy || redoDepth === 0}
        title={zh ? `${I18N.zh.redo} (${redoDepth})` : `${I18N.en.redo} (${redoDepth})`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
        </svg>
      </button>
      <span className="canvas-toolbar-divider" />
      <button
        type="button"
        className="canvas-tool-btn"
        onClick={onAddNode}
        disabled={busy}
        title={zh ? I18N.zh.addNode : I18N.en.addNode}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button
        type="button"
        className="canvas-tool-btn"
        onClick={onAutoArrange}
        disabled={busy || nodesLength === 0}
        title={zh ? I18N.zh.autoArrange : I18N.en.autoArrange}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v2M12 19v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M3 12h2M19 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button
        type="button"
        className="canvas-tool-btn"
        onClick={() => fitView({ padding: 0.2, duration: 200 })}
        disabled={busy || nodesLength === 0}
        title={zh ? I18N.zh.fitView : I18N.en.fitView}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
    </Panel>
  );
}

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

async function readJsonSafe(res) {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    const message = raw?.startsWith('<!DOCTYPE') ? 'Server returned non-JSON response.' : raw || 'Invalid JSON response.';
    throw new Error(message);
  }
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
  const [redoDepth, setRedoDepth] = useState(0);
  const [locale, setLocale] = useState('zh');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [rightTab, setRightTab] = useState('assistant');
  const [chatInput, setChatInput] = useState('');
  const [chatFiles, setChatFiles] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [showUploadTools, setShowUploadTools] = useState(false);
  const [assistantStage, setAssistantStage] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);

  const [editNode, setEditNode] = useState(null);
  /** 打开节点编辑时的表单快照，用于放弃修改 / 切换节点前对比 */
  const [draftBaseline, setDraftBaseline] = useState(null);
  const workflowSigRef = useRef('');
  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const historyRef = useRef({});
  const redoRef = useRef({});
  const uploadInputRef = useRef(null);
  const langMenuRef = useRef(null);
  const stageTimerRef = useRef(null);
  const resizeRef = useRef({ startX: 0, startWidth: 360 });
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const [form, setForm] = useState({ title: '', office: '', role: '', note: '', materials: '' });
  const t = I18N[locale];

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  const startStageCycle = useCallback(
    (steps) => {
      clearStageTimer();
      if (!steps || !steps.length) return;
      let idx = 0;
      setAssistantStage(steps[idx]);
      stageTimerRef.current = setInterval(() => {
        idx = Math.min(idx + 1, steps.length - 1);
        setAssistantStage(steps[idx]);
      }, 1500);
    },
    [clearStageTimer],
  );

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
      arr.push({
        label: snapshot.label || (locale === 'zh' ? '画布编辑' : 'Canvas edit'),
        at: Date.now(),
        snapshot: snapshot.graph,
      });
      if (arr.length > MAX_HISTORY) arr.shift();
      historyRef.current[t] = arr;
      if (t === activeType) setUndoDepth(arr.length);
    },
    [activeType, locale],
  );

  const rememberCurrentGraph = useCallback((label) => {
    if (!activeType) return;
    redoRef.current[activeType] = [];
    setRedoDepth(0);
    pushHistorySnapshot(activeType, {
      label,
      graph: cloneGraphSnapshot(nodesRef.current, edgesRef.current),
    });
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
      const { nodes: n, edges: e } = workflowToFlowElements(wf, h, locale);
      setNodes(applyHighlightToNodes(n, activeType, sessionHighlights));
      setEdges(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在外部工作流或 Tab 变化时由调用方显式使用
    [activeType, sessionHighlights, setNodes, setEdges, locale],
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
        const data = await readJsonSafe(res);
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
      .then((r) => readJsonSafe(r))
      .then((data) => {
        setWorkflows(data.workflows || {});
        historyRef.current = {};
        redoRef.current = {};
        setUndoDepth(0);
        setRedoDepth(0);
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

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const d = n.data?.domain;
        if (!d) return n;
        return { ...n, data: { ...n.data, label: nodeLabel(d, locale) } };
      }),
    );
  }, [locale, setNodes]);

  useEffect(() => {
    if (!assistantLoading) return;
    startStageCycle(
      chatFiles.length > 0
        ? [
            locale === 'zh' ? '正在读取上传文件…' : 'Reading uploaded files...',
            locale === 'zh' ? '正在判断意图…' : 'Classifying intent...',
            locale === 'zh' ? '正在生成/更新工作流…' : 'Generating/updating workflow...',
          ]
        : [
            locale === 'zh' ? '正在判断意图…' : 'Classifying intent...',
            locale === 'zh' ? '正在生成回复…' : 'Generating response...',
          ],
    );
    return () => clearStageTimer();
  }, [assistantLoading, locale, chatFiles.length, startStageCycle, clearStageTimer]);

  useEffect(() => {
    if (!loading) return;
    startStageCycle([
      locale === 'zh' ? '正在分析文件…' : 'Analyzing files...',
      locale === 'zh' ? '正在识别文件类型…' : 'Detecting file types...',
      locale === 'zh' ? '正在生成工作流变更…' : 'Generating workflow updates...',
    ]);
    return () => clearStageTimer();
  }, [loading, locale, startStageCycle, clearStageTimer]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing) return;
      const delta = e.clientX - resizeRef.current.startX;
      const next = Math.max(300, Math.min(760, resizeRef.current.startWidth - delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);

  useEffect(() => () => clearStageTimer(), [clearStageTimer]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onDoc = (e) => {
      if (!langMenuRef.current?.contains(e.target)) setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [langMenuOpen]);

  useEffect(() => {
    setRedoDepth((redoRef.current[activeType] || []).length);
  }, [activeType]);

  const addManualNode = useCallback(() => {
    if (!activeType) return;
    rememberCurrentGraph(locale === 'zh' ? '添加节点' : 'Add node');
    const id = `new-${Date.now()}`;
    const domain = {
      id,
      title: t.newNodeTitle,
      office: t.pending,
      role: t.pending,
      materials: [],
      note: '',
      extendable_fields: {},
    };
    const merged = {
      nodes: [...(workflowsRef.current[activeType]?.nodes || []), domain],
      edges: [...(workflowsRef.current[activeType]?.edges || [])],
    };
    const { nodes: n, edges: e } = workflowToFlowElements(merged, sessionHighlights[activeType] || [], locale);
    const arranged = autoArrangeNodes(n, e);
    const n2 = applyHighlightToNodes(arranged, activeType, sessionHighlights);
    setNodes(n2);
    setEdges(e);
    setEditNode({ ...domain });
    const baseline = { title: t.newNodeTitle, office: t.pending, role: t.pending, note: '', materials: '' };
    setForm(baseline);
    setDraftBaseline({ ...baseline });
    setTimeout(() => putWorkflow(n2, e), 0);
  }, [activeType, sessionHighlights, putWorkflow, rememberCurrentGraph, locale, t.newNodeTitle, t.pending]);

  const onConnect = useCallback(
    (params) => {
      rememberCurrentGraph(locale === 'zh' ? '新增连线' : 'Add edge');
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
      rememberCurrentGraph(locale === 'zh' ? '改接连线' : 'Reconnect edge');
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
    setDraftBaseline(null);
    setTimeout(() => putWorkflow(nodesRef.current, edgesRef.current), 0);
  }, [putWorkflow]);

  const onEdgesDelete = useCallback(() => {
    setTimeout(() => putWorkflow(nodesRef.current, edgesRef.current), 0);
  }, [putWorkflow]);

  const onNodesChangeWithHistory = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) rememberCurrentGraph(locale === 'zh' ? '删除节点' : 'Delete node');
      onNodesChange(changes);
    },
    [onNodesChange, rememberCurrentGraph],
  );

  const onEdgesChangeWithHistory = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) rememberCurrentGraph(locale === 'zh' ? '删除连线' : 'Delete edge');
      onEdgesChange(changes);
    },
    [onEdgesChange, rememberCurrentGraph],
  );

  const exitNodeEditor = useCallback(
    (force = false) => {
      if (editNode) {
        const dirty =
          draftBaseline != null && JSON.stringify(form) !== JSON.stringify(draftBaseline);
        if (dirty && !force) {
          if (!window.confirm(t.discardChangesConfirm)) return;
        }
      }
      setEditNode(null);
      setDraftBaseline(null);
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
    },
    [editNode, draftBaseline, form, t.discardChangesConfirm, setNodes],
  );

  const onNodeClick = useCallback(
    (_evt, n) => {
      const d = n.data?.domain;
      if (!d) return;
      if (editNode?.id === d.id) return;
      const open = () => {
        const nextForm = {
          title: d.title || '',
          office: d.office || '',
          role: d.role || '',
          note: d.note || '',
          materials: (d.materials || []).join('\n'),
        };
        setEditNode(d);
        setForm(nextForm);
        setDraftBaseline({ ...nextForm });
      };
      if (editNode && editNode.id !== d.id) {
        const dirty =
          draftBaseline != null && JSON.stringify(form) !== JSON.stringify(draftBaseline);
        if (dirty && !window.confirm(t.discardChangesConfirm)) return;
      }
      open();
    },
    [editNode, draftBaseline, form, t.discardChangesConfirm],
  );

  const performDeleteNode = useCallback(
    (nodeId) => {
      rememberCurrentGraph(locale === 'zh' ? '删除节点' : 'Delete node');
      setEditNode(null);
      setDraftBaseline(null);
      const nextNodes = nodesRef.current.filter((n) => n.id !== nodeId);
      const nextEdges = edgesRef.current.filter((e) => e.source !== nodeId && e.target !== nodeId);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setTimeout(() => putWorkflow(nextNodes, nextEdges), 0);
    },
    [rememberCurrentGraph, locale, putWorkflow, setNodes, setEdges],
  );

  const requestDeleteNode = useCallback(
    (nodeId) => {
      if (!window.confirm(t.deleteNodeConfirm)) return;
      performDeleteNode(nodeId);
    },
    [t.deleteNodeConfirm, performDeleteNode],
  );

  const deleteNodeFromSidebar = useCallback(() => {
    if (!editNode?.id) return;
    if (!window.confirm(t.deleteNodeConfirm)) return;
    if (!window.confirm(t.deleteNodeConfirmAgain)) return;
    performDeleteNode(editNode.id);
  }, [editNode, t.deleteNodeConfirm, t.deleteNodeConfirmAgain, performDeleteNode]);

  const cancelNodeForm = useCallback(() => {
    exitNodeEditor(false);
  }, [exitNodeEditor]);

  const onEdgeDoubleClick = useCallback(
    (_evt, edge) => {
      const current = edge.data?.condition != null && edge.data?.condition !== '' ? String(edge.data.condition) : (edge.label && String(edge.label)) || '';
      const value = window.prompt(t.edgeConditionPrompt, current);
      if (value === null) return;
      rememberCurrentGraph(locale === 'zh' ? '编辑分支条件' : 'Edit edge condition');
      const v = value.trim() || null;
      setEdges((eds) => {
        const next = eds.map((e) => (e.id === edge.id ? { ...e, data: { ...e.data, condition: v }, label: v || '' } : e));
        setTimeout(() => putWorkflow(nodesRef.current, next), 0);
        return next;
      });
    },
    [setEdges, putWorkflow, rememberCurrentGraph, t.edgeConditionPrompt],
  );

  const applyNodeForm = useCallback(() => {
    if (!editNode) return;
    rememberCurrentGraph(locale === 'zh' ? '编辑节点' : 'Edit node');
    const targetId = editNode.id;
    const mats = form.materials
      .split(/[\n,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setNodes((prev) => {
      const next = prev.map((rn) => {
        if (rn.id !== targetId) return { ...rn, selected: false };
        const d = { ...rn.data.domain };
        d.title = form.title.trim() || d.id;
        d.office = form.office.trim() || t.pending;
        d.role = form.role.trim() || t.pending;
        d.note = form.note.trim() || '';
        d.materials = mats;
        if (d.extendable_fields?.auto_created) {
          d.extendable_fields = { ...d.extendable_fields };
          delete d.extendable_fields.auto_created;
        }
        return {
          ...rn,
          selected: false,
          data: { ...rn.data, domain: d, label: nodeLabel(d, locale) },
        };
      });
      setTimeout(() => putWorkflow(next, edgesRef.current), 0);
      return next;
    });
    setDraftBaseline(null);
    setEditNode(null);
  }, [editNode, form, putWorkflow, rememberCurrentGraph, locale, t.pending]);

  const autoArrangeCurrentGraph = useCallback(() => {
    if (!activeType || nodesRef.current.length === 0) return;
    rememberCurrentGraph(locale === 'zh' ? '自动整理节点' : 'Auto arrange');
    const arranged = autoArrangeNodes(nodesRef.current, edgesRef.current);
    const highlighted = applyHighlightToNodes(arranged, activeType, sessionHighlights);
    setNodes(highlighted);
    setTimeout(() => putWorkflow(highlighted, edgesRef.current), 0);
  }, [activeType, sessionHighlights, putWorkflow, rememberCurrentGraph, setNodes]);

  const undoCanvasEdit = useCallback(() => {
    const arr = historyRef.current[activeType] || [];
    if (!arr.length) return;
    const currentSnap = cloneGraphSnapshot(nodesRef.current, edgesRef.current);
    const redoStack = redoRef.current[activeType] || [];
    redoStack.push(currentSnap);
    if (redoStack.length > MAX_HISTORY) redoStack.shift();
    redoRef.current[activeType] = redoStack;
    setRedoDepth(redoStack.length);
    const prevEntry = arr.pop();
    const prev = prevEntry?.snapshot;
    if (!prev) {
      redoStack.pop();
      redoRef.current[activeType] = redoStack;
      setRedoDepth(redoStack.length);
      return;
    }
    historyRef.current[activeType] = arr;
    setUndoDepth(arr.length);
    setEditNode(null);
    setDraftBaseline(null);
    const highlighted = applyHighlightToNodes(prev.nodes, activeType, sessionHighlights);
    setNodes(highlighted);
    setEdges(prev.edges);
    setTimeout(() => putWorkflow(highlighted, prev.edges), 0);
  }, [activeType, putWorkflow, sessionHighlights, setNodes, setEdges]);

  const redoCanvasEdit = useCallback(() => {
    if (!activeType) return;
    const stack = redoRef.current[activeType] || [];
    if (!stack.length) return;
    const toRestore = stack[stack.length - 1];
    if (!toRestore?.nodes || !toRestore?.edges) return;
    pushHistorySnapshot(activeType, {
      label: locale === 'zh' ? '重做' : 'Redo',
      graph: cloneGraphSnapshot(nodesRef.current, edgesRef.current),
    });
    stack.pop();
    redoRef.current[activeType] = stack;
    setRedoDepth(stack.length);
    setEditNode(null);
    setDraftBaseline(null);
    const highlighted = applyHighlightToNodes(toRestore.nodes, activeType, sessionHighlights);
    setNodes(highlighted);
    setEdges(toRestore.edges);
    setTimeout(() => putWorkflow(highlighted, toRestore.edges), 0);
  }, [activeType, locale, pushHistorySnapshot, putWorkflow, sessionHighlights, setNodes, setEdges]);

  const rollbackToHistoryEntry = useCallback(
    (entryIndex) => {
      const arr = historyRef.current[activeType] || [];
      const entry = arr[entryIndex];
      if (!entry?.snapshot) return;
      historyRef.current[activeType] = arr.slice(0, entryIndex);
      setUndoDepth(historyRef.current[activeType].length);
      redoRef.current[activeType] = [];
      setRedoDepth(0);
      setEditNode(null);
      setDraftBaseline(null);
      const highlighted = applyHighlightToNodes(entry.snapshot.nodes, activeType, sessionHighlights);
      setNodes(highlighted);
      setEdges(entry.snapshot.edges);
      setTimeout(() => putWorkflow(highlighted, entry.snapshot.edges), 0);
    },
    [activeType, putWorkflow, sessionHighlights, setNodes, setEdges],
  );

  const sendAssistantMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text && chatFiles.length === 0) return;
    setAssistantLoading(true);
    setError('');

    const userMsg = { role: 'user', text: text || (locale === 'zh' ? '（仅上传文件）' : '(files only)') };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const fd = new FormData();
      fd.append('message', text || 'Please analyze attached files and update workflow if needed.');
      chatFiles.forEach((f) => fd.append('files', f));

      const res = await fetch(`${API_BASE}/assistant`, {
        method: 'POST',
        body: fd,
      });
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Assistant failed');

      setChatMessages((prev) => [...prev, { role: 'assistant', text: data.reply || '' }]);
      if (data.workflows) {
        const beforeCount = Object.values(workflowsRef.current || {}).reduce(
          (sum, wf) => sum + (wf?.nodes?.length || 0),
          0,
        );
        const afterCount = Object.values(data.workflows || {}).reduce(
          (sum, wf) => sum + (wf?.nodes?.length || 0),
          0,
        );
        setWorkflows(data.workflows || {});
        setOperations(data.operations || []);
        setSessionHighlights(data.highlights || {});
        historyRef.current = {};
        redoRef.current = {};
        setUndoDepth(0);
        setRedoDepth(0);
        workflowSigRef.current = '';
        if (afterCount > beforeCount) {
          setAssistantStage(
            locale === 'zh'
              ? `工作流更新成功，新增/调整了 ${afterCount - beforeCount} 个节点。`
              : `Workflow updated successfully. ${afterCount - beforeCount} node(s) were added/updated.`,
          );
        } else {
          setAssistantStage(locale === 'zh' ? '工作流更新成功。' : 'Workflow updated successfully.');
        }
      } else {
        setAssistantStage('');
      }
      setChatInput('');
      setChatFiles([]);
    } catch (e) {
      setError(e.message);
      setChatMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${e.message}` }]);
      setAssistantStage(locale === 'zh' ? '处理失败，请稍后重试。' : 'Processing failed. Please try again.');
    } finally {
      clearStageTimer();
      setAssistantLoading(false);
    }
  }, [chatInput, chatFiles, locale, clearStageTimer]);

  async function submitAnalyze(skipConfirmation = false) {
    setError('');
    if (skipConfirmation && confirmedNewTypes.length === 0) {
      setError(t.chooseTypeFirst);
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

      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Analyze failed');

      setNewTypesDetected(data.newTypesDetected || []);

      if (data.requiresTypeConfirmation) {
        setLoading(false);
        return;
      }

      setWorkflows(data.workflows || {});
      historyRef.current = {};
      redoRef.current = {};
      setUndoDepth(0);
      setRedoDepth(0);
      setOperations(data.operations || []);
      setSessionHighlights(data.highlights || {});
      setNewTypesDetected([]);
      setConfirmedNewTypes([]);
      setFiles([]);
      setChatFiles([]);
      setShowUploadTools(false);
      workflowSigRef.current = '';
      const keys = Object.keys(data.workflows || {});
      if (keys.length && !keys.includes(activeType)) setActiveType(keys[0]);
      setAssistantStage(locale === 'zh' ? '文件分析完成，流程已更新。' : 'File analysis completed and workflow updated.');
    } catch (e) {
      setError(e.message);
      setAssistantStage(locale === 'zh' ? '文件分析失败，请重试。' : 'File analysis failed. Please retry.');
    } finally {
      clearStageTimer();
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
      const data = await readJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Undo failed');

      setWorkflows(data.workflows || {});
      historyRef.current = {};
      redoRef.current = {};
      setUndoDepth(0);
      setRedoDepth(0);
      setOperations(data.operations || []);
      setSessionHighlights(data.highlights || {});
      workflowSigRef.current = '';
    } catch (e) {
      setError(e.message);
    }
  }

  const workflowGraphUi = useMemo(
    () => ({
      requestDeleteNode,
      deleteNodeButtonTitle: t.deleteNodeShort,
    }),
    [requestDeleteNode, t.deleteNodeShort],
  );

  return (
    <WorkflowGraphContext.Provider value={workflowGraphUi}>
    <div className="app-shell app-shell--smart">
      <header className="app-top-header">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden />
          <span className="app-brand-name">Smart Triage</span>
        </div>
        <div className="app-top-header-right">
          <div className="lang-dropdown" ref={langMenuRef}>
            <button type="button" className="lang-dropdown-trigger" onClick={() => setLangMenuOpen((o) => !o)}>
              {locale === 'zh' ? '简体中文' : 'English'}
            </button>
            {langMenuOpen && (
              <div className="lang-dropdown-menu">
                <button
                  type="button"
                  className={locale === 'en' ? 'active' : ''}
                  onClick={() => {
                    setLocale('en');
                    setLangMenuOpen(false);
                  }}
                >
                  English
                </button>
                <button
                  type="button"
                  className={locale === 'zh' ? 'active' : ''}
                  onClick={() => {
                    setLocale('zh');
                    setLangMenuOpen(false);
                  }}
                >
                  简体中文
                </button>
              </div>
            )}
          </div>
          <div className="header-user-avatar" title="User" />
        </div>
      </header>

      {newTypesDetected.length > 0 && (
        <div className="confirm-box">
          <strong>{t.newTypesFound}</strong>
          {newTypesDetected.map((ft) => (
            <label key={ft}>
              <input
                type="checkbox"
                checked={confirmedNewTypes.includes(ft)}
                onChange={(e) => {
                  setConfirmedNewTypes((prev) =>
                    e.target.checked ? [...prev, ft] : prev.filter((item) => item !== ft),
                  );
                }}
              />
              {ft}
            </label>
          ))}
          <button disabled={loading} onClick={() => submitAnalyze(true)}>
            {t.confirmContinue}
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="app-workspace">
        <nav className="leftnav" aria-label="Workspace">
          <div className="nav-section-label">{t.workspace}</div>
          <div className="leftnav-block">
            <div className="leftnav-parent">{t.triageBuilder}</div>
            <div className="leftnav-children">
              {Object.keys(workflows).length === 0 && (
                <span className="leftnav-empty">{locale === 'zh' ? '暂无流程' : 'No flows yet'}</span>
              )}
              {Object.keys(workflows).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`leftnav-item ${activeType === type ? 'active' : ''}`}
                  onClick={() => {
                    setActiveType(type);
                    setEditNode(null);
                    setDraftBaseline(null);
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="center-stage">
          <div className="canvas-card">
            <div className="canvas-titlebar">
              <span className="canvas-title-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span className="canvas-title-text">{activeType || '—'}</span>
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
                  onNodeClick={onNodeClick}
                  onEdgeDoubleClick={onEdgeDoubleClick}
                  onPaneClick={() => {
                    exitNodeEditor(false);
                  }}
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
                  <CanvasFloatingToolbar
                    locale={locale}
                    activeType={activeType}
                    undoDepth={undoDepth}
                    redoDepth={redoDepth}
                    nodesLength={nodes.length}
                    onUndo={undoCanvasEdit}
                    onRedo={redoCanvasEdit}
                    onAddNode={addManualNode}
                    onAutoArrange={autoArrangeCurrentGraph}
                  />
                </ReactFlow>
              )}
            </div>
          </div>
        </div>

        <div
          className={`splitter ${isResizing ? 'active' : ''}`}
          onMouseDown={(e) => {
            resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
            setIsResizing(true);
          }}
        />

        <aside className="sidebar" style={{ width: `${sidebarWidth}px` }}>
          {editNode ? (
            <div className="node-edit-sidebar">
              <h3 className="node-edit-sidebar-title">{t.editNode}</h3>
              <p className="node-edit-sidebar-id">
                <span className="node-edit-id-label">{t.nodeIdLabel}</span>{' '}
                <span className="node-edit-id-value">{editNode.id}</span>
              </p>
              <div className="node-edit-panel node-edit-panel--sidebar">
                <label htmlFor="node-field-title">
                  {t.title}
                  <input
                    id="node-field-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
                <label htmlFor="node-field-office">
                  {t.office}
                  <input
                    id="node-field-office"
                    value={form.office}
                    onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
                <label htmlFor="node-field-role">
                  {t.role}
                  <input
                    id="node-field-role"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
                <label htmlFor="node-field-materials">
                  {t.materials}
                  <textarea
                    id="node-field-materials"
                    rows={4}
                    value={form.materials}
                    onChange={(e) => setForm((f) => ({ ...f, materials: e.target.value }))}
                  />
                </label>
                <label htmlFor="node-field-note">
                  {t.note}
                  <textarea
                    id="node-field-note"
                    rows={3}
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </label>
              </div>
              <div className="node-edit-actions">
                <button type="button" className="link" onClick={cancelNodeForm}>
                  {t.cancel}
                </button>
                <span className="node-edit-actions-spacer" aria-hidden />
                <button type="button" className="node-edit-delete-btn" onClick={deleteNodeFromSidebar}>
                  {t.deleteNode}
                </button>
                <button type="button" className="node-edit-save-btn" onClick={applyNodeForm}>
                  {t.saveNode}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="side-tabs">
                <button
                  type="button"
                  className={`side-tab ${rightTab === 'assistant' ? 'active' : ''}`}
                  onClick={() => setRightTab('assistant')}
                >
                  <img src={aiChatIcon} alt="" className="side-tab-icon" width={20} height={20} />
                  <span>AI</span>
                </button>
                <button
                  type="button"
                  className={`side-tab ${rightTab === 'history' ? 'active' : ''}`}
                  onClick={() => setRightTab('history')}
                >
                  <img src={operationHistoryIcon} alt="" className="side-tab-icon" width={20} height={20} />
                  <span>{locale === 'zh' ? '操作历史' : 'History'}</span>
                </button>
              </div>

              {rightTab === 'assistant' ? (
            <div className="assistant-panel">
              <div className="chat-list">
                {chatMessages.length === 0 && (
                  <div className="history-empty assistant-chat-empty" aria-live="polite">
                    <div className="history-empty-illu" aria-hidden>
                      <img src={aiChatIcon} alt="" width={56} height={56} className="history-empty-icon" />
                    </div>
                    <p className="history-empty-text">{t.chatEmptyHint}</p>
                  </div>
                )}
                {chatMessages.map((m, idx) => (
                  <div key={`${m.role}-${idx}`} className={`chat-msg ${m.role}`}>
                    <strong>{m.role === 'user' ? (locale === 'zh' ? '你' : 'You') : 'AI'}</strong>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
              <div className="chat-composer">
                {assistantStage && <div className="assistant-stage">{assistantStage}</div>}
                <div className="chat-input-wrap">
                  <button
                    type="button"
                    className="upload-mini"
                    onClick={() => setShowUploadTools((v) => !v)}
                    title={locale === 'zh' ? '上传文件' : 'Upload files'}
                  >
                    +
                  </button>
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendAssistantMessage();
                      }
                    }}
                    placeholder={locale === 'zh' ? '输入消息或流程变更需求…' : 'Type a message or workflow change request...'}
                  />
                  <button type="button" onClick={sendAssistantMessage} disabled={assistantLoading || loading}>
                    {assistantLoading ? (locale === 'zh' ? '发送中…' : 'Sending...') : (locale === 'zh' ? '发送' : 'Send')}
                  </button>
                </div>

                {showUploadTools && (
                  <div className="upload-tools">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const selected = Array.from(e.target.files || []);
                        setFiles(selected);
                        setChatFiles(selected);
                      }}
                    />
                    <button type="button" onClick={() => uploadInputRef.current?.click()}>
                      {locale === 'zh' ? '选取文件' : 'Choose Files'}
                    </button>
                    <button type="button" onClick={() => submitAnalyze(false)} disabled={loading || files.length === 0 || assistantLoading}>
                      {loading ? t.analyzing : t.uploadAnalyze}
                    </button>
                    <button
                      type="button"
                      className="upload-tools-close"
                      onClick={() => {
                        setShowUploadTools(false);
                        setFiles([]);
                        setChatFiles([]);
                        if (uploadInputRef.current) uploadInputRef.current.value = '';
                      }}
                      aria-label={locale === 'zh' ? '关闭上传区域' : 'Close upload tools'}
                      title={locale === 'zh' ? '关闭' : 'Close'}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              {(chatFiles.length > 0 || files.length > 0) && (
                <p className="hint">
                  {locale === 'zh' ? '已附加文件：' : 'Attached files: '}
                  {[...(chatFiles.length ? chatFiles : files)].map((f) => f.name).join(', ')}
                </p>
              )}
            </div>
              ) : (
                <div className="history-panel">
                  <div className="chat-list">
                    {(historyRef.current[activeType] || []).length === 0 ? (
                      <div className="history-empty">
                        <div className="history-empty-illu" aria-hidden>
                          <img src={operationHistoryIcon} alt="" width={56} height={56} className="history-empty-icon" />
                        </div>
                        <p className="history-empty-text">{locale === 'zh' ? '暂无本地历史记录' : 'No local history yet'}</p>
                        <p className="history-empty-hint">
                          {locale === 'zh' ? '在画布上编辑节点或连线后，可在此回退。' : 'Canvas edits will show up here for quick rollback.'}
                        </p>
                      </div>
                    ) : (
                      <div className="history-entries">
                        {[...(historyRef.current[activeType] || [])]
                          .map((entry, idx, arr) => ({ entry, idx, seq: arr.length - idx }))
                          .reverse()
                          .map(({ entry, idx, seq }) => (
                            <button key={`${entry.at}-${idx}`} type="button" className="history-item" onClick={() => rollbackToHistoryEntry(idx)}>
                              <span>{locale === 'zh' ? `第 ${seq} 步` : `Step ${seq}`}</span>
                              <small>{entry.label}</small>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
    </WorkflowGraphContext.Provider>
  );
}
