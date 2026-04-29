import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeAllWorkflows } from './workflowNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKFLOWS_PATH = path.resolve(__dirname, '../data/workflows.json');

export async function readWorkflows() {
  const raw = await fs.readFile(WORKFLOWS_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  normalizeAllWorkflows(parsed);
  return parsed;
}

export async function writeWorkflows(workflows) {
  await fs.writeFile(WORKFLOWS_PATH, `${JSON.stringify(workflows, null, 2)}\n`, 'utf-8');
}
