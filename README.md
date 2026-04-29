# Triage Builder

React + React Flow + Node/Express 的本地工作流构建工具。

## 功能

- 上传 PDF / DOCX / TXT（支持多文件）
- AI 两步分析：先识别文件类型，再输出原子操作
- 原子操作写入本地 `server/data/workflows.json`
- React Flow 按文件类型 Tab 展示流程图
- 本次新增/修改节点高亮（黄色）
- 右侧操作列表可单条撤回

## 启动

```bash
npm install
npm run dev
```

启动 `server` 时会在终端询问：

- AI provider（openai/claude/kimi）
- API key（仅保存在本地进程环境变量）
- model（可选）

然后访问前端（默认 Vite 地址）。

## 目录

- `server/data/workflows.json`：工作流持久化文件
- `server/src`：上传、文本提取、AI 调用、操作应用、撤回 API
- `client/src`：React Flow 可视化 + 侧边栏
