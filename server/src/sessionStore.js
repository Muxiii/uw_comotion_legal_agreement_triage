import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_DIR = path.resolve(__dirname, '../data');
const SESSION_PATH = path.join(SESSION_DIR, 'session.json');

function ensureDataDir() {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
}

function readPersisted() {
  try {
    if (!existsSync(SESSION_PATH)) return null;
    const raw = readFileSync(SESSION_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.latest ?? null;
  } catch {
    return null;
  }
}

let _latest = readPersisted();

function writePersisted(latest) {
  ensureDataDir();
  writeFileSync(SESSION_PATH, `${JSON.stringify({ latest }, null, 2)}\n`, 'utf-8');
}

export const sessionStore = {
  get latest() {
    return _latest;
  },
  set latest(value) {
    _latest = value;
    try {
      writePersisted(_latest);
    } catch (err) {
      console.error('Failed to persist session.json:', err.message);
    }
  },
};
