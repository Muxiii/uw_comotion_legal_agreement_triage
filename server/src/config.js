import dotenv from 'dotenv';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

dotenv.config();

const SUPPORTED_PROVIDERS = ['openai', 'claude', 'kimi'];

export function getAiConfig() {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  const apiKey = process.env.AI_API_KEY;

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`AI_PROVIDER is required and must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  if (!apiKey) {
    throw new Error('AI_API_KEY is required. Please set it in local environment variables.');
  }

  return {
    provider,
    apiKey,
    model: process.env.AI_MODEL,
  };
}

export async function ensureAiConfigInteractive() {
  if (process.env.AI_PROVIDER && process.env.AI_API_KEY) return;

  const rl = readline.createInterface({ input, output });

  const providerRaw = await rl.question('Choose AI provider (openai/claude/kimi): ');
  const apiKey = await rl.question('Enter API key (local only): ');
  const model = await rl.question('Model (optional, press Enter to skip): ');
  rl.close();

  process.env.AI_PROVIDER = providerRaw.trim().toLowerCase();
  process.env.AI_API_KEY = apiKey.trim();
  if (model.trim()) process.env.AI_MODEL = model.trim();
}
