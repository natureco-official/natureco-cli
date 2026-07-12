const fs = require('fs');
const path = require('path');
const os = require('os');

const BUDGET_FILE = path.join(os.homedir(), '.natureco', 'token-budget.json');
const USAGE_FILE = path.join(os.homedir(), '.natureco', 'token-usage.json');

const PRESETS = {
  efficient: {
    label: 'Efficient — minimum token use',
    maxContextTokens: 8192,
    preserveRecentTokens: 2048,
    tailTurns: 4,
    toolMaxLines: 30,
    toolMaxChars: 800,
    toolMaxBytes: 4096,
    mcpDescMaxChars: 60,
    systemPromptMaxChars: 300,
    memoryMaxFacts: 3,
    memoryMaxChars: 500,
    projectMemoryMaxChars: 1000,
    fileContentMaxChars: 1000,
    conversationOnDisk: 6,
    conversationInContext: 8,
    workflowHistoryMaxTokens: 1024,
    autoCompact: true,
    compactModel: null,
    reservedTokens: 1024
  },
  balanced: {
    label: 'Balanced — good quality with reasonable cost',
    maxContextTokens: 16384,
    preserveRecentTokens: 4096,
    tailTurns: 8,
    toolMaxLines: 60,
    toolMaxChars: 1500,
    toolMaxBytes: 8192,
    mcpDescMaxChars: 100,
    systemPromptMaxChars: 500,
    memoryMaxFacts: 5,
    memoryMaxChars: 1000,
    projectMemoryMaxChars: 2000,
    fileContentMaxChars: 2000,
    conversationOnDisk: 10,
    conversationInContext: 12,
    workflowHistoryMaxTokens: 2048,
    autoCompact: true,
    compactModel: null,
    reservedTokens: 2048
  },
  quality: {
    label: 'Quality — maximum context for best results',
    maxContextTokens: 65536,
    preserveRecentTokens: 8192,
    tailTurns: 20,
    toolMaxLines: 200,
    toolMaxChars: 5000,
    toolMaxBytes: 32768,
    mcpDescMaxChars: 200,
    systemPromptMaxChars: 2000,
    memoryMaxFacts: 10,
    memoryMaxChars: 3000,
    projectMemoryMaxChars: 5000,
    fileContentMaxChars: 5000,
    conversationOnDisk: 20,
    conversationInContext: 25,
    workflowHistoryMaxTokens: 8192,
    autoCompact: false,
    compactModel: null,
    reservedTokens: 4096
  }
};

let _cached = null;

function load() {
  if (_cached) return _cached;
  try {
    if (fs.existsSync(BUDGET_FILE)) {
      const data = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
      const preset = data.preset || 'balanced';
      const base = { ...PRESETS[preset] || PRESETS.balanced, ...data };
      base.preset = preset;
      _cached = base;
      return base;
    }
  } catch {}
  _cached = { preset: 'balanced', ...PRESETS.balanced };
  return _cached;
}

function save(budget) {
  const dir = path.dirname(BUDGET_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
  _cached = null;
}

function setPreset(name) {
  const p = PRESETS[name];
  if (!p) return false;
  const budget = load();
  Object.assign(budget, p);
  budget.preset = name;
  save(budget);
  return true;
}

function getPresets() {
  return Object.entries(PRESETS).map(([key, val]) => ({
    key,
    label: val.label,
    maxContextTokens: val.maxContextTokens
  }));
}

function capToolOutput(output) {
  const budget = load();
  if (!output) return output;
  let str = typeof output === 'string' ? output : JSON.stringify(output);
  const lines = str.split('\n');
  if (lines.length > budget.toolMaxLines) {
    str = lines.slice(0, budget.toolMaxLines).join('\n') + `\n... (${lines.length - budget.toolMaxLines} more lines)`;
  }
  if (str.length > budget.toolMaxChars) {
    str = str.slice(0, budget.toolMaxChars) + `... (truncated, ${str.length} total chars)`;
  }
  return str;
}

function capMcpDesc(desc) {
  const budget = load();
  return (desc || '').slice(0, budget.mcpDescMaxChars);
}

function trimMessages(messages) {
  const budget = load();
  if (!messages || messages.length === 0) return messages;

  const nonSystem = messages.filter(m => m.role !== 'system');
  const systemMsgs = messages.filter(m => m.role === 'system');

  if (nonSystem.length <= budget.conversationInContext) return messages;

  const tail = nonSystem.slice(-budget.tailTurns * 2);
  const compacted = {
    role: 'system',
    content: `[Previous conversation compressed: ${nonSystem.length - tail.length} messages omitted. Key context retained below.]`
  };

  return [...systemMsgs, compacted, ...tail];
}

function trimMemory(memories) {
  const budget = load();
  if (!memories || memories.length === 0) return memories;
  const scored = memories.map(m => ({
    ...m,
    _score: (m.score || 0) + (m.relevance || 0)
  })).sort((a, b) => b._score - a._score);
  return scored.slice(0, budget.memoryMaxFacts);
}

function trimSystemPrompt(prompt) {
  const budget = load();
  if (!prompt) return prompt;
  return prompt.slice(0, budget.systemPromptMaxChars);
}

function trimProjectMemory(content) {
  const budget = load();
  if (!content) return content;
  return content.slice(0, budget.projectMemoryMaxChars);
}

function trimFileContent(content) {
  const budget = load();
  if (!content) return content;
  return content.slice(0, budget.fileContentMaxChars);
}

// Score a message by importance (higher = keep first)
function importanceScore(msg) {
  let score = 0;
  if (msg.role === 'system') score += 100;
  if (msg.role === 'tool') score -= 20;
  if (msg.role === 'assistant' && msg.tool_calls) score += 10;
  if (msg.role === 'user') score += 30;
  const contentLen = (msg.content || '').length;
  if (contentLen > 500) score += 5;
  if (contentLen < 20) score -= 5;
  return score;
}

// Smart trim: keep system messages + highest-scoring messages up to budget
// But always keep the last `tailTurns` turns
function smartTrim(messages) {
  const budget = load();
  if (!messages || messages.length === 0) return messages;

  const systemMsgs = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  if (nonSystem.length <= budget.conversationInContext) return messages;

  // Calculate position bonus (recent = higher)
  const tailCount = budget.tailTurns * 2;
  const tailStart = Math.max(0, nonSystem.length - tailCount);
  const tail = nonSystem.slice(tailStart);
  const candidates = nonSystem.slice(0, tailStart);

  // Score candidates with position bonus
  const scored = candidates.map((m, i) => ({
    msg: m,
    score: importanceScore(m) + (i / candidates.length) * 20,
  })).sort((a, b) => b.score - a.score);

  // Budget calculation: rough estimate of tokens from characters
  const systemTokens = systemMsgs.reduce((s, m) => s + (m.content || '').length / 4, 0);
  const tailTokens = tail.reduce((s, m) => s + (m.content || '').length / 4, 0);
  const availableTokens = budget.maxContextTokens - budget.reservedTokens - systemTokens - tailTokens;
  const maxCandidatesChars = Math.max(0, availableTokens * 4);

  let keptChars = 0;
  const kept = [];
  for (const item of scored) {
    const charLen = (item.msg.content || '').length;
    if (keptChars + charLen <= maxCandidatesChars || kept.length < 3) {
      kept.push(item.msg);
      keptChars += charLen;
    }
  }

  // Sort kept messages back to original order
  const originalOrder = nonSystem.filter(m => kept.includes(m) || tail.includes(m));

  return [...systemMsgs, ...originalOrder];
}

// ── Token usage tracking ──────────────────────────────────────────────

function trackUsage(sessionId, tokens) {
  try {
    let usage = {};
    if (fs.existsSync(USAGE_FILE)) {
      usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    }
    if (!usage[sessionId]) {
      usage[sessionId] = { input: 0, output: 0, total: 0, count: 0, firstSeen: Date.now() };
    }
    const u = usage[sessionId];
    if (tokens.input) u.input += tokens.input;
    if (tokens.output) u.output += tokens.output;
    u.total = u.input + u.output;
    u.count++;
    u.lastSeen = Date.now();
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch {}
}

function getUsage(sessionId) {
  try {
    if (!fs.existsSync(USAGE_FILE)) return null;
    const usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    if (sessionId) return usage[sessionId] || null;
    return usage;
  } catch { return null; }
}

function getAllUsage() {
  return getUsage(null);
}

function formatUsage(u) {
  if (!u) return 'No data';
  const parts = [];
  if (u.total) parts.push(`${u.total} total`);
  if (u.input) parts.push(`${u.input} in`);
  if (u.output) parts.push(`${u.output} out`);
  if (u.count) parts.push(`${u.count} calls`);
  return parts.join(', ');
}

module.exports = {
  load,
  save,
  setPreset,
  getPresets,
  capToolOutput,
  capMcpDesc,
  trimMessages,
  trimMemory,
  trimSystemPrompt,
  trimProjectMemory,
  trimFileContent,
  trackUsage,
  getUsage,
  getAllUsage,
  formatUsage,
  PRESETS,
  BUDGET_FILE,
  USAGE_FILE,
  importanceScore,
  smartTrim,
};
