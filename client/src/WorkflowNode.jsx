import { Handle, Position } from 'reactflow';
import { memo, useContext } from 'react';
import { WorkflowGraphContext } from './WorkflowGraphContext.jsx';

function WorkflowNode({ id, data, selected }) {
  const { requestDeleteNode, deleteNodeButtonTitle } = useContext(WorkflowGraphContext);

  return (
    <div className="workflow-node-inner">
      {selected && typeof requestDeleteNode === 'function' && (
        <button
          type="button"
          className="workflow-node-delete"
          title={deleteNodeButtonTitle || undefined}
          aria-label={deleteNodeButtonTitle || 'Delete node'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            requestDeleteNode(id);
          }}
        >
          ×
        </button>
      )}
      <Handle type="target" position={Position.Top} id="t" />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Bottom} id="s" />
    </div>
  );
}

export default memo(WorkflowNode);
