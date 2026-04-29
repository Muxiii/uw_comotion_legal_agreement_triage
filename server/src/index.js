import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { ensureAiConfigInteractive, getAiConfig } from './config.js';
import { extractTextFromFile } from './textExtract.js';
import { readWorkflows, writeWorkflows } from './workflowStore.js';
import { analyzeOperationsByType, analyzeTypes } from './aiClient.js';
import { applyOperations } from './operations.js';
import { sessionStore } from './sessionStore.js';

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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
    return res.status(500).json({ error: error.message || 'Failed to analyze.' });
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
