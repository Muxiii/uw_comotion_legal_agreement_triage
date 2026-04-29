import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

function tryParseJson(raw) {
  return JSON.parse(raw);
}

function extractJsonCandidate(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text.trim();
}

function extractJson(text) {
  const candidate = extractJsonCandidate(text);
  return tryParseJson(candidate);
}

async function callOpenAI(prompt, config) {
  const client = new OpenAI({ apiKey: config.apiKey });
  const completion = await client.chat.completions.create({
    model: config.model || 'gpt-4o-mini',
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  return completion.choices[0]?.message?.content || '{}';
}

async function callClaude(prompt, config) {
  const client = new Anthropic({ apiKey: config.apiKey });
  const msg = await client.messages.create({
    model: config.model || 'claude-3-5-sonnet-latest',
    max_tokens: 3000,
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  return msg.content.map((c) => c.text || '').join('\n');
}

async function callKimi(prompt, config) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: 'https://api.moonshot.ai/v1',
  });

  const completion = await client.chat.completions.create({
    model: config.model || 'moonshot-v1-auto',
    temperature: 0,
    messages: [{ role: 'user', content: prompt }],
  });

  return completion.choices[0]?.message?.content || '{}';
}

export async function askJson(prompt, config) {
  let text = '';

  if (config.provider === 'openai') text = await callOpenAI(prompt, config);
  if (config.provider === 'claude') text = await callClaude(prompt, config);
  if (config.provider === 'kimi') text = await callKimi(prompt, config);

  try {
    return extractJson(text || '{}');
  } catch {
    const repairPrompt = `${prompt}

Your previous response was not valid JSON.
Return ONLY strict JSON. No explanation, no markdown, no prose.`;

    let repaired = '';
    if (config.provider === 'openai') repaired = await callOpenAI(repairPrompt, config);
    if (config.provider === 'claude') repaired = await callClaude(repairPrompt, config);
    if (config.provider === 'kimi') repaired = await callKimi(repairPrompt, config);

    return extractJson(repaired || '{}');
  }
}

export async function analyzeTypes(combinedText, workflows, config) {
  const prompt = `You are a workflow triage analyzer.\nGiven document text and current workflow type keys, detect involved file types.\nReturn strict JSON with shape:\n{\n  \"existingTypes\": string[],\n  \"newTypes\": string[]\n}\n\nCurrent types: ${JSON.stringify(Object.keys(workflows))}\n\nDocument text:\n${combinedText.slice(0, 30000)}\n`;

  return askJson(prompt, config);
}

export async function analyzeOperationsByType(type, combinedText, workflowForType, config) {
  const nodeSpec = `Each node MUST be an object with:\n- id: string, short meaningful slug in English (e.g. nda-legal-review, sign-by-pi) — NOT random numbers like nda-3\n- title: string, 2-8 Chinese characters for human display (e.g. 律所审阅, 签字)\n- office: which office/department is responsible (中文)\n- role: role or sub-responsibility (中文)\n- materials: string[] — what materials to prepare for this step\n- note: brief description (中文)\n- extendable_fields: object (can be {} )`;

  const prompt = `You are an operations planner.

For file type \"${type}\", output workflow mutations as strict JSON:
{
  "operations": [
    { "type": "INSERT_NODE|DELETE_NODE|UPDATE_NODE|ADD_BRANCH|REMOVE_BRANCH|ADD_WORKFLOW", "reason": string, "payload": object }
  ]
}

${nodeSpec}

CRITICAL:
- For EVERY ADD_BRANCH, the endpoints (from, to) MUST already exist as nodes, OR you MUST list INSERT_NODE for any NEW endpoint BEFORE the ADD_BRANCH that uses it. Never leave an edge endpoint without a node in the final graph.
- Prefer: insert all needed nodes first, then add branches.
- If you add a new branch between existing node ids, both ids must already exist in the workflow.
- When creating new steps, use descriptive id + title, not opaque ids.

Existing workflow for this type:
${JSON.stringify(workflowForType || null, null, 2)}

Document text:
${combinedText.slice(0, 30000)}

Operation payload rules:
- ADD_BRANCH/REMOVE_BRANCH: payload.fileType, from, to, condition (string or null)
- INSERT_NODE: payload.fileType, node: <full node as above> — do not omit title/materials
- DELETE_NODE: payload.fileType, id
- UPDATE_NODE: payload.fileType, id, fields: partial node fields
- ADD_WORKFLOW: payload.type, payload.workflow: { nodes, edges } — ensure nodes cover all edge endpoints
- payload.fileType must be \"${type}\" except for ADD_WORKFLOW.

Keep operations minimal.`;

  return askJson(prompt, config);
}
