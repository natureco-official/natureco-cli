/**
 * natureco repl — Persistent Interactive REPL
 *
 * Özellikler:
 *   ✅ Cross-session hafıza (memory dosyası)
 *   ✅ Otomatik fact extraction (LLM konuşmadan öğrenir)
 *   ✅ Session resume (--resume ile kaldığın yerden devam)
 *   ✅ Tüm CLI komutları REPL içinden (/doctor, /cost, /audit, /team...)
 *   ✅ Slash komutlar (/help, /memory, /model, /system, /exit)
 *   ✅ Ctrl+C temiz çıkış, konuşma otomatik kayıt
 *   ✅ Persistent session list (~/.natureco/sessions.json)
 *   ✅ Token tracking
 *
 *   v4.6.0 — Persistent Memory Edition
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const chalk = require('chalk');
const tui = require('../utils/tui');
const { loadToolDefinitions, toOpenAIFormat, executeTool } = require('../utils/tools');
const { accumulateToolCallDeltas, finalizeToolCalls } = require('../utils/streaming-tools');
const { createPasteSafeInput, createOutputFilter, enableBracketedPaste, disableBracketedPaste, restoreNewlines, clearPasteContext } = require('../utils/paste-safe-input');
const { getMemoryStore } = require('../utils/memory-store');
const { buildSkillIndex } = require('../utils/skill-index');
const { buildTiers, assemble, discoverProjectRules } = require('../utils/system-prompt');
const { ToolGuardrails } = require('../utils/tool-guardrails');

// v5.4.6: Model adi sizintisini engelle — global'e ata, callback'lerden erisebilir olsun
const MODEL_NAMES_TO_HIDE = ['MiniMax-M2.5', 'MiniMaxM2.5', 'minimaxm25', 'Claude-3', 'GPT-4', 'ChatGPT'];
function fixModelNameLeak(text, botName) {
  if (!text) return text;
  let fixed = text;
  for (const modelName of MODEL_NAMES_TO_HIDE) {
    const regex = new RegExp(modelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    fixed = fixed.replace(regex, botName || 'asistan');
  }
  fixed = fixed.replace(/Ben\s+MiniMax[^.,!?\n]*/gi, 'Ben ' + (botName || 'asistan'));
  fixed = fixed.replace(/I'm\s+MiniMax[^.,!?\n]*/gi, "I'm " + (botName || 'asistan'));
  fixed = fixed.replace(/I am\s+Claude[^.,!?\n]*/gi, 'I am ' + (botName || 'asistan'));
  return fixed;
}
global.fixModelNameLeak = fixModelNameLeak;

// v4.8.0: Tool definitions — başlangıçta bir kez yükle (performans)
let _toolDefs = null;
function getToolDefs() {
  if (!_toolDefs) {
    try {
      _toolDefs = loadToolDefinitions();
    } catch (e) {
      _toolDefs = [];
    }
  }
  return _toolDefs;
}

// ── System prompt tier cache (Hermes-style prefix cache warmth) ────────────
// stable+context built once at session start, volatile rebuilt per turn.
let _cachedStable = '';
let _cachedContext = '';
let _cachedTierOpts = null; // opts snapshot for volatile-only rebuilds

function rebuildSystemPrompt(opts) {
  // If stable/context opts changed, rebuild them too
  const needsFullRebuild = !_cachedTierOpts ||
    _cachedTierOpts.botName !== opts.botName ||
    _cachedTierOpts.soulSummary !== opts.soulSummary ||
    _cachedTierOpts.skillsIndexBlock !== opts.skillsIndexBlock ||
    _cachedTierOpts.crossSessionContext !== opts.crossSessionContext ||
    _cachedTierOpts.projectRules !== opts.projectRules;
  
  if (needsFullRebuild || !_cachedStable) {
    const tiers = buildTiers(opts);
    _cachedStable = tiers.stable;
    _cachedContext = tiers.context;
    _cachedTierOpts = {
      botName: opts.botName,
      soulSummary: opts.soulSummary,
      skillsIndexBlock: opts.skillsIndexBlock,
      crossSessionContext: opts.crossSessionContext,
      projectRules: opts.projectRules,
    };
  }
  // Volatile always rebuilt fresh
  const volatileOnly = buildTiers({
    ...opts,
    // Pass empty strings for stable/context fields so buildTiers only builds volatile
    botName: '',
    soulSummary: '',
    skillsIndexBlock: '',
    crossSessionContext: '',
    projectRules: '',
  });
  return assemble(_cachedStable, _cachedContext, volatileOnly.volatile);
}

// ── Tool Guardrails instance (Hermes-style) ─────────────────────────────
const guardrails = new ToolGuardrails();

// CLI komutları (REPL içinden çalıştırılabilir)
const CLI_COMMANDS = {
  '/doctor':    { desc: 'Sistem sağlığı kontrolü', run: ['doctor'] },
  '/cost':      { desc: 'Maliyet takibi (today|week|month|budget)', run: ['cost', 'today'] },
  '/audit':     { desc: 'Audit log (today|stats|files)', run: ['audit', 'stats'] },
  '/team':      { desc: 'Multi-agent (list|status)', run: ['team', 'list'] },
  '/xp':        { desc: 'XP/Level durumu', run: ['xp'] },
  '/skills':    { desc: 'Yüklü skill listesi', run: ['skills', 'list'] },
  '/status':    { desc: 'Sistem durumu', run: ['status'] },
  '/mcp':       { desc: 'MCP sunucuları', run: ['mcp', 'list'] },
  '/channels':  { desc: 'Bağlı kanallar', run: ['channels'] },
  '/crons':     { desc: 'Cron görevleri', run: ['cron', 'list'] },
  '/bots':      { desc: 'Bot listesi', run: ['bots'] },
  '/models':    { desc: 'Modeller', run: ['models', 'list'] },
  '/memory-ls': { desc: 'Memory dosyaları', run: ['memory', 'list'] },
  '/seo':       { desc: 'SEO denetimi (URL gerek)', needsArg: true, run: ['seo', 'audit'] },
  '/naturehub': { desc: 'Nature Hub post (text gerek)', needsArg: true, run: ['naturehub', 'post'] },
  '/dashboard': { desc: 'Web dashboard başlat (port 7421)', run: ['dashboard', 'start'] },
};

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');
const SESSION_DIR = path.join(os.homedir(), '.natureco', 'sessions');
const SESSIONS_INDEX = path.join(os.homedir(), '.natureco', 'sessions.json');
const REPL_STATE = path.join(os.homedir(), '.natureco', 'repl-state.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.natureco', 'config.json'), 'utf8'));
  } catch { return {}; }
}

function isMiniMax(url) {
  return url && (url.includes('minimax.io') || url.includes('minimaxi.com') || url.includes('minimax.cn'));
}
function isGemini(url) {
  return url && (url.includes('generativelanguage.googleapis.com') || url.includes('gemini'));
}

function loadMemory(username) {
  const file = path.join(MEMORY_DIR, `${(username || 'default').toLowerCase()}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  return { name: username || 'Kullanıcı', nickname: null, botName: 'Asistan', facts: [], preferences: [], history: [] };
}

function saveMemory(username, memory) {
  ensureDir(MEMORY_DIR);
  const file = path.join(MEMORY_DIR, `${(username || 'default').toLowerCase()}.json`);
  memory.lastUpdated = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(memory, null, 2));
  return file;
}

function loadSessionsIndex() {
  try {
    if (fs.existsSync(SESSIONS_INDEX)) return JSON.parse(fs.readFileSync(SESSIONS_INDEX, 'utf8'));
  } catch {}
  return { sessions: [] };
}

function saveSessionsIndex(index) {
  fs.writeFileSync(SESSIONS_INDEX, JSON.stringify(index, null, 2));
}

function saveSession(messages, meta) {
  ensureDir(SESSION_DIR);
  const id = `sess-${Date.now().toString(36)}`;
  const file = path.join(SESSION_DIR, `${id}.json`);
  const data = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: messages.length,
    ...meta,
    messages: messages.filter(m => !m._internal),
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  // Index güncelle
  const idx = loadSessionsIndex();
  idx.sessions.unshift({
    id, file, createdAt: data.createdAt, messageCount: messages.length,
    firstUserMessage: messages.find(m => m.role === 'user')?.content?.slice(0, 60) || '(boş)',
  });
  // Son 50 session tut
  idx.sessions = idx.sessions.slice(0, 50);
  saveSessionsIndex(idx);
  return id;
}

function loadSession(id) {
  // ID veya index
  const idx = loadSessionsIndex();
  let meta;
  if (id === 'last' || id === 'latest') {
    meta = idx.sessions[0];
  } else {
    meta = idx.sessions.find(s => s.id === id || s.id.endsWith(id));
  }
  if (!meta) return null;
  try {
    return JSON.parse(fs.readFileSync(meta.file, 'utf8'));
  } catch { return null; }
}

function extractFacts(messages, currentFacts) {
  // Basit fact extraction: Türkçe/İngilizce pattern'lerle kullanıcı hakkında bilgi çıkar
  // Production'da LLM ile yapılabilir, şimdilik pattern matching
  const newFacts = [];
  const userMessages = messages.filter(m => m.role === 'user' && !m._internal);
  const existingValues = new Set((currentFacts || []).map(f => (f.value || f).toLowerCase()));

  for (const msg of userMessages) {
    const text = msg.content || '';
    const lower = text.toLowerCase();

    // İsim/tercih pattern'leri
    const patterns = [
      { re: /(?:benim adım|adım|I'm called|my name is)\s+([A-ZÇĞİÖŞÜa-zçğıöşü]+)/i, val: m => `Adı: ${m[1]}` },
      { re: /(?:yaşıyorum|yaşadığım|I live in)\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)/i, val: m => `Yaşadığı yer: ${m[1].trim()}` },
      { re: /(?:seviyorum|severim|sevdiğim|like|love)\s+(?:şu|bu)?\s*([a-zA-ZçğıöşüÇĞİÖŞÜ\s]{2,30})/i, val: m => `Sevdiği şey: ${m[1].trim()}` },
      { re: /(?:çalışıyorum|işim|mesleğim|I work as)\s+([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)/i, val: m => `Meslek: ${m[1].trim()}` },
    ];

    for (const p of patterns) {
      const m = text.match(p.re);
      if (m && m[1]) {
        const val = p.val(m);
        if (val && !existingValues.has(val.toLowerCase())) {
          newFacts.push({ value: val, score: 5, learnedAt: new Date().toISOString() });
          existingValues.add(val.toLowerCase());
        }
      }
    }
  }
  return newFacts;
}

function apiRequest(providerUrl, providerApiKey, body, stream = false, retries = 3) {
  return new Promise((resolve, reject) => {
    const isMM = isMiniMax(providerUrl);
    const endpoint = isMM
      ? `${providerUrl.replace(/\/+$/, '')}/v1/text/chatcompletion_v2`
      : isGemini(providerUrl)
        ? `${providerUrl.replace(/\/+$/, '')}/openai/chat/completions`
        : `${providerUrl.replace(/\/+$/, '')}/chat/completions`;
    const doRequest = (attempt) => {
      const req = https.request(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${providerApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }, (res) => {
        if (stream) { resolve(res); return; }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Parse hatası')); }
          } else if (res.statusCode === 429 && attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            setTimeout(() => doRequest(attempt + 1), delay);
          } else {
            const msg = res.statusCode === 429
              ? 'HTTP 429: API rate limit aşıldı. Lütfen bekleyin veya planınızı yükseltin.'
              : `HTTP ${res.statusCode}: ${data.slice(0, 200)}`;
            reject(new Error(msg));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.write(JSON.stringify(body));
      req.end();
    };
    doRequest(0);
  });
}

async function sendStreaming(providerUrl, providerApiKey, messages, model, onChunk, onToolCall) {
  const isMM = isMiniMax(providerUrl);
  const isGM = isGemini(providerUrl);
  const planMode = getPlanMode();

  const toolDefs = getToolDefs();
  // Inject plan mode virtual tools
  const planToolDefs = [
    {
      name: 'EnterPlanMode',
      description: 'Switch to plan-only mode. Research, explore, and create a detailed plan without making changes. Use ExitPlanMode when ready.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        if (planMode.enter()) return { result: 'Plan mode activated. You can now research and plan. No changes will be made. Use ExitPlanMode when your plan is ready.' };
        return { result: 'Already in plan mode.' };
      },
    },
    {
      name: 'ExitPlanMode',
      description: 'Exit plan mode and present your plan for review. The plan must include steps, files to modify, and expected changes.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'string', description: 'Markdown plan with ## Plan title, ### Step N sections listing files and changes' },
          summary: { type: 'string', description: 'One-sentence summary of the plan' },
        },
        required: ['plan'],
      },
      execute: async (args) => {
        const ok = planMode.exit(args.plan);
        if (!ok) return { error: 'Not in plan mode.' };
        return {
          result: `Plan submitted for review.\n\n${args.plan}`,
          _plan_summary: args.summary || '',
        };
      },
    },
  ];
  toolDefs.push(...planToolDefs);

  // Inject worktree virtual tools
  const wt = getWorktree();
  const worktreeToolDefs = [
    {
      name: 'EnterWorktree',
      description: 'Create an isolated worktree for experimental changes without affecting the main project. Use ExitWorktree to merge changes back.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Optional branch name for the worktree' },
        },
      },
      execute: async (args) => wt.enter(args),
    },
    {
      name: 'ExitWorktree',
      description: 'Exit the current worktree and merge changes back to the main branch.',
      parameters: {
        type: 'object',
        properties: {
          merge: { type: 'boolean', description: 'Merge changes back (default: true)' },
        },
      },
      execute: async (args) => wt.exit(args),
    },
  ];
  toolDefs.push(...worktreeToolDefs);

  // Inject tool-level virtual tools
  const { getTaskManager } = require('../utils/tasks');
  const taskMgr = getTaskManager();
  const toolVirtualTools = [
    {
      name: 'CreateTask',
      description: 'Run a command in the background. Returns immediately with a task ID. Use GetTaskResult or ListTasks to check status.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          timeout: { type: 'number', description: 'Timeout in ms (default: 300000)' },
        },
        required: ['command'],
      },
      execute: async (args) => taskMgr.create(args.command, args),
    },
    {
      name: 'ListTasks',
      description: 'List all background tasks with their status.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ tasks: taskMgr.list() }),
    },
    {
      name: 'GetTaskResult',
      description: 'Get the full result (stdout/stderr) of a completed or running task.',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string', description: 'Task ID' } },
        required: ['taskId'],
      },
      execute: async (args) => {
        const task = taskMgr.get(args.taskId);
        if (!task) return { error: 'Task not found' };
        return { result: task.stdout, error: task.stderr, status: task.status, exitCode: task.exitCode };
      },
    },
    {
      name: 'StopTask',
      description: 'Stop a running background task.',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string' } },
        required: ['taskId'],
      },
      execute: async (args) => taskMgr.stop(args.taskId),
    },
    {
      name: 'SearchSessions',
      description: 'Search past conversation sessions for information. Useful for finding previously discussed topics or decisions.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query' } },
        required: ['query'],
      },
      execute: async (args) => {
        const { search } = require('../utils/session-search');
        return { results: search(args.query, 5) };
      },
    },
    {
      name: 'RestoreFile',
      description: 'Restore a file from its snapshot history. Use FileHistory first to list available snapshots.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'File path to restore' },
          timestamp: { type: 'number', description: 'Snapshot timestamp (from FileHistory). If omitted, restores previous version.' },
        },
        required: ['filePath'],
      },
      execute: async (args) => {
        const fh = require('../utils/file-history');
        const snaps = fh.getHistory(args.filePath);
        if (snaps.length === 0) return { error: 'No history for this file' };
        const ts = args.timestamp || snaps[0].timestamp;
        return fh.restore(args.filePath, ts);
      },
    },
    {
      name: 'FileHistory',
      description: 'List snapshot history for a file, showing timestamps and sizes of previous versions.',
      parameters: {
        type: 'object',
        properties: { filePath: { type: 'string' } },
        required: ['filePath'],
      },
      execute: async (args) => {
        const fh = require('../utils/file-history');
        return { snapshots: fh.getHistory(args.filePath) };
      },
    },
    {
      name: 'UltraReview',
      description: 'Run a multi-focus code review (security, style, logic, performance) on specified files or git diff.',
      parameters: {
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'string' }, description: 'File paths to review' },
          diff: { type: 'string', description: 'Git diff content to review instead of files' },
        },
      },
      execute: async (args) => {
        const ur = require('../utils/ultra-review');
        if (args.diff) return ur.reviewDiff(args.diff);
        if (args.files) {
          const fs = require('fs');
          return {
            reviews: args.files.map(f => {
              const content = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
              return ur.reviewFile(f, content);
            }),
          };
        }
        return { error: 'Specify files or diff' };
      },
    },
    {
      name: 'ScheduleTask',
      description: 'Schedule a recurring task using cron expressions. E.g., "*/5 * * * *" for every 5 min.',
      parameters: {
        type: 'object',
        properties: {
          schedule: { type: 'string', description: 'Cron expression: min hour dom mon dow' },
          command: { type: 'string', description: 'Command to run' },
          description: { type: 'string', description: 'Optional description' },
        },
        required: ['schedule', 'command'],
      },
      execute: async (args) => require('../utils/cron').addJob(args),
    },
    {
      name: 'ListScheduledTasks',
      description: 'List all scheduled cron tasks.',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ jobs: require('../utils/cron').loadJobs() }),
    },
    {
      name: 'RemoveScheduledTask',
      description: 'Remove a scheduled task by ID.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: async (args) => {
        require('../utils/cron').removeJob(args.id);
        return { removed: true };
      },
    },
  ];
  toolDefs.push(...toolVirtualTools);

  const toolParam = toOpenAIFormat(toolDefs);
  guardrails.reset();

  let currentMessages = messages;
  let fullText = '';
  let iterations = 0;
  const MAX_TOOL_ITERATIONS = effortCfg.maxToolIterations;
  const MAX_CONTEXT_TOKENS = 32000; // safety limit before compression

  // v5.7.18: Preflight compression — if context too long, compress middle messages
  // (like Hermes' turn_context.py preflight)
  function preflightCompress(msgs) {
    const roughTokens = msgs.reduce((s, m) => s + Math.ceil(((m.content || '') + (m.role || '')).length / 4), 0);
    if (roughTokens <= MAX_CONTEXT_TOKENS || msgs.length < 6) return msgs;

    // Keep system prompt (first message) + last N turns (tail), compress middle
    const sysMsg = msgs[0] && msgs[0].role === 'system' ? msgs[0] : null;
    const tailCount = Math.min(6, Math.floor(msgs.length / 2));
    const startIdx = sysMsg ? 1 : 0;
    const tailStart = msgs.length - tailCount;

    const middle = msgs.slice(startIdx, tailStart);
    if (middle.length < 2) return msgs;

    // Summarize middle section
    const summary = '[' + middle.length + ' onceki mesaj ozetlendi]';
    const compressed = sysMsg ? [sysMsg] : [];
    compressed.push({ role: 'system', content: 'Gecmis konusma ozeti: ' + summary, _compressed: true });
    compressed.push(...msgs.slice(tailStart));
    return compressed;
  }

  // Apply preflight on entry
  currentMessages = preflightCompress(currentMessages);

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    // v5.7.18: Preflight compress before each iteration to prevent context bloat
    currentMessages = preflightCompress(currentMessages);
    const shouldStream = !isMM && !isGM; // MiniMax + Gemini non-stream (tool_calls reliability)
    // Inject plan mode prompt into system message
    const planModePrompt = planMode.getSystemPrompt();
    if (planModePrompt) {
      const sysIdx = currentMessages.findIndex(m => m.role === 'system');
      if (sysIdx >= 0) {
        const base = currentMessages[sysIdx].content;
        if (!base.endsWith(planModePrompt)) {
          currentMessages[sysIdx] = { ...currentMessages[sysIdx], content: base + '\n\n' + planModePrompt };
        }
      }
    } else {
      // Clean up any stale plan mode prompt from previous iterations
      const sysIdx = currentMessages.findIndex(m => m.role === 'system');
      if (sysIdx >= 0) {
        const base = currentMessages[sysIdx].content;
        const marker = '\n\nYou are in PLAN MODE.';
        if (base.includes(marker)) {
          currentMessages[sysIdx] = { ...currentMessages[sysIdx], content: base.split('\n\nYou are in PLAN MODE.')[0] };
        }
      }
    }

    const effortLevel = getEffortLevel(cfg);
    const effortCfg = getEffortConfig(effortLevel);
    const fallbackChain = getFallbackChain();

    const body = {
      model: fallbackChain.current || model,
      messages: currentMessages,
      stream: shouldStream,
      temperature: effortCfg.temperature,
      max_tokens: effortCfg.maxTokens,
    };
    // Structured output support
    const respFmt = getResponseFormat(cfg);
    if (respFmt) body.response_format = respFmt;
    if (toolParam) body.tools = toolParam;
    if (isMM || isGM) body.tool_choice = 'auto'; // MiniMax + Gemini için explicit

    if (!shouldStream) {
      // MiniMax (non-stream) — tool_calls desteklemiyor varsayalım
      const res = await apiRequest(providerUrl, providerApiKey, body, false);
      const msg = res.choices?.[0]?.message || {};
      const content = msg.content || '';
      for (const char of content) {
        onChunk(char);
        await new Promise(r => setTimeout(r, 8));
      }
      fullText = content;
      // Non-stream tool call desteği
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const toolResults = await processToolCalls(msg.tool_calls, onToolCall, rl.question.bind(rl));
        currentMessages.push(msg);
        currentMessages.push(...toolResults);
        continue; // Tekrar API çağır
      }
      break;
    }

    // OpenAI uyumlu streaming (veya MiniMax /v1/text/chatcompletion_v2)
    // v5.9.5: Gemini /openai/chat/completions — provider-detect.js buildChatEndpoint
    const endpoint = isMM
      ? `${providerUrl.replace(/\/+$/, '')}/v1/text/chatcompletion_v2`
      : isGemini(providerUrl)
        ? `${providerUrl.replace(/\/+$/, '')}/openai/chat/completions`
        : `${providerUrl.replace(/\/+$/, '')}/chat/completions`;
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const req = https.request(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${providerApiKey}`, 'Content-Type': 'application/json' },
          timeout: 60000,
        }, (res) => {
          if (res.statusCode !== 200) {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`)));
            return;
          }
          let buffer = '';
          let streamText = '';
          const toolCalls = []; // { index, id, name, args }
          res.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') {
                resolve({ streamText, toolCalls });
                return;
              }
              try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0];
                if (!choice) continue;
                const delta = choice.delta;

                // Text content
                if (delta.content) {
                  streamText += delta.content;
                  onChunk(delta.content);
                }

                // Tool calls (streaming delta) — shared accumulator,
                // see src/utils/streaming-tools.js for the per-index pattern.
                if (delta.tool_calls) {
                  accumulateToolCallDeltas(toolCalls, delta.tool_calls);
                }
              } catch {}
            }
          });
          res.on('end', () => resolve({ streamText, toolCalls }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(JSON.stringify(body));
        req.end();
      });
    } catch (err) {
      // Fallback chain: try next model on error
      const fb = fallbackChain.recordError(body.model, err);
      if (fb.fallback) {
        console.log(tui.C.yellow(`\n  ⚠ ${body.model} başarısız → ${fb.nextModel} deneniyor...\n`));
        continue; // Retry with next model
      }
      throw err;
    }

    fullText = result.streamText;

    // Tool call var mı? finalizeToolCalls drops empty entries + synthesizes ids,
    // so we only need to check the resulting length.
    const finalized = finalizeToolCalls(result.toolCalls);
    if (finalized.length > 0) {
      // Assistant mesajını ekle (tool_calls ile)
      currentMessages.push({
        role: 'assistant',
        content: result.streamText || null,
        tool_calls: finalized,
      });
      // Her tool call'ı çalıştır, sonuçları tool mesajı olarak ekle
      const toolResults = await processToolCalls(finalized, onToolCall, rl.question.bind(rl));
      currentMessages.push(...toolResults);

      // Plan mode review: plan submitted, wait for user approval
      if (planMode.inReview()) {
        const { plan } = planMode.planHistory[planMode.planHistory.length - 1] || {};
        console.log('\n' + tui.C.cyan('  📋 Plan sunuldu — onay bekleniyor...'));
        console.log(tui.C.muted('  ' + '─'.repeat(56)));
        console.log(plan ? `\n  ${plan.replace(/\n/g, '\n  ')}` : '');
        console.log('\n' + tui.C.muted('  ─'.repeat(28)));
        const approved = await new Promise(resolve => {
          rl.question(tui.C.yellow('  Planı onaylıyor musun? [Y=exec, n=reddet, e=düzenle]: '), answer => {
            const key = answer.trim().toLowerCase();
            if (key === 'n' || key === 'no') { planMode.reject(); resolve(false); }
            else if (key === 'e' || key === 'edit') { planMode.reject(); resolve('edit'); }
            else { planMode.approve(); resolve(true); }
          });
        });
        if (approved === true) {
          console.log(tui.C.green('  ✓ Plan onaylandı. Plan uygulanıyor...\n'));
          // Devam — model cevap versin
        } else if (approved === 'edit') {
          console.log(tui.C.yellow('  📝 Planı düzenleyin ve /plan ile yeniden gönderin.\n'));
          // Plan modunda kal, mesaj ekle
          currentMessages.push({ role: 'user', content: 'Planı düzenle ve yeniden sun.' });
          continue;
        } else {
          console.log(tui.C.amber('  ⨯ Plan reddedildi. Yeniden plan yapılıyor...\n'));
          currentMessages.push({ role: 'user', content: 'Plan reddedildi. Lütfen farklı bir yaklaşım dene.' });
          continue;
        }
      }

      // Devam — model sonuçları görsün, cevap versin
      continue;
    }

    break; // Tool call yok, çık
  }

  return fullText;
}

/**
 * Tool call'ları çalıştır, sonuçları OpenAI uyumlu tool mesajlarına dönüştür.
 * v5.7.18: Concurrent execution for parallel-safe tools + untrusted result wrapping.
 */
const UNTRUSTED_TOOLS = new Set(['browser', 'web_search', 'duckduckgo_search', 'searxng_search', 'exa_search', 'firecrawl', 'web_readability']);
const PARALLEL_SAFE_TOOLS = new Set(['read_file', 'file_search', 'grep_search', 'web_search', 'web_readability', 'duckduckgo_search', 'exa_search', 'searxng_search', 'firecrawl', 'memory_search', 'memory']);
const { checkPreHooks, runPostHooks, permissionSummary } = require('../utils/tool-hooks');
const { checkPermission, isApproved, markApproved, formatPermissionPrompt } = require('../utils/permissions');
const { getPlanMode } = require('../utils/plan-mode');
const { getWorktree } = require('../utils/worktree');
const { getLevel: getEffortLevel, getConfig: getEffortConfig } = require('../utils/effort-levels');
const { getResponseFormat, hasStructuredOutput } = require('../utils/structured-output');
const { getFallbackChain } = require('../utils/fallback-chain');

/**
 * Prompt user for permission approval.
 * Returns: true (once), 'session', 'persistent', or false (denied).
 */
async function askPermissionPrompt(question, hint, prompter) {
  const full = `${tui.C.yellow('⚠')} ${tui.C.bold('İzin gerekiyor')}: ${question}\n${tui.C.muted(hint)}`;
  return new Promise(resolve => {
    prompter(full, answer => {
      const key = answer.trim();
      if (key === 'y') resolve(true);          // once
      else if (key === 'Y') resolve('session'); // session
      else if (key === 'p') resolve('persistent'); // disk
      else if (key === 'a') { _permSessionCache.set('__ALL__', true); resolve(true); } // all (legacy)
      else resolve(false);                     // no
    });
  });
}

/** Session permission cache (for ask hooks) */
const _permSessionCache = new Map();


async function processToolCalls(toolCalls, onToolCall, onAsk) {
  const toolDefs = getToolDefs();
  const results = [];

  // Parse all tool calls first
  const parsed = toolCalls.map(tc => {
    const name = tc.function?.name || tc.name;
    const argsStr = tc.function?.arguments || tc.args || '{}';
    const id = tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let args = {};
    try {
      args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      args = { _parse_error: e.message, _raw: argsStr };
    }
    return { name, args, id };
  });

  // Filter out blocked tools via guardrails
  guardrails.startIteration();
  const blocked = parsed.filter(p => {
    const check = guardrails.check(p.name, p.args);
    if (check.blocked) {
      if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: check.reason } });
      results.push({ ...p, result: { error: check.reason }, _blocked: true });
      return false;
    }
    return true;
  });
  const allowed = parsed.filter(p => !results.some(r => r.id === p.id && r._blocked));

  // Separate parallel-safe and sequential tools (over allowed only)
  const parallelBatch = allowed.filter(p => PARALLEL_SAFE_TOOLS.has(p.name));
  const sequentialBatch = allowed.filter(p => !PARALLEL_SAFE_TOOLS.has(p.name));

  // Notify UI for all non-blocked
  for (const p of allowed) {
    if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'running' });
  }

  // Shared tool execution with: planCheck → permissions → hooks → execute → post-hooks
  async function executeOne(p) {
    // 0. Plan mode check
    const pm = getPlanMode();
    const planCheck = pm.checkTool(p.name, p.args);
    if (!planCheck.allowed) {
      const denied = { ...p, result: { error: planCheck.reason }, _plan_blocked: true };
      if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: planCheck.reason } });
      return denied;
    }
    pm.recordTool(p.name, p.args);

    // 1. Permission check (config-based granular rules)
    const perm = checkPermission(p.name, p.args);
    if (perm.action === 'deny') {
      const denied = { ...p, result: { error: perm.reason }, _perm_blocked: true };
      if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: perm.reason } });
      return denied;
    }
    if (perm.action === 'ask') {
      const permKey = `${perm.rule.raw}:${JSON.stringify(p.args)}`;
      if (!isApproved(permKey)) {
        const ok = await askPermissionPrompt(
          `${formatPermissionPrompt(p.name, p.args, perm.reason)}\n  ${perm.reason}`,
          `Bu işleme izin ver? [y=once, Y=session, p=persistent, n=no] `,
          onAsk
        );
        if (ok === 'persistent') markApproved(permKey, true);
        else if (ok === 'session') markApproved(permKey, false);
        else if (!ok) {
          const denied = { ...p, result: { error: `İzin reddedildi: ${perm.rule.raw}` }, _perm_blocked: true };
          if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: `İzin reddedildi: ${perm.rule.raw}` } });
          return denied;
        }
      }
    }

    // 2. Pre-hook check
    const hook = checkPreHooks(p.name, p.args);
    if (hook.action === 'deny') {
      const denied = { ...p, result: { error: hook.reason }, _hook_blocked: true };
      if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: hook.reason } });
      return denied;
    }
    if (hook.action === 'ask') {
      const ok = await askPermissionPrompt(
        permissionSummary(hook.rule, p.name, p.args),
        `Hook onayı [y=once, Y=session, n=no]: `,
        onAsk
      );
      if (!ok) {
        const denied = { ...p, result: { error: `Hook reddetti: ${hook.rule.raw}` }, _hook_blocked: true };
        if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: `Hook reddetti: ${hook.rule.raw}` } });
        return denied;
      }
    }

    const result = await executeTool(p.name, p.args, toolDefs);
    const success = result?.success !== false;
    guardrails.record(p.name, p.args, success);
    return { ...p, result: runPostHooks(p.name, p.args, result) };
  }

  // Run parallel batch concurrently
  if (parallelBatch.length > 0) {
    const parallelResults = await Promise.all(parallelBatch.map(executeOne));
    results.push(...parallelResults);
  }

  // Run sequential batch one at a time
  for (const p of sequentialBatch) {
    const r = await executeOne(p);
    results.push(r);
  }

  // No-progress check: if all tools failed, inject warning
  if (guardrails.isNoProgress()) {
    if (onToolCall) onToolCall({ name: '_no_progress', args: null, status: 'done', result: { error: 'All tools failed this iteration' } });
  }

  // Same-tool loop detection: if same tool called >3x this iteration (regardless of success)
  const toolCallCounts = {};
  for (const { name } of results) {
    toolCallCounts[name] = (toolCallCounts[name] || 0) + 1;
  }
  for (const [name, count] of Object.entries(toolCallCounts)) {
    if (count > 3) {
      const loopResult = results.find(r => r.name === name);
      if (loopResult && !loopResult.result?.error) {
        const warnContent = JSON.stringify({
          _loop_warning: true,
          message: `${name} called ${count}x this turn. If you're not making progress, try a different approach or report the result.`,
          tool: name, call_count: count,
        });
        results.push({ name: '_loop_warning', id: `loop_${Date.now()}`, result: { result: warnContent } });
      }
    }
  }

  // Notify UI done + build messages
  // v5.9.7: Skip internal meta-tools (_loop_warning, _no_progress) from tool messages
  //         Inject loop warning as user message instead (Gemini requires real tool names)
  //         Gemini also requires 'name' field in tool response messages
  const messages = [];
  for (const { name, id, result } of results) {
    if (onToolCall) onToolCall({ name, args: null, status: 'done', result });

    if (name === '_loop_warning' || name === '_no_progress') {
      if (name === '_loop_warning') {
        const warnContent = typeof result?.result === 'string' ? result.result : '';
        if (warnContent) messages.push({ role: 'user', content: '[System: ' + warnContent + ']' });
      }
      continue;
    }

    let content;
    if (result.error) {
      content = JSON.stringify({ error: result.error });
    } else {
      let raw = typeof result.result === 'string' ? result.result : JSON.stringify(result.result).slice(0, 8000);
      // v5.7.18: Untrusted result wrapping (Hermes-style prompt injection defense)
      if (UNTRUSTED_TOOLS.has(name)) {
        content = `<untrusted_tool_result source="${name}">\n${raw}\n</untrusted_tool_result>`;
      } else {
        content = raw;
      }
    }

    messages.push({ role: 'tool', tool_call_id: id, name, content });
  }

  return messages;
}

function printHelp() {
  console.log(chalk.cyan('\n  📚 REPL Komutları:\n'));
  console.log('  ' + chalk.yellow('/help'.padEnd(22)) + chalk.gray('Bu yardım'));
  console.log('  ' + chalk.yellow('/clear'.padEnd(22)) + chalk.gray('Ekranı temizle'));
  console.log('  ' + chalk.yellow('/history'.padEnd(22)) + chalk.gray('Bu oturumun geçmişi'));
  console.log('  ' + chalk.yellow('/memory'.padEnd(22)) + chalk.gray('Memory\'i göster'));
  console.log('  ' + chalk.yellow('/plan [on|off|show]'.padEnd(22)) + chalk.gray('Plan modu'));
  console.log('  ' + chalk.yellow('/forget'.padEnd(22)) + chalk.gray('Memory\'i temizle'));
  console.log('  ' + chalk.yellow('/sessions'.padEnd(22)) + chalk.gray('Geçmiş oturumları listele'));
  console.log('  ' + chalk.yellow('/resume [id|last]'.padEnd(22)) + chalk.gray('Önceki oturuma dön'));
  console.log('  ' + chalk.yellow('/system <text>'.padEnd(22)) + chalk.gray('System prompt değiştir'));
  console.log('  ' + chalk.yellow('/model <name>'.padEnd(22)) + chalk.gray('Model değiştir'));
  console.log('  ' + chalk.yellow('/identity [ad]'.padEnd(22)) + chalk.gray('Bot adını değiştir'));
  console.log('  ' + chalk.yellow('/tokens'.padEnd(22)) + chalk.gray('Token kullanımı'));
  console.log('  ' + chalk.yellow('/save'.padEnd(22)) + chalk.gray('Oturumu manuel kaydet'));
  console.log('  ' + chalk.yellow('/exit veya /quit'.padEnd(22)) + chalk.gray('Çıkış (Ctrl+C de çalışır)'));
  console.log(chalk.cyan('\n  🛠️  Tüm CLI Komutları (REPL içinden):\n'));
  for (const [cmd, info] of Object.entries(CLI_COMMANDS)) {
    console.log('  ' + chalk.yellow(cmd.padEnd(22)) + chalk.gray(info.desc));
  }
  console.log('');
}

function runCliCommand(args) {
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(__dirname, '..', '..', 'bin', 'natureco.js'), ...args], {
      stdio: 'inherit',
    });
    proc.on('close', (code) => resolve(code));
    proc.on('error', (e) => { console.log(chalk.red('  Hata: ' + e.message)); resolve(1); });
  });
}

async function startRepl(args) {
  ensureDir(MEMORY_DIR); ensureDir(SESSION_DIR);

  const cfg = getConfig();
  let providerUrl = cfg.providerUrl;
  let providerApiKey = cfg.providerApiKey;
  let model = cfg.providerModel;

  // Arg parse
  let resumeId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--model' && args[i + 1]) model = args[++i];
    if (args[i] === '--resume') resumeId = args[i + 1] || 'last';
  }

  if (!providerUrl || !providerApiKey) {
    console.log(chalk.red('\n  ❌ Provider ayarlı değil. Önce: natureco setup\n'));
    process.exit(1);
  }

  // Memory yükle
  let memory = loadMemory(cfg.userName);

  // v5.6.19: Oncelik config.botName, sonra memory.botName
  if (!memory.botName) {
    memory.botName = cfg.botName || 'Asistan';
  }
  // BotName'i memory'ye persist et (her oturumda ayni kalsin)
  try {
    const fs = require('fs');
    const memFile = path.join(os.homedir(), '.natureco', 'memory', ((cfg.userName || 'default').toLowerCase()) + '.json');
    if (fs.existsSync(memFile)) {
      const memData = JSON.parse(memFile, 'utf8');
      if (!memData.botName || memData.botName !== memory.botName) {
        memData.botName = memory.botName;
        fs.writeFileSync(memFile, JSON.stringify(memData, null, 2), 'utf8');
      }
    }
  } catch (e) {} // Sessizce devam et, kritik degil

  // v5.4.11: Sasuke Brain - Cross-session context otomatik yukle
  // REPL acildiginda son oturumdan 1-2 context mesaji al
  let crossSessionContext = '';
  try {
    const { listSessions, loadSession } = require('../utils/sessions-helper');
    if (listSessions && loadSession) {
      const sessions = listSessions(1);
      if (sessions && sessions.length > 0) {
        const lastSession = loadSession(sessions[0].id);
        if (lastSession && lastSession.messages && lastSession.messages.length > 0) {
          // Son 2 user message
          const lastUserMsgs = lastSession.messages
            .filter(m => m.role === 'user')
            .slice(-2);
          if (lastUserMsgs.length > 0) {
            crossSessionContext = '\n[KONUSMA GECMISI: ' + sessions[0].id + ']\n' +
              lastUserMsgs.map(m => 'User: ' + (m.content || '').slice(0, 100)).join('\n') + '\n[/GECMISI]\n';
          }
        }
      }
    }
  } catch (e) {
    // Cross-session yukleme basarisiz, devam et
  }
  // v5.4.12: 3 SOUL dosyasini birlestir (SOUL.md + IDENTITY.md + AGENTS.md)
  const { buildSoulContext, summarizeSoul } = require("../tools/soul");
  const soulSummary = buildSoulContext();  // 3 dosya birlesik ozet

  // v5.7.14: Hermes-style memory store (MEMORY.md / USER.md) + skill index
  const memoryStore = getMemoryStore();
  memoryStore.load();
  const memorySnapshotBlock = memoryStore.getSystemPromptBlock();
  const skillsIndexBlock = buildSkillIndex();

  // Resume?
  let messages = [];
  if (resumeId) {
    const session = loadSession(resumeId);
    if (session) {
      messages = session.messages || [];
      console.log(chalk.green(`\n  ✓ Oturum yüklendi: ${session.id} (${messages.length} mesaj)\n`));
    } else {
      console.log(chalk.yellow(`\n  ⚠️  Oturum bulunamadı: ${resumeId}\n`));
    }
  }

  // System prompt oluştur (memory + identity + persistent bağlam)
  // v5.6.5: Kucuk model tespiti (Groq, Mistral Small, Ollama) - SOUL injection skip
  const botName = memory.botName || 'Asistan';
  const userName = memory.name || memory.nickname || cfg.userName;
  const isSmallModel = (cfg.providerUrl || '').includes('groq.com') || 
                       (cfg.providerUrl || '').includes('mistral.ai') ||
                       (cfg.providerUrl || '').includes('localhost') ||
                       (cfg.providerUrl || '').includes('ollama');
  // Discover project rules (CLAUDE.md)
  const projectRules = discoverProjectRules(process.cwd());
  if (projectRules) {
    console.log(chalk.cyan(`  📋 Proje kurallari bulundu (CLAUDE.md)\n`));
  }

  // Build system prompt with tier caching (stable+context cached, volatile fresh)
  const promptOpts = {
    botName, userName, soulSummary, isSmallModel,
    memorySnapshotBlock, skillsIndexBlock, projectRules,
    crossSessionContext: crossSessionContext || '',
    userHome: cfg.userHome || '',
    hasHistory: messages.length > 0,
    memoryFacts: memory.facts || [],
  };
  let systemPrompt = rebuildSystemPrompt(promptOpts);

  if (messages.length === 0) {
    messages.push({ role: 'system', content: systemPrompt, _internal: true });
  } else {
    // Resume: system prompt'u güncelle (memory değişmiş olabilir)
    const sysIdx = messages.findIndex(m => m._internal);
    if (sysIdx >= 0) messages[sysIdx] = { role: 'system', content: systemPrompt, _internal: true };
    else messages.unshift({ role: 'system', content: systemPrompt, _internal: true });
  }

  // Header
  console.log('');
  console.log(tui.styled('  🌿 NatureCo REPL · Persistent Sohbet', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
  console.log(tui.C.muted('  Provider: ') + tui.C.brand(providerUrl.replace(/https?:\/\//, '')));
  console.log(tui.C.muted('  Model:    ') + tui.C.brand(model));
  console.log(tui.C.muted('  Kullanıcı: ') + tui.C.brand((memory.nickname || cfg.userName) + (memory.nickname ? ` (${cfg.userName})` : '')));
  console.log(tui.C.muted('  Bot:      ') + tui.C.brand(memory.botName || 'Asistan'));
  if (messages.length > 1) {
    console.log(tui.C.muted('  Oturum:   ') + tui.C.amber(`${messages.filter(m => m.role === 'user' || m.role === 'assistant').length} mesaj (resume)`));
  }
  console.log(tui.C.muted('  Komutlar: ') + tui.C.yellow('/help') + tui.C.muted(' · ') + tui.C.yellow('/memory') + tui.C.muted(' · ') + tui.C.yellow('/sessions') + tui.C.muted(' · ') + tui.C.yellow('/exit'));
  console.log('');
  // v5.4.7: Hard-coded kimlik — v5.14.5: memory fact'lerinden kullanici adini tespit et
  const displayBotName = memory.botName || 'Asistan';
  const nameFromFact = (() => {
    const facts = memory.facts || [];
    for (const f of facts) {
      const v = (f.value || f || '').trim();
      const lv = v.toLowerCase();
      const match = lv.match(/(?:kullanici\s*adi?|kullanıcı\s*adı?|isim|name)\s*:?\s*(.+)/);
      if (match && match[1].trim().length > 2) return match[1].trim();
    }
    return null;
  })();
  const displayUserName = memory.name || nameFromFact || memory.nickname || cfg.userName;
  console.log(tui.C.brand('  👋 Ben ' + displayBotName + ', ' + displayUserName + '. Sen nasilsin?'));
  console.log('');

  // v5.4.14: SOUL'dan onemli bilgileri de goster
  if (soulSummary) {
    const soulPreview = soulSummary.split('\n').slice(0, 3).join(' ').substring(0, 200);
    if (soulPreview) {
      console.log(tui.C.muted('  📜 ' + soulPreview + '...'));
      console.log('');
    }
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  enableBracketedPaste(process.stdout);

  const rl = readline.createInterface({
    input: createPasteSafeInput(process.stdin),
    output: createOutputFilter(process.stdout),
    prompt: tui.styled('\n  You  ', { color: tui.PALETTE.primary, bold: true }),
    terminal: true,
  });
  rl.prompt();

  const cleanup = async (exitCode = 0) => {
    if (messages.length > 1) {
      // v5.4.10: Once oturumdaki butun conversation'i memory'ye persist et
      // Bu, Parton'un "oturum sonunda konusmalar kaydedilmiyor" sikayetini cözüyor
      const persistResult = await persistSessionToMemory(messages, memory, cfg);
      if (persistResult && persistResult.factsAdded > 0) {
        console.log(chalk.gray(`\n  🧠 ${persistResult.factsAdded} yeni fact memory'ye kaydedildi`));
      }
      if (persistResult && persistResult.preferencesAdded > 0) {
        console.log(chalk.gray(`  🎯 ${persistResult.preferencesAdded} yeni tercih kaydedildi`));
      }

      const sessId = saveSession(messages, {
        provider: providerUrl, model, user: cfg.userName,
        bot: memory.botName, factCount: memory.facts?.length || 0,
      });
      console.log(chalk.gray(`\n  💾 Oturum kaydedildi: ${sessId}`));
    }
    // Global buffer temizle
    if (global._fixBuffer) global._fixBuffer = '';
    disableBracketedPaste(process.stdout);
    console.log(chalk.gray('\n  👋 Görüşürüz!\n'));
    process.exit(exitCode);
  };

  /**
   * v5.4.10: Oturum sonunda conversation'dan otomatik fact/preference extraction
   * Bu, kullanıcının "her çıkışta konuşmalar kaydedilmiyor" sikayetini çözer
   */
  async function persistSessionToMemory(messages, memory, cfg) {
    let factsAdded = 0;
    let preferencesAdded = 0;

    try {
      // Pattern-based extraction (zaten extractFacts var)
      const newFacts = extractFacts(messages, memory.facts || []);

      // Bazi user message'lari da tara — genel kalıplarla fact çıkar
      const userMessages = messages.filter(m => m.role === 'user' && !m._internal);
      for (const msg of userMessages) {
        const text = (msg.content || '').toLowerCase();

        // BotName hatirlatmasi
        if (text.includes('ad') && (text.includes('adin') || text.includes('ismin'))) {
          // Bot adı sorgulanmış olabilir, mevcut adı koru
        }

        // Kisilik tercihleri (genel pattern'ler)
        const prefPatterns = [
          { match: /(?:benim ad[ıi]m?|bana\s+.*de|ad[ıi]m?)\s+(\w+)/i, category: 'personal', key: 'ad' },
          { match: /(?:seviyorum|hoşlan[ıi]yorum|beğeniyorum)\s+(\w+)/i, category: 'preference', key: 'sevilen' },
          { match: /(?:yaşıyorum|oturuyorum|kalıyorum)\s+(\w+)/i, category: 'location', key: 'yer' },
        ];
        for (const p of prefPatterns) {
          const m2 = msg.content.match(p.match);
          if (m2) {
            const val = m2[1].toLowerCase();
            const fact = `Kullanici ${p.key}: ${val}`;
            if (!(memory.facts || []).some(f => f.value === fact)) {
              newFacts.push({ value: fact, score: 6, category: p.category, createdAt: new Date().toISOString() });
            }
          }
        }
      }

      // Deduplicate
      const existingValues = new Set((memory.facts || []).map(f => (f.value || f).toLowerCase()));
      const uniqueFacts = newFacts.filter(f => !existingValues.has((f.value || f).toLowerCase()));

      if (uniqueFacts.length > 0) {
        memory.facts = [...(memory.facts || []), ...uniqueFacts];
        // v5.4.10: Verification ile kaydet
        const memFile = path.join(MEMORY_DIR, (cfg.userName || 'default').toLowerCase() + '.json');
        memory.lastUpdated = new Date().toISOString();
        fs.writeFileSync(memFile, JSON.stringify(memory, null, 2), 'utf8');
        // Verification: geri oku
        const verify = JSON.parse(fs.readFileSync(memFile, 'utf8'));
        factsAdded = uniqueFacts.length;
      }

      // Decay (eski fact'leri dusuk skora dusur)
      if (memory.facts && memory.facts.length > 15) {
        // Max 15 fact tut, en dusuk skorlu olanlari sil
        memory.facts.sort((a, b) => (b.score || 5) - (a.score || 5));
        memory.facts = memory.facts.slice(0, 15);
      }
    } catch (e) {
      // Sessizce devam et, kritik degil
    }

    return { factsAdded, preferencesAdded };
  }

  rl.on('SIGINT', () => cleanup(0));
  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));

  rl.on('line', async (input) => {
    const line = restoreNewlines(input).trim();
    if (!line) { rl.prompt(); return; }

    // Çok satırlı paste: output filter'a echo'yu durdurma sinyalini ver
    clearPasteContext();

    // Slash komutlar
    if (line.startsWith('/')) {
      const parts = line.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      switch (cmd) {
        case 'help': printHelp(); break;
        case 'clear': console.clear(); break;
        case 'exit': case 'quit': case 'q': await cleanup(0); return;
        case 'history':
          console.log(chalk.cyan('\n  📜 Bu oturumun geçmişi:\n'));
          for (const m of messages.filter(m => !m._internal)) {
            const role = m.role === 'user' ? chalk.green('You') : chalk.blue('AI  ');
            const content = (m.content || '').slice(0, 120) + ((m.content || '').length > 120 ? '...' : '');
            console.log(`  ${role}  ${content}`);
          }
          console.log('');
          break;
        case 'memory':
          console.log(chalk.cyan('\n  🧠 Memory:\n'));
          console.log('  Kullanıcı: ' + chalk.cyan(memory.name));
          console.log('  Nickname: ' + chalk.cyan(memory.nickname || '(yok)'));
          console.log('  Bot: ' + chalk.cyan(memory.botName || 'Asistan'));
          if (memory.facts && memory.facts.length > 0) {
            console.log('  Facts (' + memory.facts.length + '):');
            for (const f of memory.facts) {
              console.log('    • ' + chalk.gray((f.value || f) + (f.score ? ' [skor:' + f.score + ']' : '')));
            }
          } else {
            console.log(chalk.gray('  (Henüz fact yok)'));
          }
          console.log('');
          break;
        case 'forget':
          try {
            if (fs.existsSync(path.join(MEMORY_DIR, `${(cfg.userName || 'default').toLowerCase()}.json`))) {
              fs.unlinkSync(path.join(MEMORY_DIR, `${(cfg.userName || 'default').toLowerCase()}.json`));
            }
            memory = { name: cfg.userName, nickname: null, botName: 'Asistan', facts: [], preferences: [], history: [] };
            // System prompt'u rebuild with cleared memory
            promptOpts.memoryFacts = [];
            memoryStore.clear();
            promptOpts.memorySnapshotBlock = memoryStore.getSystemPromptBlock();
            systemPrompt = rebuildSystemPrompt(promptOpts);
            messages[0] = { role: 'system', content: systemPrompt, _internal: true };
            console.log(chalk.green('  ✓ Memory temizlendi'));
          } catch (e) {
            console.log(chalk.red('  ❌ ' + e.message));
          }
          break;
        case 'sessions':
          const idx = loadSessionsIndex();
          console.log(chalk.cyan('\n  📚 Geçmiş Oturumlar (' + idx.sessions.length + ')\n'));
          for (let i = 0; i < Math.min(10, idx.sessions.length); i++) {
            const s = idx.sessions[i];
            console.log(`  ${chalk.gray((i + 1).toString().padStart(2) + '.')} ${chalk.cyan(s.id)} ${chalk.muted('— ' + s.firstUserMessage)}`);
          }
          console.log(chalk.gray('\n  Devam etmek için: /resume <id> veya /resume last\n'));
          break;
        case 'resume':
          if (!arg) { console.log(chalk.yellow('  Kullanım: /resume <id> veya /resume last')); break; }
          const session = loadSession(arg);
          if (session) {
            messages = session.messages || [];
            const sysIdx = messages.findIndex(m => m._internal);
            if (sysIdx >= 0) messages[sysIdx] = { role: 'system', content: systemPrompt, _internal: true };
            else messages.unshift({ role: 'system', content: systemPrompt, _internal: true });
            console.log(chalk.green(`  ✓ Oturum yüklendi: ${session.id} (${messages.length} mesaj)`));
          } else {
            console.log(chalk.yellow(`  ⚠️  Oturum bulunamadı: ${arg}`));
          }
          break;
        case 'system':
          if (!arg) { console.log(chalk.yellow('  Kullanım: /system <text>')); break; }
          // Override stable tier directly (user's custom text)
          _cachedStable = arg;
          // Rebuild volatile only (context stays unchanged)
          memoryStore.load();
          promptOpts.memorySnapshotBlock = memoryStore.getSystemPromptBlock();
          promptOpts.memoryFacts = memory.facts || [];
          const volOpts = { ...promptOpts, botName: '', soulSummary: '', skillsIndexBlock: '', crossSessionContext: '' };
          const volTiers = buildTiers(volOpts);
          systemPrompt = assemble(_cachedStable, _cachedContext, volTiers.volatile);
          messages[0] = { role: 'system', content: systemPrompt, _internal: true };
          console.log(chalk.green('  ✓ System prompt güncellendi'));
          break;
        case 'model':
          if (!arg) { console.log(chalk.yellow('  Kullanım: /model <name>')); break; }
          model = arg;
          console.log(chalk.green('  ✓ Model: ') + chalk.cyan(model));
          break;
        case 'identity':
          if (!arg) { console.log(chalk.yellow(`  Mevcut: ${memory.botName || 'Asistan'}`)); break; }
          memory.botName = arg;
          saveMemory(cfg.userName, memory);
          // Rebuild stable tier with new botName
          promptOpts.botName = arg;
          _cachedTierOpts = null; // force full rebuild
          memoryStore.load();
          promptOpts.memorySnapshotBlock = memoryStore.getSystemPromptBlock();
          promptOpts.memoryFacts = memory.facts || [];
          systemPrompt = rebuildSystemPrompt(promptOpts);
          messages[0] = { role: 'system', content: systemPrompt, _internal: true };
          console.log(chalk.green('  ✓ Bot adı: ') + chalk.cyan(arg));
          break;
        case 'tokens':
          console.log(chalk.gray(`  Token: ~${totalInputTokens} in / ~${totalOutputTokens} out`));
          break;
        case 'plan':
          if (arg === 'on' || arg === 'enter') {
            if (planMode.enter()) console.log(tui.C.cyan('\n  📋 Plan modu aktif. Plan yapın ve /plan off ile çıkın.\n'));
            else console.log(tui.C.yellow('  Zaten plan modunda.'));
          } else if (arg === 'off' || arg === 'exit') {
            if (planMode.isPlanning()) {
              console.log(tui.C.yellow('  Plan modundan çıkılıyor. Plan yazılıp ExitPlanMode ile sunulmalı.'));
              planMode.approve();
            } else {
              console.log(tui.C.yellow('  Plan modunda değil.'));
            }
          } else if (arg === 'show') {
            if (planMode.planHistory.length > 0) {
              const last = planMode.planHistory[planMode.planHistory.length - 1];
              console.log(tui.C.cyan('\n  📋 Son Plan:\n'));
              console.log(`  ${last.plan.replace(/\n/g, '\n  ')}`);
            } else {
              console.log(tui.C.yellow('  Henüz plan yok.'));
            }
          } else {
            console.log(tui.C.yellow('  Kullanım: /plan on|off|show'));
          }
          break;
        case 'save':
          const sessId = saveSession(messages, {
            provider: providerUrl, model, user: cfg.userName, bot: memory.botName,
          });
          console.log(chalk.green('  ✓ Kaydedildi: ') + chalk.cyan(sessId));
          break;
        default:
          // CLI komutları (REPL içinden)
          if (CLI_COMMANDS['/' + cmd]) {
            const cliCmd = CLI_COMMANDS['/' + cmd];
            if (cliCmd.needsArg && !arg) {
              console.log(chalk.yellow(`  ${cmd} bir argüman gerekli: ${cliCmd.desc}`));
            } else {
              console.log(chalk.gray(`  → ${cmd} çalıştırılıyor...`));
              const args2 = [...cliCmd.run];
              if (arg && (cmd === 'seo' || cmd === 'naturehub')) args2.push(arg);
              await runCliCommand(args2);
            }
          } else {
            console.log(chalk.yellow(`  Bilinmeyen komut: /${cmd}. /help yazın.`));
          }
      }
      rl.prompt();
      return;
    }

    // User mesajı
    messages.push({ role: 'user', content: line });

    // Çok satırlı (paste) mesajları gönderildikten sonra ekranda göster
    if (line.indexOf('\n') !== -1) {
      process.stdout.write(tui.styled('  You  ', { color: tui.PALETTE.primary, bold: true }));
      process.stdout.write(line + '\n');
    }

    // v5.6.8: Hard-coded fallback - "sen kimsin?" sorulari icin dinamik botName
    const trimmed = (line || '').toLowerCase();
    const isIdentityQuestion = /(sen\s+kim|adin\s+ne|kendini\s+tan|kendin\s+tanit|kimsin|ne\s+adindasin)/.test(trimmed);
    if (isIdentityQuestion) {
      // v5.6.10: Hard-coded prefix minimal - model cevabini bozuyordu
      // Once sadece isim yaz, modelin devamini getirsin
      const displayName = memory.botName || 'Asistan';
      process.stdout.write(tui.styled('\n  AI   ', { color: tui.PALETTE.secondary, bold: true }));
      process.stdout.write('Merhaba! Ben ' + displayName + '. ');
    }

    // AI cevabı — v5.13.0: workflow orchestrator ALWAYS first
    process.stdout.write(tui.styled('\n  AI   ', { color: tui.PALETTE.secondary, bold: true }));
    try {
      // Per-turn: rebuild volatile tier with current memory snapshot
      guardrails.reset();
      memory = loadMemory(cfg.userName);
      memoryStore.load();
      promptOpts.memorySnapshotBlock = memoryStore.getSystemPromptBlock();
      promptOpts.memoryFacts = memory.facts || [];
      systemPrompt = rebuildSystemPrompt(promptOpts);
      messages[0] = { role: 'system', content: systemPrompt, _internal: true };

      // v5.13.0: Run workflow FIRST for every request
      process.stdout.write(tui.styled('\r  🔧 workflow...  ', { color: tui.PALETTE.muted }));
      const wfToolDefs = getToolDefs();
      const wfResult = await executeTool('workflow', { action: 'run', task: line }, wfToolDefs);
      const wf = wfResult?.result || {};
      if (wf.success !== false) {
        const loaded = wf.skillsLoaded && wf.skillsLoaded.length > 0 ? ` [skill: ${wf.skillsLoaded.join(', ')}]` : '';
        process.stdout.write(tui.styled(`  ✓ workflow${loaded}\n`, { color: tui.PALETTE.success }));
      } else {
        process.stdout.write(tui.styled('  ✗ workflow\n', { color: tui.PALETTE.danger }));
      }

      if (wf.passthrough && wf.reply !== undefined && wf.reply !== null) {
        // Simple chat — workflow handled it directly
        const fullReply = String(wf.reply);
        const displayBotName = memory.botName || 'Asistan';
        let fixedReply = String(fullReply);
        fixedReply = fixedReply.replace(/\bMiniMax[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bM2\.5[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bM2[\s\-\.\w\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bClaude[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bGPT[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bChatGPT\b/g, displayBotName);
        fixedReply = fixedReply.replace(/NatureCo\s+CLI(\s*'in|'nin)?/gi, displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+MiniMax[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+Claude[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+GPT[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+Asistan[\s\w\.]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/\*\*(?:MiniMax|Claude|GPT|M2\.5|M2)[^\*]*\*\*/gi, '**' + displayBotName + '**');
        process.stdout.write('\n' + fixedReply + '\n');
        messages.push({ role: 'assistant', content: fixedReply });
        totalInputTokens += Math.ceil(line.length / 4);
        totalOutputTokens += Math.ceil(fullReply.length / 4);
      } else if (wf.status === 'completed' || (wf.results && wf.results.length > 0)) {
        // Complex task — inject workflow report as context, then LLM crafts final reply
        const workflowSteps = wf.results || [];
        const report = workflowSteps.map(r => {
          const t = r.tool || r.name || '?';
          const s = r.status === 'done' ? '✓' : '✗';
          let summary = '';
          if (r.result) {
            try { summary = typeof r.result === 'string' ? r.result.slice(0, 400) : JSON.stringify(r.result).slice(0, 400); } catch {}
          }
          return `  ${s} ${t}: ${summary}`;
        }).join('\n');
        const skillInfo = wf.skillsLoaded && wf.skillsLoaded.length > 0
          ? `\n\nKullanilan skill'ler: ${wf.skillsLoaded.join(', ')}`
          : '';
        const preWfLen = messages.length;
        messages.push({
          role: 'system',
          content: `=== WORKFLOW SONUCLARI ===\nSu araclar calisti:\n${report}${skillInfo}\n\nKullaniciya bu sonuclari anlamli bir sekilde ozetle.\n=== SONUC BITTI ===`,
        });
        const reply = await sendStreaming(
        providerUrl,
        providerApiKey,
        messages,
        model,
        // v5.6.12: Callback bos - tam metin 'reply' olarak gelecek (non-stream mode)
        () => {},
        // Tool call callback — Hermes-style per-tool status line
        ((toolEvent) => {
          const name = toolEvent.name;
          if (toolEvent.status === 'running') {
            process.stdout.write(tui.styled('\r  🔧 ' + name + '...  ', { color: tui.PALETTE.muted }));
          } else if (toolEvent.status === 'done') {
            if (toolEvent.result?.error) {
              process.stdout.write(tui.styled('  ✗ ' + name + ': ' + String(toolEvent.result.error).slice(0, 80) + '\n', { color: tui.PALETTE.danger }));
            } else {
              process.stdout.write(tui.styled('  ✓ ' + name + '\n', { color: tui.PALETTE.success }));
            }
          }
        })
      );
        // Remove workflow results message (already served its purpose)
        messages.splice(preWfLen, 1);
        // v5.6.12: Tam metin 'reply' olarak zaten geldi (non-stream mode)
        const fullReply = String(reply || '');
        // Bot adini al
        const displayBotName = memory.botName || 'Asistan';
        // v5.6.9: Tum model adlarini ve varyasyonlari temizle
        let fixedReply = String(fullReply);
        fixedReply = fixedReply.replace(/\bMiniMax[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bM2\.5[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bM2[\s\-\.\w\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bClaude[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bGPT[-\s\w\.\d]*/gi, displayBotName);
        fixedReply = fixedReply.replace(/\bChatGPT\b/g, displayBotName);
        fixedReply = fixedReply.replace(/NatureCo\s+CLI(\s*'in|'nin)?/gi, displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+MiniMax[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+Claude[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+GPT[^.!?,;:\n]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/Ben\s+Asistan[\s\w\.]*/gi, 'Ben ' + displayBotName);
        fixedReply = fixedReply.replace(/\*\*(?:MiniMax|Claude|GPT|M2\.5|M2)[^\*]*\*\*/gi, '**' + displayBotName + '**');
        process.stdout.write('\n' + fixedReply + '\n');
        messages.push({ role: 'assistant', content: fixedReply });
        totalInputTokens += Math.ceil(((fullReply || '') + report + skillInfo).length / 4);
        totalOutputTokens += Math.ceil((fullReply || '').length / 4);
      } else {
        // Workflow failed or returned unexpected format
        const fullReply = wf.error || JSON.stringify(wf).slice(0, 400) || 'Workflow islenemedi.';
        const displayBotName = memory.botName || 'Asistan';
        let fixedReply = fullReply.replace(/\bMiniMax[-\s\w\.\d]*/gi, displayBotName);
        process.stdout.write('\n' + fixedReply + '\n');
        messages.push({ role: 'assistant', content: fixedReply });
        totalInputTokens += Math.ceil(line.length / 4);
        totalOutputTokens += Math.ceil(fixedReply.length / 4);
      }
    } catch (err) {
      process.stdout.write('\n');
      console.log(chalk.red('  ❌ ' + err.message));
    }
    rl.prompt();
  });

  rl.on('close', () => cleanup(0));
}

module.exports = startRepl;
