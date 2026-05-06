import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { ensureAiConfigInteractive, getAiConfig } from './config.js';
import { extractTextFromFile } from './textExtract.js';
import { readWorkflows, writeWorkflows } from './workflowStore.js';
import { analyzeOperationsByType, analyzeTypes, askJson, askText } from './aiClient.js';
import { applyOperations } from './operations.js';
import { sessionStore } from './sessionStore.js';
import { normalizeAllWorkflows } from './workflowNormalize.js';

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function normalizeApiErrorMessage(error, fallback) {
  const msg = String(error?.message || '');
  const lower = msg.toLowerCase();
  if (lower.includes('429') || lower.includes('overloaded') || lower.includes('rate limit') || lower.includes('try again later')) {
    return 'AI service is temporarily overloaded (429). Please retry in a few seconds.';
  }
  return msg || fallback;
}

function normalizeOperation(op, fileType) {
  if (!op || typeof op !== 'object') return null;
  const payload = op.payload && typeof op.payload === 'object' ? { ...op.payload } : {};

  if (op.type !== 'ADD_WORKFLOW' && !payload.fileType) {
    payload.fileType = fileType;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: op.type,
    reason: typeof op.reason === 'string' ? op.reason : 'No reason provided by model.',
    payload,
  };
}

app.get('/api/workflows', async (_req, res) => {
  try {
    const workflows = await readWorkflows();
    res.json({ workflows, latestSession: sessionStore.latest });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load workflows.' });
  }
});

app.put('/api/workflow/:fileType', async (req, res) => {
  try {
    const { fileType } = req.params;
    if (!fileType || typeof fileType !== 'string') {
      return res.status(400).json({ error: 'Invalid fileType.' });
    }
    const { nodes, edges } = req.body || {};
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return res.status(400).json({ error: 'Request body must include nodes[] and edges[].' });
    }
    const workflows = await readWorkflows();
    workflows[fileType] = { nodes, edges };
    normalizeAllWorkflows(workflows);
    await writeWorkflows(workflows);
    res.json({ workflows, workflow: workflows[fileType] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to save workflow.' });
  }
});

app.post('/api/analyze', upload.array('files'), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Please upload at least one file.' });

    const aiConfig = getAiConfig();
    const workflows = await readWorkflows();

    const texts = await Promise.all(files.map((f) => extractTextFromFile(f)));
    const combinedText = texts.join('\n\n---\n\n');

    const baselineWorkflows = JSON.parse(JSON.stringify(workflows));
    const step1 = await analyzeTypes(combinedText, workflows, aiConfig);
    const confirmedNewTypes = req.body.confirmedNewTypes ? JSON.parse(req.body.confirmedNewTypes) : [];
    const detectedNewTypes = step1.newTypes || [];

    if (detectedNewTypes.length > 0 && confirmedNewTypes.length === 0) {
      return res.json({
        workflows,
        operations: [],
        highlights: {},
        newTypesDetected: detectedNewTypes,
        requiresTypeConfirmation: true,
      });
    }

    const targetTypes = [...(step1.existingTypes || []), ...confirmedNewTypes];
    const operations = [];

    for (const type of targetTypes) {
      const step2 = await analyzeOperationsByType(type, combinedText, workflows[type], aiConfig);
      for (const op of step2.operations || []) {
        const normalized = normalizeOperation(op, type);
        if (normalized) operations.push(normalized);
      }
    }

    const { workflows: nextWorkflows, highlights, skippedOperations } = applyOperations(workflows, operations);
    await writeWorkflows(nextWorkflows);

    const session = {
      id: `${Date.now()}`,
      operations,
      highlights,
      skippedOperations,
      newTypesDetected: detectedNewTypes,
      confirmedNewTypes,
      baselineWorkflows,
      createdAt: new Date().toISOString(),
    };

    sessionStore.latest = session;

    return res.json({
      workflows: nextWorkflows,
      operations,
      highlights,
      skippedOperations,
      newTypesDetected: detectedNewTypes,
      requiresTypeConfirmation: false,
    });
  } catch (error) {
    return res.status(500).json({ error: normalizeApiErrorMessage(error, 'Failed to analyze.') });
  }
});

app.post('/api/assistant', upload.array('files'), async (req, res) => {
  try {
    const aiConfig = getAiConfig();
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'message is required.' });

    const files = req.files || [];
    const fileTexts = await Promise.all(files.map((f) => extractTextFromFile(f)));
    const filesText = fileTexts.join('\n\n---\n\n');

    const intent = await askJson(
      `Classify user intent for a workflow assistant.
Return strict JSON:
{ "intent": "chat|workflow_edit", "reason": string }

User message:
${message}

Additional attached context text:
${filesText.slice(0, 12000)}`,
      aiConfig,
    );

    const intentType = intent?.intent === 'workflow_edit' ? 'workflow_edit' : 'chat';
    if (intentType === 'chat') {
      const reply = await askText(
        `You are a concise assistant for legal workflow triage tool users.
Answer naturally. If user asks for policy/legal judgment, state assumptions.

User:
${message}`,
        aiConfig,
      );
      return res.json({ intent: 'chat', reply });
    }

    const workflows = await readWorkflows();
    const baselineWorkflows = JSON.parse(JSON.stringify(workflows));
    const combinedText = `${message}\n\n${filesText}`.trim().slice(0, 30000);

    const step1 = await analyzeTypes(combinedText, workflows, aiConfig);
    const targetTypes = [...(step1.existingTypes || []), ...(step1.newTypes || [])];
    const operations = [];

    for (const type of targetTypes) {
      const step2 = await analyzeOperationsByType(type, combinedText, workflows[type], aiConfig);
      for (const op of step2.operations || []) {
        const normalized = normalizeOperation(op, type);
        if (normalized) operations.push(normalized);
      }
    }

    const { workflows: nextWorkflows, highlights, skippedOperations } = applyOperations(workflows, operations);
    await writeWorkflows(nextWorkflows);

    sessionStore.latest = {
      id: `${Date.now()}`,
      operations,
      highlights,
      skippedOperations,
      newTypesDetected: step1.newTypes || [],
      confirmedNewTypes: step1.newTypes || [],
      baselineWorkflows,
      createdAt: new Date().toISOString(),
    };

    let reply = '';
    try {
      reply = await askText(
        `Summarize what workflow changes were applied in 3-6 bullet points.
Use English.
Operations:
${JSON.stringify(operations, null, 2)}
Skipped:
${JSON.stringify(skippedOperations, null, 2)}`,
        aiConfig,
      );
    } catch {
      reply = operations.length
        ? `Workflow updated with ${operations.length} operation(s).`
        : 'No workflow operation was applied.';
    }

    return res.json({
      intent: 'workflow_edit',
      reply,
      workflows: nextWorkflows,
      operations,
      highlights,
      skippedOperations,
      newTypesDetected: step1.newTypes || [],
    });
  } catch (error) {
    return res.status(500).json({ error: normalizeApiErrorMessage(error, 'Assistant failed.') });
  }
});

app.post('/api/undo-operation', async (req, res) => {
  try {
    const { operationId } = req.body;
    if (!operationId) return res.status(400).json({ error: 'operationId is required.' });

    const session = sessionStore.latest;
    if (!session) return res.status(400).json({ error: 'No session to undo.' });

    const remaining = session.operations.filter((op) => op.id !== operationId);
    const { workflows: recomputed, highlights } = applyOperations(session.baselineWorkflows, remaining);
    await writeWorkflows(recomputed);

    sessionStore.latest = {
      ...session,
      operations: remaining,
      highlights,
    };

    res.json({ workflows: recomputed, operations: remaining, highlights });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to undo operation.' });
  }
});

const PORT = process.env.PORT || 4000;

async function start() {
  await ensureAiConfigInteractive();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
