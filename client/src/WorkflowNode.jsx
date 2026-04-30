import { Handle, Position } from 'reactflow';
import { memo } from 'react';

function WorkflowNode({ data }) {
  return (
    <div className="workflow-node-inner">
      <Handle type="target" position={Position.Top} id="t" />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} id="s" />
    </div>
  );
}

export default memo(WorkflowNode);
