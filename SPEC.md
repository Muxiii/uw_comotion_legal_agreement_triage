# Triage Builder Spec

## 1. Purpose

- Build and maintain legal-agreement triage workflows locally.
- Use AI to analyze uploaded documents and propose atomic workflow updates.
- Let users review, edit, auto-arrange, and persist workflows visually.
- Keep workflow-generation algorithm explicit in `ALGORITHM.md` and update it with feature changes.

## 2. Scope

- Frontend: React + React Flow.
- Backend: Node + Express.
- AI providers: OpenAI / Claude / Kimi (configurable via local env).
- Persistence: local JSON files only.

## 3. Data Model

### 3.1 Workflows

- File: `server/data/workflows.json`
- Shape: `Record<fileType, { nodes: Node[], edges: Edge[] }>`

### 3.2 Node

- Required fields:
  - `id: string` (stable machine id)
  - `title: string` (human-readable short step name)
  - `office: string` (responsible office/department)
  - `role: string` (role/sub-responsibility)
  - `materials: string[]` (required materials)
  - `note: string` (brief instruction/description)
  - `extendable_fields: object` (arbitrary extensible key-values; includes UI metadata such as position)

### 3.3 Edge

- Required fields:
  - `from: string` (source node id)
  - `to: string` (target node id)
  - `condition: string | null` (branch label)

## 4. Backend Behavior

### 4.1 AI Configuration

- On server start, if env is missing:
  - ask provider / api key / optional model in terminal.
- Env variables:
  - `AI_PROVIDER`
  - `AI_API_KEY`
  - `AI_MODEL` (optional)

### 4.2 File Upload + AI Analysis

- Upload endpoint accepts multiple files: `pdf`, `docx`, `txt`.
- Text extraction:
  - TXT: direct utf-8
  - DOCX: mammoth
  - PDF: `PDFParse`

### 4.3 Two-step AI

- Step 1: detect `existingTypes` and `newTypes`.
- If `newTypes` exists and not confirmed:
  - return `requiresTypeConfirmation: true`
  - do not mutate workflows.
- Step 2: per target type, generate atomic operations:
  - `INSERT_NODE`
  - `DELETE_NODE`
  - `UPDATE_NODE`
  - `ADD_BRANCH`
  - `REMOVE_BRANCH`
  - `ADD_WORKFLOW`

### 4.4 Operation Apply Rules

- Normalize missing metadata (reason/fileType where applicable).
- Validate operation payload.
- Skip invalid operations and report as `skippedOperations`.
- Enforce integrity:
  - dedupe edges by `(from,to,condition)`
  - ensure every edge endpoint has a corresponding node
  - normalize node shape (fill required fields when missing)
- Conflict handling baseline:
  - prefer non-destructive updates over deletes when evidence is weak
  - keep graph integrity as first priority
  - uncertain operations should be skipped (not force-applied)

### 4.5 Session

- Keep latest analysis session with:
  - operation list
  - highlights
  - baseline workflows
- Support single-operation undo by recomputing from baseline.
- Session persisted locally in `server/data/session.json`.

### 4.6 API

- `GET /api/workflows`
  - Returns current workflows and latest session.
- `POST /api/analyze`
  - Input: uploaded files + optional confirmed new types.
  - Output: workflows, operations, highlights, etc.
- `POST /api/undo-operation`
  - Undo one AI operation from latest session.
- `PUT /api/workflow/:fileType`
  - Persist manually edited graph (nodes + edges) for one type.
- `POST /api/assistant`
  - Classify chat vs workflow-edit intent.
  - For workflow-edit: generate/apply operations and return updated workflows.

## 5. Frontend Behavior

### 5.1 Core Views

- Top bar:
  - add node
  - auto-arrange nodes
  - undo canvas edit (local history depth shown)
  - language toggle (zh/en)
- Tabs: one workflow tab per file type.
- Main canvas: React Flow graph.
- Sidebar:
  - tabbed panel: AI Assistant / Operation History
  - AI Assistant composer at bottom
  - file tools are inside AI panel and only shown after clicking `+`
  - draggable splitter between canvas and sidebar

### 5.2 Manual Editing

- Node:
  - drag to move
  - double-click to edit fields
  - delete via selection + Delete/Backspace
- Edge:
  - drag handle to reconnect
  - double-click to edit `condition`
  - delete via selection + Delete/Backspace
- Add node:
  - creates default node and opens editor.

### 5.3 Auto Arrange

- Toolbar action `自动整理节点`.
- DAG-like level layout:
  - upstream nodes on higher levels
  - downstream nodes on lower levels
  - same level laid out horizontally.
- Non-DAG leftovers are appended to lower levels.
- Layout update is persisted through `PUT /api/workflow/:fileType`.

### 5.4 Local Canvas Undo History

- Keep up to 10 snapshots per file type tab.
- Triggered on destructive/structural edits and form updates.
- Toolbar action `撤销（n）` restores previous snapshot and persists it.

## 6. Visual Rules (Current)

- Card-style UI containers and buttons.
- Node highlight: yellow for AI-modified nodes.
- Edge handles:
  - circular, 8px
  - fill equals canvas background
  - border color follows node border state.

## 7. Non-goals / Current Limits

- No authentication / multi-user collaboration.
- No database; JSON files are single-source local storage.
- No full operation history beyond latest AI session and local 10-step canvas undo.

## 8. Update Policy

- This spec is the source-of-truth summary of implemented behavior.
- Any feature change must include:
  1. code update
  2. matching `SPEC.md` update in the same PR/commit
  3. `ALGORITHM.md` update if algorithm/decision logic changes.