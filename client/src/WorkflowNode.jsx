import { Handle, Position } from 'reactflow';
import { memo } from 'react';

function WorkflowNode({ data, selected }) {
  return (
    <div
      className="workflow-node-inner"
      style={{
        minHeight: 64,
        outline: selected ? '2px solid #0ea5e9' : 'none',
        borderRadius: 6,
        boxSizing: 'border-box',
      }}
    >
      <Handle type="target" position={Position.Top} id="t" />
      <div style={{ fontSize: 12, lineHeight: 1.4, textAlign: 'left', userSelect: 'none', whiteSpace: 'pre-line' }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} id="s" />
    </div>
  );
}

export default memo(WorkflowNode);
