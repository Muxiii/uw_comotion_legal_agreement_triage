import { createContext } from 'react';

/** 画布自定义节点与 App 之间的删除等操作（避免把回调写进每个 node.data） */
export const WorkflowGraphContext = createContext({
  requestDeleteNode: null,
  deleteNodeButtonTitle: '',
});
