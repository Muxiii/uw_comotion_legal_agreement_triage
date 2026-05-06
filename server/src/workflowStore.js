import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeAllWorkflows } from './workflowNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKFLOWS_PATH = path.resolve(__dirname, '../data/workflows.json');

export async function readWorkflows() {
  try {
    const raw = await fs.readFile(WORKFLOWS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    normalizeAllWorkflows(parsed);
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    if (err instanceof SyntaxError) {
      console.error('workflows.json: invalid JSON, using empty workflows:', err.message);
      return {};
    }
    throw err;
  }
}

export async function writeWorkflows(workflows) {
  await fs.mkdir(path.dirname(WORKFLOWS_PATH), { recursive: true });
  await fs.writeFile(WORKFLOWS_PATH, `${JSON.stringify(workflows, null, 2)}\n`, 'utf-8');
}
