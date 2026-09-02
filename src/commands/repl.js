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

/**
 * v5.40: Oturum-sonu pattern-tabanli isim/tercih cikarimi — SAF fonksiyon (test
 * edilebilir; regresyon kilidi). Eskiden persistSessionToMemory icinde gomuluydu
 * ve "ad[ıi]m?" (m OPSIYONEL) pattern'i "kod adı", "proje adı", "dosya adı" gibi
 * MASUM tamlamalari "kullanici adi" saniyor + degeri lowercase/\w ile bozuyordu
 * ("gizli kod adı ZEPHYR-9" → "Kullanici ad: zephyr"). Bu, agent memory_write ile
 * DOGRU kaydetse bile uzerine YANLIS fact yazip cross-session recall'i bozuyordu.
 * @param {string} content  Kullanici mesaji (orijinal case)
 * @returns {Array<{key:string, category:string, value:string}>}
 */
function extractPreferenceFacts(content) {
  const patterns = [
    // ad: "benim adım X" / "adım X" / "ismim X" — m ZORUNLU; "kod adı" (adı) YAKALANMAZ.
    { match: /(?:benim\s+ad[ıi]m|(?:^|\s)ad[ıi]m|[iı]smim)\s+([A-Za-zÇĞİÖŞÜçğıöşü][\wÇĞİÖŞÜçğıöşü.-]*)/i, category: 'personal', key: 'ad' },
    // tercih/konum: nesne fiilden ONCE gelir (TR) — deger orijinal case korunur.
    { match: /([A-Za-zÇĞİÖŞÜçğıöşü][\wÇĞİÖŞÜçğıöşü.-]*)['’]?[ıi]?\s*(?:seviyorum|hoşlan[ıi]yorum|beğeniyorum)/i, category: 'preference', key: 'sevilen' },
    { match: /([A-Za-zÇĞİÖŞÜçğıöşü][\wÇĞİÖŞÜçğıöşü.-]*)['’]?[dt][ae]\s+(?:yaşıyorum|oturuyorum|kalıyorum)/i, category: 'location', key: 'yer' },
  ];
  const out = [];
  for (const p of patterns) {
    const m = (content || '').match(p.match);
    if (m) out.push({ key: p.key, category: p.category, value: `Kullanici ${p.key}: ${m[1].trim()}` });
  }
  return out;
}
const chalk = require('chalk');
const { abonelikKipi, abonelikBagla, saglayiciAdi } = require('../utils/abonelik-baglayici');
const { extractReasoningDelta } = require('../utils/reasoning-models');
const { getLang: _getLang } = require('../utils/i18n');
const L = (tr, en) => (_getLang() === 'en' ? en : tr);
const tui = require('../utils/tui');
const { loadToolDefinitions, toOpenAIFormat, executeTool } = require('../utils/tools');
const { accumulateToolCallDeltas, finalizeToolCalls } = require('../utils/streaming-tools');
const { createPasteSafeInput, createOutputFilter, enableBracketedPaste, disableBracketedPaste, restoreNewlines, clearPasteContext } = require('../utils/paste-safe-input');
const { getMemoryStore } = require('../utils/memory-store');
const { buildSkillIndex } = require('../utils/skill-index');
const { buildTiers, assemble, discoverProjectRules } = require('../utils/system-prompt');
const { AgentCore } = require('../utils/agent-core');
const { foldTr } = require('../utils/tr-text');

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
//
// KOPYA DÖNDÜRÜR, önbelleğin kendisini DEĞİL. Çağıranlar (sendStreaming,
// processToolCalls) dönen diziye plan/worktree/sanal araçları ve enable_tools'u
// push ediyor. Önbelleğin referansı döndürülürse bu eklemeler kalıcı olur ve
// HER TURDA birikir: ikinci mesajda iki `enable_tools`, beşincide beş tane
// sağlayıcıya gider. enable_tools `_alwaysExpose: true` olduğu için her zaman
// sunulur ve ne tool-profile ne formatToolsForOpenAI tekilleştirme yapar —
// OpenAI uyumlu sağlayıcıların çoğu yinelenen fonksiyon adında 400 döner.
// Ayrıca dizi oturum boyunca sınırsız büyür.
//
// code_v5.js:641 bu tuzağa düşmüyor çünkü her turda loadToolDefinitions()'ı
// yeniden çağırıyor. Burada önbellek korunuyor (yükleme maliyeti gerçek),
// yalnızca dışarıya sığ kopya veriliyor.
let _toolDefs = null;

// Yapılandırılmış MCP sunucularının araçları.
//
// REPL araç listesini yalnızca yerleşik manifestten (`loadToolDefinitions`)
// kuruyordu, bu yüzden `natureco chat` içinde HİÇBİR MCP sunucusu görünmüyordu —
// `natureco code` (code_v5.js) `loadMcpToolDefinitions()` çağırdığı için orada
// çalışıyordu. Kullanıcı açısından: sunucuyu doğru yapılandırıp hiçbir araç
// göremiyorsun ve ortada hata da yok.
//
// Yükleme async; getToolDefs ise senkron ve birçok yerden çağrılıyor. Bu yüzden
// araçlar oturum açılışında bir kez ısıtılıp önbelleğe alınır, çağrı yerlerinin
// hiçbiri değişmez. `deps` yalnızca test enjeksiyonu içindir.
let _mcpToolDefs = [];
async function warmMcpTools(deps) {
  try {
    const { loadMcpToolDefinitions } = require('../utils/mcp-tools');
    const res = await loadMcpToolDefinitions(deps);
    _mcpToolDefs = res.tools || [];
    // Bozuk bir sunucu REPL'in açılmasını engellememeli, ama sessizce de yutulmamalı.
    for (const err of res.errors || []) {
      console.log(chalk.yellow(`  ⚠ MCP: ${err}`));
    }
    if (_mcpToolDefs.length > 0) {
      console.log(chalk.gray(L(
        `  🔌 MCP: ${res.servers.join(', ')} — ${_mcpToolDefs.length} araç yüklendi`,
        `  🔌 MCP: ${res.servers.join(', ')} — ${_mcpToolDefs.length} tools loaded`)));
    }
  } catch (e) {
    _mcpToolDefs = [];
  }
  _toolDefs = null; // önbelleği tazele ki sonraki getToolDefs MCP'yi de kapsasın
  return _mcpToolDefs;
}

function getToolDefs() {
  if (!_toolDefs) {
    try {
      _toolDefs = [...loadToolDefinitions(), ..._mcpToolDefs];
    } catch (e) {
      _toolDefs = [..._mcpToolDefs];
    }
  }
  return _toolDefs.slice();
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
    _cachedTierOpts.projectRules !== opts.projectRules ||
    _cachedTierOpts.memoryTreeDigest !== opts.memoryTreeDigest ||
    _cachedTierOpts.memoryTreeIndex !== opts.memoryTreeIndex;
  
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
      memoryTreeDigest: opts.memoryTreeDigest,
      memoryTreeIndex: opts.memoryTreeIndex,
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
    memoryTreeDigest: '',
    memoryTreeIndex: '',
  });
  return assemble(_cachedStable, _cachedContext, volatileOnly.volatile);
}

// ── Tool Guardrails instance (Hermes-style) ─────────────────────────────
const agentCore = new AgentCore({ maxIterations: 10 });
const guardrails = agentCore.guardrails;

// CLI komutları (REPL içinden çalıştırılabilir)
const CLI_COMMANDS = {
  '/doctor':    { desc: L('Sistem sağlığı kontrolü', 'System health check'), run: ['doctor'] },
  '/cost':      { desc: L('Maliyet takibi (today|week|month|budget)', 'Cost tracking (today|week|month|budget)'), run: ['cost', 'today'] },
  '/audit':     { desc: L('Denetim kaydı (today|stats|files)', 'Audit log (today|stats|files)'), run: ['audit', 'stats'] },
  '/team':      { desc: L('Çoklu ajan (list|status)', 'Multi-agent (list|status)'), run: ['team', 'list'] },
  '/xp':        { desc: L('XP/Seviye durumu', 'XP/level status'), run: ['xp'] },
  '/skills':    { desc: L('Yüklü beceri listesi', 'Installed skills'), run: ['skills', 'list'] },
  '/status':    { desc: L('Sistem durumu', 'System status'), run: ['status'] },
  '/mcp':       { desc: L('MCP sunucuları', 'MCP servers'), run: ['mcp', 'list'] },
  '/channels':  { desc: L('Bağlı kanallar', 'Connected channels'), run: ['channels'] },
  '/crons':     { desc: L('Zamanlanmış görevler', 'Scheduled tasks'), run: ['cron', 'list'] },
  '/bots':      { desc: L('Bot listesi', 'Bot list'), run: ['bots'] },
  '/models':    { desc: L('Modeller', 'Models'), run: ['models', 'list'] },
  '/memory-ls': { desc: L('Hafıza dosyaları', 'Memory files'), run: ['memory', 'list'] },
  '/seo':       { desc: L('SEO denetimi (URL gerekli)', 'SEO audit (URL required)'), needsArg: true, run: ['seo', 'audit'] },
  '/naturehub': { desc: L('Bota mesaj gönder (metin gerekli)', 'Send a message to a bot (text required)'), needsArg: true, run: ['naturehub', 'post'] },
  '/dashboard': { desc: L('Web panelini başlat (port 7421)', 'Start web dashboard (port 7421)'), run: ['dashboard', 'start'] },
};

// Profil desteği: --profile <ad> ile ~/.natureco-<ad> kullanılır (config ile tutarlı)
const { CONFIG_DIR: PROFILE_DIR } = require('../utils/config');
const MEMORY_DIR = path.join(PROFILE_DIR, 'memory');
const SESSION_DIR = path.join(PROFILE_DIR, 'sessions');
const SESSIONS_INDEX = path.join(PROFILE_DIR, 'sessions.json');
const REPL_STATE = path.join(PROFILE_DIR, 'repl-state.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getConfig() {
  // Merkezi config'e delege — --profile desteği, backup ve validation
  // yerel kopyada yoktu; REPL kullanıcının gerçek config'ini okuyordu
  try {
    return require('../utils/config').getConfig() || {};
  } catch { return {}; }
}

// Tek doğruluk kaynağı: provider-detect (MiniMax /v1 toleransı dahil)
const { isMiniMax, isGemini, buildChatEndpoint } = require('../utils/provider-detect');

function loadMemory(username) {
  const uname = foldTr(username || 'default');
  const base = { name: username || L('Kullanıcı', 'User'), nickname: null, botName: null, facts: [], preferences: [], history: [] };
  const readJson = (f) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; } catch { return null; } };

  const newPath = path.join(MEMORY_DIR, `${uname}.json`);
  // v5.67.3: foldTr replaced plain .toLowerCase() for the memory filename, which fixes capital-İ
  // usernames but can orphan a file saved under the old locale-mangled name. Migrate it once,
  // transparently, instead of silently losing that user's existing memory.
  if (!fs.existsSync(newPath)) {
    const legacyName = (username || 'default').toLowerCase();
    if (legacyName !== uname) {
      const legacyPath = path.join(MEMORY_DIR, `${legacyName}.json`);
      const legacyMem = readJson(legacyPath);
      if (legacyMem) {
        try { fs.writeFileSync(newPath, JSON.stringify(legacyMem, null, 2)); } catch {}
      }
    }
  }

  const userMem = readJson(newPath);
  const merged = userMem
    ? { ...base, ...userMem, facts: [...(userMem.facts || [])], preferences: [...(userMem.preferences || [])], history: [...(userMem.history || [])] }
    : { ...base };

  // Legacy default.json'i birlestir (isim eslesiyorsa ya da isimsizse): eski kurulumlarda
  // hafiza + bot personasi default.json'da kalmis olabiliyordu; <user>.json ile split-brain
  // olusuyordu. Birlestirince recall calisir ve ilk kayitta konsolide olur.
  if (uname !== 'default') {
    const def = readJson(path.join(MEMORY_DIR, 'default.json'));
    if (def && (!def.name || foldTr(def.name) === uname)) {
      // Jenerik "Asistan" placeholder'ini gercek persona (orn. Hinata) ile ez
      const isGeneric = (b) => !b || /^asistan$/i.test(String(b));
      if (isGeneric(merged.botName) && def.botName && !isGeneric(def.botName)) merged.botName = def.botName;
      if ((!merged.name || merged.name === 'Kullanıcı') && def.name) merged.name = def.name;
      const factVal = (f) => ((f && (f.value != null ? f.value : f)) || '').toString().trim();
      const seen = new Set(merged.facts.map(f => foldTr(factVal(f))));
      for (const f of (def.facts || [])) {
        const v = factVal(f);
        if (v && !seen.has(foldTr(v))) { seen.add(foldTr(v)); merged.facts.push(f); }
      }
    }
  }

  if (!merged.botName) merged.botName = L('Asistan', 'Assistant');
  return merged;
}

function saveMemory(username, memory) {
  ensureDir(MEMORY_DIR);
  const file = path.join(MEMORY_DIR, `${foldTr(username || 'default')}.json`);
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
    firstUserMessage: messages.find(m => m.role === 'user')?.content?.slice(0, 60) || L('(boş)', '(empty)'),
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
  const existingValues = new Set((currentFacts || []).map(f => foldTr(f.value || f)));

  for (const msg of userMessages) {
    const text = msg.content || '';
    const lower = foldTr(text);

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
        if (val && !existingValues.has(foldTr(val))) {
          newFacts.push({ value: val, score: 5, learnedAt: new Date().toISOString() });
          existingValues.add(foldTr(val));
        }
      }
    }
  }
  return newFacts;
}

function apiRequest(providerUrl, providerApiKey, body, stream = false, retries = 3) {
  return new Promise((resolve, reject) => {
    const endpoint = buildChatEndpoint(providerUrl);
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
            try { resolve(JSON.parse(data)); } catch { reject(new Error(L('Yanıt çözümlenemedi', 'Could not parse the response'))); }
          } else if (res.statusCode === 429 && attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            setTimeout(() => doRequest(attempt + 1), delay);
          } else {
            const msg = res.statusCode === 429
              ? L(
                'HTTP 429: API hız sınırı aşıldı. Lütfen bekleyin veya planınızı yükseltin.',
                'HTTP 429: API rate limit exceeded. Please wait or upgrade your plan.',
              )
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

  // Simple stdin prompt fallback (no rl dependency)
  function stdinPrompt(question, cb) {
    process.stdout.write(question);
    const stdin = process.stdin;
    const onData = (data) => {
      stdin.removeListener('data', onData);
      stdin.pause();
      cb(data.toString().trim());
    };
    stdin.resume();
    stdin.on('data', onData);
  }

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

  // Token economy: advertise a core set and catalogue the rest by name instead
  // of serializing every schema into every request (~14.7k tokens per call on a
  // 16k budget). Execution still resolves against the full `toolDefs`, and
  // `enable_tools` loads any schema the model asks for.
  const toolProfile = getConfig().toolProfile === 'all' ? 'all' : 'core';
  toolDefs.push(createEnableToolsTool(
    replEnabledTools,
    () => toolDefs.map(t => t.name),
    () => buildCatalogNames(selectTools(toolDefs, { profile: toolProfile, enabled: replEnabledTools }).hidden),
  ));
  // Recomputed each iteration: `enable_tools` widens the set mid-turn and the
  // model must see the new schemas on its very next step.
  const currentToolParam = () => {
    const advertised = selectTools(toolDefs, { profile: toolProfile, enabled: replEnabledTools });
    const catalog = buildCatalog(advertised.hidden);
    if (catalog && messages[0] && messages[0].role === 'system') {
      const stripped = String(messages[0].content || '').split(/\n\nAdditional tools \(|\n\nEk araçlar \(/)[0];
      messages[0] = { ...messages[0], content: `${stripped}\n\n${catalog}` };
    }
    return toOpenAIFormat(advertised.exposed);
  };
  guardrails.reset();

  let currentMessages = messages;
  let fullText = '';
  let iterations = 0;
  const MAX_TOOL_ITERATIONS = 50;
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

  while (iterations < 50) {
    let effortLevel = 'medium', effortCfg;
    let cfg;
    try {
      cfg = require('../utils/config').getConfig();
      effortLevel = getEffortLevel(cfg);
      effortCfg = getEffortConfig(effortLevel);
    } catch { effortCfg = getEffortConfig(effortLevel); }
    const maxIter = effortCfg ? effortCfg.maxToolIterations : 50;
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
    const toolParam = currentToolParam();
    if (toolParam && toolParam.length) body.tools = toolParam;
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
        const toolResults = await processToolCalls(msg.tool_calls, onToolCall, stdinPrompt, toolDefs);
        currentMessages.push(msg);
        currentMessages.push(...toolResults);
        continue; // Tekrar API çağır
      }
      break;
    }

    // OpenAI uyumlu streaming — tek doğruluk kaynağı buildChatEndpoint
    const endpoint = buildChatEndpoint(providerUrl);
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
          // Düşünme metni yazıldı mı — cevap başlarken ayırıcı koymak için.
          let dusunmeYazildi = false;
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

                // Düşünme (reasoning) metni — cevaptan ÖNCE gelir.
                //
                // Düşünen modeller cevabı `content`, düşünme metnini
                // `reasoning` / `reasoning_content` alanında yollar. Burada
                // yalnızca `content` okunduğu için model düşündüğü sürece ekran
                // BOŞ kalıyordu; kullanıcıya araç donmuş gibi görünüyordu.
                // Ölçüldü: bir sağlayıcıda 41 parçanın tamamı `reasoning`
                // alanındaydı, `content` hiç gelmedi.
                //
                // `streamText`e EKLENMEZ: düşünme metni cevabın parçası değil,
                // transkripte girerse sonraki turlara da taşınırdı.
                if (!streamText) {
                  const dusunme = extractReasoningDelta(delta);
                  if (dusunme) process.stdout.write(chalk.gray(dusunme));
                }

                // Text content
                if (delta.content) {
                  // Düşünme yazıldıysa cevabı temiz bir satırdan başlat.
                  if (!streamText && dusunmeYazildi) { process.stdout.write('\n\n'); dusunmeYazildi = false; }
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
        console.log(tui.C.yellow(`\n  ⚠ ${body.model} ${L('başarısız', 'failed')} → ${fb.nextModel} ${L('deneniyor...', 'trying...')}\n`));
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
      const toolResults = await processToolCalls(finalized, onToolCall, stdinPrompt, toolDefs);
      currentMessages.push(...toolResults);

      // Plan mode review: plan submitted, wait for user approval
      if (planMode.inReview()) {
        const { plan } = planMode.planHistory[planMode.planHistory.length - 1] || {};
        console.log('\n' + tui.C.cyan(L('  📋 Plan sunuldu — onay bekleniyor...', '  📋 Plan submitted — awaiting approval...')));
        console.log(tui.C.muted('  ' + '─'.repeat(56)));
        console.log(plan ? `\n  ${plan.replace(/\n/g, '\n  ')}` : '');
        console.log('\n' + tui.C.muted('  ─'.repeat(28)));
        const approved = await new Promise(resolve => {
          stdinPrompt(tui.C.yellow(L('  Planı onaylıyor musun? [Y=exec, n=reddet, e=düzenle]: ', '  Approve the plan? [Y=exec, n=reject, e=edit]: ')), answer => {
            const key = answer.trim().toLowerCase();
            if (key === 'n' || key === 'no') { planMode.reject(); resolve(false); }
            else if (key === 'e' || key === 'edit') { planMode.reject(); resolve('edit'); }
            else { planMode.approve(); resolve(true); }
          });
        });
        if (approved === true) {
          console.log(tui.C.green(L('  ✓ Plan onaylandı. Plan uygulanıyor...\n', '  ✓ Plan approved. Applying...\n')));
          // Devam — model cevap versin
        } else if (approved === 'edit') {
          console.log(tui.C.yellow(L('  📝 Planı düzenleyin ve /plan ile yeniden gönderin.\n', '  📝 Edit the plan and resubmit with /plan.\n')));
          // Plan modunda kal, mesaj ekle
          currentMessages.push({ role: 'user', content: L('Planı düzenle ve yeniden sun.', 'Revise the plan and submit it again.') });
          continue;
        } else {
          console.log(tui.C.amber(L('  ⨯ Plan reddedildi. Yeniden plan yapılıyor...\n', '  ⨯ Plan rejected. Re-planning...\n')));
          currentMessages.push({ role: 'user', content: L('Plan reddedildi. Lütfen farklı bir yaklaşım dene.', 'The plan was rejected. Please try a different approach.') });
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
const { assessRisk } = require('../utils/tool-gate');
const { selectTools, buildCatalog, buildCatalogNames, createEnableToolsTool } = require('../utils/tool-profile');

// Tools the model pulled in via `enable_tools`; scoped to this REPL process.
const replEnabledTools = new Set();

// Providers that do not emit OpenAI-style tool_calls reliably need the XML
// agentic runner inside the workflow tool — for them the pre-step IS the tool
// loop, not an extra hop. See utils/provider-detect.js.
const { supportsNativeToolCalls } = require('../utils/provider-detect');
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
  const full = `${tui.C.yellow('⚠')} ${tui.C.bold(L('İzin gerekiyor', 'Permission required'))}: ${question}\n${tui.C.muted(hint)}`;
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


// toolDefs AÇIKÇA geçirilir. Sanal araçlar (EnterPlanMode, CreateTask, …)
// manifestte yoktur; tanımları execute'larıyla birlikte yalnızca sendStreaming
// içinde kurulur. Eskiden buraya getToolDefs() ile ulaşıyorlardı — ama sadece
// önbelleğin kirlenmesi sayesinde, yani bir hatanın yan etkisi olarak.
// Kirlenme giderilince tek doğru yol, turun listesini parametre olarak vermek.
async function processToolCalls(toolCalls, onToolCall, onAsk, turToolDefs) {
  const toolDefs = turToolDefs || getToolDefs();
  const results = [];

  // Parse all tool calls first
  const parsed = agentCore.parseToolCalls(toolCalls).map(call => {
    const tc = call.original;
    const name = tc.function?.name || tc.name;
    const argsStr = tc.function?.arguments || tc.args || '{}';
    const id = tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let args;
    try {
      args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;
    } catch (e) {
      args = { _parse_error: e.message, _raw: argsStr };
    }
    return { name, args, id, parseError: call.parseError };
  });

  // Filter out blocked tools via guardrails
  agentCore.startIteration();
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

    // 0.5. Risk assessment. Permission rules and hooks both default to "allow"
    // with no user config, so before this the agent could run `rm -rf` or a
    // PowerShell recursive delete here without ever asking.
    const risk = assessRisk(p.name, p.args);
    if (risk.requiresApproval) {
      const approved = await askPermissionPrompt(
        `${risk.level === 'high' ? '🔴' : '🟡'} ${risk.reason}`,
        `${L('Bu işleme izin ver', 'Allow this operation')}? [y=${L('bir kez', 'once')}, n=${L('hayır', 'no')}] `,
        onAsk,
      );
      if (!approved) {
        const reason = L('Riskli işlem onaylanmadı: ', 'Risky operation not approved: ') + risk.reason;
        const denied = { ...p, result: { error: reason }, _risk_blocked: true };
        if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: reason } });
        return denied;
      }
    }

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
          L(
            'Bu işleme izin ver? [y=bir kez, Y=oturum, p=kalıcı, n=hayır] ',
            'Allow this operation? [y=once, Y=session, p=persistent, n=no] ',
          ),
          onAsk
        );
        if (ok === 'persistent') markApproved(permKey, true);
        else if (ok === 'session') markApproved(permKey, false);
        else if (!ok) {
          const reason = L('İzin reddedildi: ', 'Permission rejected: ') + perm.rule.raw;
          const denied = { ...p, result: { error: reason }, _perm_blocked: true };
          if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: reason } });
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
        L('Hook onayı [y=bir kez, Y=oturum, n=hayır]: ', 'Hook approval [y=once, Y=session, n=no]: '),
        onAsk
      );
      if (!ok) {
        const reason = L('Hook reddetti: ', 'Hook rejected: ') + hook.rule.raw;
        const denied = { ...p, result: { error: reason }, _hook_blocked: true };
        if (onToolCall) onToolCall({ name: p.name, args: p.args, status: 'done', result: { error: reason } });
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
  console.log(chalk.cyan(L('\n  📚 REPL Komutları:\n', '\n  📚 REPL Commands:\n')));
  console.log('  ' + chalk.yellow('/help'.padEnd(22)) + chalk.gray(L('Bu yardım', 'This help')));
  console.log('  ' + chalk.yellow('/clear'.padEnd(22)) + chalk.gray(L('Ekranı temizle', 'Clear the screen')));
  console.log('  ' + chalk.yellow('/history'.padEnd(22)) + chalk.gray(L('Bu oturumun geçmişi', 'This session\'s history')));
  console.log('  ' + chalk.yellow('/memory'.padEnd(22)) + chalk.gray(L('Hafızayı göster', 'Show memory')));
  console.log('  ' + chalk.yellow('/plan [on|off|show]'.padEnd(22)) + chalk.gray(L('Plan modu', 'Plan mode')));
  console.log('  ' + chalk.yellow('/forget'.padEnd(22)) + chalk.gray(L('Hafızayı temizle', 'Clear memory')));
  console.log('  ' + chalk.yellow('/sessions'.padEnd(22)) + chalk.gray(L('Geçmiş oturumları listele', 'List past sessions')));
  console.log('  ' + chalk.yellow('/resume [id|last]'.padEnd(22)) + chalk.gray(L('Önceki oturuma dön', 'Return to a previous session')));
  console.log('  ' + chalk.yellow('/system <text>'.padEnd(22)) + chalk.gray(L('System prompt değiştir', 'Change system prompt')));
  console.log('  ' + chalk.yellow('/model <name>'.padEnd(22)) + chalk.gray(L('Model değiştir', 'Change model')));
  console.log('  ' + chalk.yellow('/identity [ad]'.padEnd(22)) + chalk.gray(L('Bot adını değiştir', 'Change bot name')));
  console.log('  ' + chalk.yellow('/tokens'.padEnd(22)) + chalk.gray(L('Token kullanımı', 'Token usage')));
  console.log('  ' + chalk.yellow('/save'.padEnd(22)) + chalk.gray(L('Oturumu elle kaydet', 'Save session manually')));
  console.log('  ' + chalk.yellow(L('/exit veya /quit', '/exit or /quit').padEnd(22)) + chalk.gray(L('Çıkış (Ctrl+C de çalışır)', 'Exit (Ctrl+C also works)')));
  console.log(chalk.cyan(L('\n  🛠️  Tüm CLI Komutları (REPL içinden):\n', '\n  🛠️  All CLI Commands (from REPL):\n')));
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
    proc.on('error', (e) => { console.log(chalk.red(L('  Hata: ', '  Error: ') + e.message)); resolve(1); });
  });
}

async function startRepl(args) {
  args = args || [];
  ensureDir(MEMORY_DIR); ensureDir(SESSION_DIR);

  // MCP araçlarını ilk tur başlamadan ısıt — getToolDefs senkron olduğu için
  // buradan sonra hiçbir çağrı yerinin await etmesi gerekmez.
  await warmMcpTools();

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

  // Abonelik kipi: sağlayıcı yerine yerel köprüyü kullan. REPL'in geri kalanı
  // aradaki farkı görmez; providerUrl/Key köprünün ucunu gösterir.
  let abonelikKoprusu = null;
  if (abonelikKipi(cfg)) {
    try {
      const b = await abonelikBagla(cfg, { surum: require('../../package.json').version });
      providerUrl = b.providerUrl;
      providerApiKey = b.providerApiKey;
      abonelikKoprusu = b;
      // Köprü OpenAI `tools` alanını iletmez; REPL yerel araç çağrısı
      // desteklenmeyen sağlayıcılardaki hazır akışa düşmeli.
      cfg.nativeToolCalls = false;
      // Ad, gizli anahtarı da taşıyan `b` yerine sabit kayıttan okunur:
      // sır taşıyan bir nesneden gösterim verisi çekip ekrana basmak,
      // hem sızıntı analizinde işaretlenir hem de gereksiz bir bağdır.
      const saglayici = saglayiciAdi(cfg);
      console.log(chalk.gray(L(`\n  ${saglayici} aboneliği kullanılıyor.\n`, `\n  Using ${saglayici} subscription.\n`)));
    } catch (e) {
      console.log(chalk.red(`\n  ❌ ${e.message}\n`));
      process.exit(1);
    }
  }

  if (!providerUrl || !providerApiKey) {
    console.log(chalk.red(L('\n  ❌ Provider ayarlı değil. Önce: natureco setup\n', '\n  ❌ Provider not configured. First: natureco setup\n')));
    process.exit(1);
  }

  // Köprü alt süreç tutuyor; CLI kapanırken bırakılmamalı.
  if (abonelikKoprusu) {
    const kapat = () => { try { abonelikKoprusu.kapat(); } catch { /* kapanışta hata yutulur */ } };
    process.once('exit', kapat);
    process.once('SIGINT', () => { kapat(); process.exit(130); });
  }

  // Memory yükle
  let memory = loadMemory(cfg.userName);

  // v5.6.19: Oncelik config.botName, sonra memory.botName
  if (!memory.botName) {
    memory.botName = cfg.botName || L('Asistan', 'Assistant');
  }
  // BotName'i memory'ye persist et (her oturumda ayni kalsin)
  try {
    const fs = require('fs');
    const memFile = path.join(os.homedir(), '.natureco', 'memory', foldTr(cfg.userName || 'default') + '.json');
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
      console.log(chalk.green(`\n  ✓ ${L('Oturum yüklendi', 'Session loaded')}: ${session.id} (${messages.length} ${L('mesaj', 'messages')})\n`));
    } else {
      console.log(chalk.yellow(`\n  ⚠️  ${L('Oturum bulunamadı', 'Session not found')}: ${resumeId}\n`));
    }
  }

  // System prompt oluştur (memory + identity + persistent bağlam)
  // v5.6.5: Kucuk model tespiti (Groq, Mistral Small, Ollama) - SOUL injection skip
  const botName = memory.botName || L('Asistan', 'Assistant');
  const userName = memory.name || memory.nickname || cfg.userName;
  const isSmallModel = (cfg.providerUrl || '').includes('groq.com') || 
                       (cfg.providerUrl || '').includes('mistral.ai') ||
                       (cfg.providerUrl || '').includes('localhost') ||
                       (cfg.providerUrl || '').includes('ollama');
  // Discover project rules (CLAUDE.md)
  const projectRules = discoverProjectRules(process.cwd());
  if (projectRules) {
    console.log(chalk.cyan(`  📋 ${L('Proje kurallari bulundu', 'Project rules found')} (CLAUDE.md)\n`));
  }

  // Build system prompt with tier caching (stable+context cached, volatile fresh)
  // Persistent memory, pre-loaded. This used to reach the model only through
  // the workflow tool's agentic path; with the pre-step opt-in the direct loop
  // has to carry it, or the assistant starts every session knowing nothing.
  let memoryTreeDigest = '';
  let memoryTreeIndex = '';
  try {
    const tree = require('../tools/memory_tree')._internal;
    memoryTreeDigest = tree.buildDigest(cfg.userName) || '';
    memoryTreeIndex = tree.buildIndex(cfg.userName) || '';
  } catch { /* no tree yet — the agent still has memory_tree/memory_search */ }

  const promptOpts = {
    botName, userName, soulSummary, isSmallModel,
    memorySnapshotBlock, skillsIndexBlock, projectRules,
    memoryTreeDigest, memoryTreeIndex,
    crossSessionContext: crossSessionContext || '',
    userHome: cfg.userHome || '',
    platform: process.platform,
    desktopPath: cfg.userHome ? path.join(cfg.userHome, 'Desktop') : '',
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
  console.log(tui.styled(L('  🌿 NatureCo REPL · Persistent Sohbet', '  🌿 NatureCo REPL · Persistent Chat'), { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
  console.log(tui.C.muted('  Provider: ') + tui.C.brand(providerUrl.replace(/https?:\/\//, '')));
  console.log(tui.C.muted('  Model:    ') + tui.C.brand(model));
  const displayUser = memory.nickname || cfg.userName || require('os').userInfo().username || L('Kullanıcı', 'User');
  console.log(tui.C.muted(L('  Kullanıcı: ', '  User: ')) + tui.C.brand(displayUser + (memory.nickname && cfg.userName ? ` (${cfg.userName})` : '')));
  console.log(tui.C.muted('  Bot:      ') + tui.C.brand(memory.botName || L('Asistan', 'Assistant')));
  if (messages.length > 1) {
    console.log(tui.C.muted(L('  Oturum:   ', '  Session:  ')) + tui.C.amber(`${messages.filter(m => m.role === 'user' || m.role === 'assistant').length} ${L('mesaj', 'messages')} (${L('devam', 'resumed')})`));
  }
  console.log(tui.C.muted(L('  Komutlar: ', '  Commands: ')) + tui.C.yellow('/help') + tui.C.muted(' · ') + tui.C.yellow('/memory') + tui.C.muted(' · ') + tui.C.yellow('/sessions') + tui.C.muted(' · ') + tui.C.yellow('/exit'));
  console.log('');
  // v5.4.7: Hard-coded kimlik — v5.14.5: memory fact'lerinden kullanici adini tespit et
  const displayBotName = memory.botName || L('Asistan', 'Assistant');
  const nameFromFact = (() => {
    const facts = memory.facts || [];
    for (const f of facts) {
      const v = (f.value || f || '').trim();
      const lv = foldTr(v);
      const match = lv.match(/(?:kullanici\s*adi?|kullanıcı\s*adı?|isim|name)\s*:?\s*(.+)/);
      if (match && match[1].trim().length > 2) return match[1].trim();
    }
    return null;
  })();
  const displayUserName = memory.name || nameFromFact || memory.nickname || cfg.userName;
  console.log(tui.C.brand(L(`  👋 Ben ${displayBotName}, ${displayUserName}. Sen nasılsın?`, `  👋 I am ${displayBotName}, ${displayUserName}. How are you?`)));
  console.log('');

  // Theseus deseni: oturum basinda "geçen sefer kalanlari" proaktif hatirlat
  // (3-kararlar / "Bekleyen İşler" dali). Ajan yarim isleri buraya memory_tree ile yazar.
  try {
    const pending = require('../tools/memory_tree')._internal.getPending(cfg.userName);
    if (pending && pending.length) {
      console.log(tui.C.muted(L('  📌 Geçen oturumdan kalanlar:', '  📌 Left over from last session:')));
      for (const item of pending.slice(0, 6)) console.log(tui.C.muted('     • ' + item));
      console.log('');
    }
  } catch { /* hafiza yoksa sessiz gec */ }

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
    prompt: tui.styled(L('  💬 Sen ▸ ', '  💬 You ▸ '), { color: tui.PALETTE.primary, bold: true }),
    terminal: true,
  });
  // Pipe/script kullanımında EOF, yanıt hâlâ üretilirken gelir —
  // aktif işlem varken kapanışı bekletmek için sayaç + kapalı-rl koruması
  let _busy = 0;
  let _rlClosed = false;
  // Görünür input alanı: her prompttan önce ince ayırıcı çizgi (readline prompt'u tek-satır
  // kalir → satir duzenleme/gecmis bozulmaz). Cikti ile girdi arasini net ayirir.
  const safePrompt = () => {
    if (_rlClosed) return;
    try { process.stdout.write(tui.styled('\n  ' + '─'.repeat(54) + '\n', { color: tui.PALETTE.muted })); } catch {}
    rl.prompt();
  };
  safePrompt();

  const cleanup = async (exitCode = 0) => {
    if (messages.length > 1) {
      // v5.4.10: Once oturumdaki butun conversation'i memory'ye persist et
      // Bu, Parton'un "oturum sonunda konusmalar kaydedilmiyor" sikayetini cözüyor
      const persistResult = await persistSessionToMemory(messages, memory, cfg);
      if (persistResult && persistResult.factsAdded > 0) {
        console.log(chalk.gray(`\n  🧠 ${persistResult.factsAdded} ${L("yeni fact memory'ye kaydedildi", 'new facts saved to memory')}`));
      }
      if (persistResult && persistResult.preferencesAdded > 0) {
        console.log(chalk.gray(`  🎯 ${persistResult.preferencesAdded} ${L('yeni tercih kaydedildi', 'new preferences saved')}`));
      }

      // v5.46: oturum-sonu hafıza-sağlığı ipucu (gürültüsüz). Yinelenen/çelişen kayıt varsa
      // tek satır hatırlat — kullanıcı çoğu zaman "natureco memory lint"i hiç çalıştırmaz,
      // hafıza sessizce bozulur. Sadece bulgu varsa yazılır; hata asla oturumu bozmaz.
      try {
        const { lintUser } = require('../utils/memory-lint');
        const { flatFindings, treeFindings } = lintUser(cfg.userName);
        const n = (flatFindings.length + treeFindings.length);
        if (n > 0) console.log(chalk.gray(`  💡 ${L('Hafızada', 'In memory')} ${n} ${L('olası yinelenen/çelişen kayıt —', 'possible duplicate/conflicting records —')} "natureco memory lint" ${L('ile gözden geçir.', 'to review.')}`));
      } catch {}

      const sessId = saveSession(messages, {
        provider: providerUrl, model, user: cfg.userName,
        bot: memory.botName, factCount: memory.facts?.length || 0,
      });
      console.log(chalk.gray(`\n  💾 ${L('Oturum kaydedildi', 'Session saved')}: ${sessId}`));
    }
    // Global buffer temizle
    if (global._fixBuffer) global._fixBuffer = '';
    disableBracketedPaste(process.stdout);
    console.log(chalk.gray(L('\n  👋 Görüşürüz!\n', '\n  👋 See you!\n')));
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
      // v5.44 KRİTİK KARAR: "yanlış hatırlamak, hiç hatırlamamaktan kötüdür."
      // Otomatik regex-extraction, agent'ın BİLİNÇLİ memory_write/memory_tree kaydının
      // üzerine yanlış fact yazabiliyordu (ör. "kod adı ONYX-7" → "Kullanici ad: onyx").
      // Bu yüzden: agent bu oturumda memory'ye YAZDIYSA (disk'teki fact sayısı oturum
      // başındakinden fazlaysa), regex-extraction'ı TAMAMEN ATLA — bilinçli kayıt kazanır.
      // Modern modeller memory_write'ı güvenilir çağırır → regex hiç devreye girmez, sıfır
      // yanlış-pozitif. Agent hiç kaydetmediyse (nadir) regex bir güvenlik ağı olarak kalır.
      try {
        const memFile = path.join(MEMORY_DIR, foldTr(cfg.userName || 'default') + '.json');
        const diskFacts = JSON.parse(fs.readFileSync(memFile, 'utf8')).facts || [];
        if (diskFacts.length > (memory.facts || []).length) {
          return { factsAdded: 0, preferencesAdded: 0, skippedAutoExtract: true };
        }
      } catch { /* dosya yok/okunamadı → aşağıdaki güvenlik ağı çalışsın */ }

      // Pattern-based extraction (agent hiç bilinçli kayıt yapmadıysa güvenlik ağı)
      const newFacts = extractFacts(messages, memory.facts || []);

      // Bazi user message'lari da tara — genel kalıplarla fact çıkar
      const userMessages = messages.filter(m => m.role === 'user' && !m._internal);
      for (const msg of userMessages) {
        const text = foldTr(msg.content || '');

        // BotName hatirlatmasi
        if (text.includes('ad') && (text.includes('adin') || text.includes('ismin'))) {
          // Bot adı sorgulanmış olabilir, mevcut adı koru
        }

        // v5.44: Kullanici AÇIKÇA "hatirla/kaydet/not al" dediyse ve agent bunu bilinçli
        // kaydetmediyse (buraya kadar geldiysek agent yazmamıştır), mesaji HAM olarak
        // sakla — regex ile parse edip bozma. "Sadakat > kategorizasyon": kullanicinin
        // soyledigi bilgiyi AYNEN korumak, yanlis etiketleyip bozmaktan iyidir. Boylece
        // "kod adi VORTEX-8 hatirla" → tam metin kaydedilir, ne kaybolur ne bozulur.
        if (/\b(hat[ıi]rla|kaydet|not\s*al|not\s*et|unutma|akl[ıi]nda\s*(tut|bulunsun)|remember|save\s*this|note\s*this)\b/i.test(text)) {
          const raw = (msg.content || '').trim()
            .replace(/[,.\s]*(bunu|sunu|şunu)?\s*(kal[ıi]c[ıi]\s*olarak\s*)?(hat[ıi]rla|kaydet|not\s*al|not\s*et|unutma|akl[ıi]nda\s*(tut|bulunsun))\b[.!]*\s*$/i, '')
            .trim();
          const fact = raw.length >= 3 ? raw : (msg.content || '').trim();
          if (fact && !(memory.facts || []).some(f => foldTr(f.value || '') === foldTr(fact))) {
            newFacts.push({ value: fact, score: 8, category: 'explicit', createdAt: new Date().toISOString() });
          }
        }

        // v5.40: Kisilik/isim cikarimi module-level SAF extractPreferenceFacts'e
        // tasindi (test edilebilir + regresyon kilidi). "kod adı"/"proje adı" gibi
        // masum tamlamalari artik yanlis yakalamiyor; deger orijinal case'de kalir.
        for (const pf of extractPreferenceFacts(msg.content)) {
          if (!(memory.facts || []).some(f => foldTr(f.value || '') === foldTr(pf.value))) {
            newFacts.push({ value: pf.value, score: 6, category: pf.category, createdAt: new Date().toISOString() });
          }
        }
      }

      // Deduplicate
      const existingValues = new Set((memory.facts || []).map(f => foldTr(f.value || f)));
      const uniqueFacts = newFacts.filter(f => !existingValues.has(foldTr(f.value || f)));

      if (uniqueFacts.length > 0) {
        memory.facts = [...(memory.facts || []), ...uniqueFacts];
        // v5.4.10: Verification ile kaydet
        const memFile = path.join(MEMORY_DIR, foldTr(cfg.userName || 'default') + '.json');
        memory.lastUpdated = new Date().toISOString();
        fs.writeFileSync(memFile, JSON.stringify(memory, null, 2), 'utf8');
        // Verification: geri oku
        const verify = JSON.parse(fs.readFileSync(memFile, 'utf8'));
        factsAdded = uniqueFacts.length;
      }

      // Decay: soft-cap. v5.40: memory_write ile UYUMLU (eski 15 sert limiti yeni
      // fact'leri sessizce kesiyordu — recall kaybina yol aciyordu). 50 = MAX_FACTS.
      const CAP = (() => { const r = parseInt(process.env.NATURECO_MAX_FACTS || '', 10); return Number.isFinite(r) && r > 0 ? r : 50; })();
      if (memory.facts && memory.facts.length > CAP) {
        // En yuksek skor + en yeni once; dusukleri sil.
        memory.facts.sort((a, b) => ((b.score || 5) - (a.score || 5)) || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
        memory.facts = memory.facts.slice(0, CAP);
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
    // BOM ve benzeri görünmez karakterleri temizle (PowerShell echo BOM'lu gönderir)
    const line = restoreNewlines(input).replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
    if (!line) { safePrompt(); return; }
    _busy++;
    try {
      await handleLine(line);
    } finally {
      _busy--;
    }
  });

  async function handleLine(line) {

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
          console.log(chalk.cyan(L('\n  📜 Bu oturumun geçmişi:\n', '\n  📜 This session\'s history:\n')));
          for (const m of messages.filter(m => !m._internal)) {
            const role = m.role === 'user' ? chalk.green('You') : chalk.blue('AI  ');
            const content = (m.content || '').slice(0, 120) + ((m.content || '').length > 120 ? '...' : '');
            console.log(`  ${role}  ${content}`);
          }
          console.log('');
          break;
        case 'memory':
          console.log(chalk.cyan('\n  🧠 Memory:\n'));
          console.log(L('  Kullanıcı: ', '  User: ') + chalk.cyan(memory.name));
          console.log(L('  Takma ad: ', '  Nickname: ') + chalk.cyan(memory.nickname || L('(yok)', '(none)')));
          console.log('  Bot: ' + chalk.cyan(memory.botName || L('Asistan', 'Assistant')));
          if (memory.facts && memory.facts.length > 0) {
            console.log('  Facts (' + memory.facts.length + '):');
            for (const f of memory.facts) {
              console.log('    • ' + chalk.gray((f.value || f) + (f.score ? ` [${L('skor', 'score')}:${f.score}]` : '')));
            }
          } else {
            console.log(chalk.gray(L('  (Henüz fact yok)', '  (No facts yet)')));
          }
          console.log('');
          break;
        case 'forget':
          try {
            if (fs.existsSync(path.join(MEMORY_DIR, `${foldTr(cfg.userName || 'default')}.json`))) {
              fs.unlinkSync(path.join(MEMORY_DIR, `${foldTr(cfg.userName || 'default')}.json`));
            }
            memory = { name: cfg.userName, nickname: null, botName: L('Asistan', 'Assistant'), facts: [], preferences: [], history: [] };
            // System prompt'u rebuild with cleared memory
            promptOpts.memoryFacts = [];
            memoryStore.clear();
            promptOpts.memorySnapshotBlock = memoryStore.getSystemPromptBlock();
            systemPrompt = rebuildSystemPrompt(promptOpts);
            messages[0] = { role: 'system', content: systemPrompt, _internal: true };
            console.log(chalk.green(L('  ✓ Memory temizlendi', '  ✓ Memory cleared')));
          } catch (e) {
            console.log(chalk.red('  ❌ ' + e.message));
          }
          break;
        case 'sessions':
          const idx = loadSessionsIndex();
          console.log(chalk.cyan(L('\n  📚 Geçmiş Oturumlar (', '\n  📚 Past Sessions (') + idx.sessions.length + ')\n'));
          for (let i = 0; i < Math.min(10, idx.sessions.length); i++) {
            const s = idx.sessions[i];
            console.log(`  ${chalk.gray((i + 1).toString().padStart(2) + '.')} ${chalk.cyan(s.id)} ${chalk.muted('— ' + s.firstUserMessage)}`);
          }
          console.log(chalk.gray(L('\n  Devam etmek için: /resume <id> veya /resume last\n', '\n  To continue: /resume <id> or /resume last\n')));
          break;
        case 'resume':
          if (!arg) { console.log(chalk.yellow(L('  Kullanım: /resume <id> veya /resume last', '  Usage: /resume <id> or /resume last'))); break; }
          const session = loadSession(arg);
          if (session) {
            messages = session.messages || [];
            const sysIdx = messages.findIndex(m => m._internal);
            if (sysIdx >= 0) messages[sysIdx] = { role: 'system', content: systemPrompt, _internal: true };
            else messages.unshift({ role: 'system', content: systemPrompt, _internal: true });
            console.log(chalk.green(`  ✓ ${L('Oturum yüklendi', 'Session loaded')}: ${session.id} (${messages.length} ${L('mesaj', 'messages')})`));
          } else {
            console.log(chalk.yellow(`  ⚠️  ${L('Oturum bulunamadı', 'Session not found')}: ${arg}`));
          }
          break;
        case 'system':
          if (!arg) { console.log(chalk.yellow(L('  Kullanım: /system <text>', '  Usage: /system <text>'))); break; }
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
          console.log(chalk.green(L('  ✓ System prompt güncellendi', '  ✓ System prompt updated')));
          break;
        case 'model':
          if (!arg) {
            const known = require('../utils/model-catalog').getProviderModels(providerUrl);
            console.log(chalk.cyan(L('\n  Kullanılabilir modeller:\n', '\n  Available models:\n')));
            known.forEach((entry, index) => console.log(`  ${index + 1}. ${entry.id}${entry.id === model ? L(' ← aktif', ' ← active') : ''}`));
            console.log(chalk.gray(L('\n  Değiştir: /model <model-id>\n', '\n  Switch: /model <model-id>\n')));
            break;
          }
          model = arg;
          cfg.providerModel = model;
          require('../utils/config').saveConfig(cfg);
          console.log(chalk.green('  ✓ Model: ') + chalk.cyan(model));
          break;
        case 'identity':
          if (!arg) { console.log(chalk.yellow(`  ${L('Mevcut', 'Current')}: ${memory.botName || L('Asistan', 'Assistant')}`)); break; }
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
          console.log(chalk.green(L('  ✓ Bot adı: ', '  ✓ Bot name: ')) + chalk.cyan(arg));
          break;
        case 'tokens':
          console.log(chalk.gray(`  Token: ~${totalInputTokens} in / ~${totalOutputTokens} out`));
          break;
        case 'plan':
          if (arg === 'on' || arg === 'enter') {
            if (getPlanMode().enter()) console.log(tui.C.cyan(L('\n  📋 Plan modu aktif. Plan yapın ve /plan off ile çıkın.\n', '\n  📋 Plan mode active. Plan and exit with /plan off.\n')));
            else console.log(tui.C.yellow(L('  Zaten plan modunda.', '  Already in plan mode.')));
          } else if (arg === 'off' || arg === 'exit') {
            if (getPlanMode().isPlanning()) {
              console.log(tui.C.yellow(L('  Plan modundan çıkılıyor. Plan yazılıp ExitPlanMode ile sunulmalı.', '  Exiting plan mode. Write a plan and submit with ExitPlanMode.')));
              getPlanMode().approve();
            } else {
              console.log(tui.C.yellow(L('  Plan modunda değil.', '  Not in plan mode.')));
            }
          } else if (arg === 'show') {
            if (getPlanMode().planHistory.length > 0) {
              const last = getPlanMode().planHistory[getPlanMode().planHistory.length - 1];
              console.log(tui.C.cyan(L('\n  📋 Son Plan:\n', '\n  📋 Last Plan:\n')));
              console.log(`  ${last.plan.replace(/\n/g, '\n  ')}`);
            } else {
              console.log(tui.C.yellow(L('  Henüz plan yok.', '  No plan yet.')));
            }
          } else {
            console.log(tui.C.yellow(L('  Kullanım: /plan on|off|show', '  Usage: /plan on|off|show')));
          }
          break;
        case 'save':
          const sessId = saveSession(messages, {
            provider: providerUrl, model, user: cfg.userName, bot: memory.botName,
          });
          console.log(chalk.green(L('  ✓ Kaydedildi: ', '  ✓ Saved: ')) + chalk.cyan(sessId));
          break;
        default:
          // CLI komutları (REPL içinden)
          if (CLI_COMMANDS['/' + cmd]) {
            const cliCmd = CLI_COMMANDS['/' + cmd];
            if (cliCmd.needsArg && !arg) {
              console.log(chalk.yellow(`  ${cmd} ${L('bir argüman gerekli', 'requires an argument')}: ${cliCmd.desc}`));
            } else {
              console.log(chalk.gray(`  → ${cmd} ${L('çalıştırılıyor...', 'running...')}`));
              const args2 = [...cliCmd.run];
              if (arg && (cmd === 'seo' || cmd === 'naturehub')) args2.push(arg);
              await runCliCommand(args2);
            }
          } else {
            console.log(chalk.yellow(`  ${L('Bilinmeyen komut', 'Unknown command')}: /${cmd}. ${L('/help yazın.', 'type /help.')}`));
          }
      }
      safePrompt();
      return;
    }

    // User mesajı
    messages.push({ role: 'user', content: line });

    // Çok satırlı (paste) mesajları gönderildikten sonra ekranda göster
    if (line.indexOf('\n') !== -1) {
      process.stdout.write(tui.styled(L('  💬 Sen ▸ ', '  💬 You ▸ '), { color: tui.PALETTE.primary, bold: true }));
      process.stdout.write(line + '\n');
    }

    // v5.6.8: Hard-coded fallback - "sen kimsin?" sorulari icin dinamik botName
    const trimmed = foldTr(line || '');
    const isIdentityQuestion = /(sen\s+kim|adin\s+ne|kendini\s+tan|kendin\s+tanit|kimsin|ne\s+adindasin|who\s+are\s+you|what(?:'s|\s+is)\s+your\s+name|introduce\s+yourself)/.test(trimmed);
    if (isIdentityQuestion) {
      // v5.6.10: Hard-coded prefix minimal - model cevabini bozuyordu
      // Once sadece isim yaz, modelin devamini getirsin
      const displayName = memory.botName || L('Asistan', 'Assistant');
      process.stdout.write(tui.styled('\n  AI   ', { color: tui.PALETTE.secondary, bold: true }));
      process.stdout.write(L('Merhaba! Ben ', 'Hello! I am ') + displayName + '. ');
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

      // The workflow orchestrator used to run before EVERY message: an extra
      // model call to classify the request, then a second call to answer it or
      // to emit an up-front JSON plan. That is one wasted request per turn on
      // an agent that already has its own tool loop below. It is now opt-in
      // (`natureco config set chatWorkflow true`) for models that need the
      // scaffolding; on non-tool-calling providers it still engages
      // automatically, since there the XML agentic runner IS the tool loop.
      const wantStream = !!(process.stdout && process.stdout.isTTY);
      const useWorkflow = cfg.chatWorkflow === true || !supportsNativeToolCalls(providerUrl, model, cfg);
      let wf = {};
      if (useWorkflow) {
        if (!wantStream) process.stdout.write(tui.styled('\r  🔧 workflow...  ', { color: tui.PALETTE.muted }));
        const wfToolDefs = getToolDefs();
        const recentHistory = messages.length > 1 ? messages.slice(-10) : [];
        const wfResult = await executeTool('workflow', { action: 'run', task: line, conversationHistory: recentHistory, stream: wantStream }, wfToolDefs);
        wf = wfResult?.result || {};
        if (!wf.streamed) {
          if (wf.success !== false) {
            const loaded = wf.skillsLoaded && wf.skillsLoaded.length > 0 ? ` [skill: ${wf.skillsLoaded.join(', ')}]` : '';
            process.stdout.write(tui.styled(`  ✓ workflow${loaded}\n`, { color: tui.PALETTE.success }));
          } else {
            process.stdout.write(tui.styled('  ✗ workflow\n', { color: tui.PALETTE.danger }));
          }
        }
      }

      if (wf.passthrough && wf.reply !== undefined && wf.reply !== null) {
        // Simple chat — workflow handled it directly
        const fullReply = String(wf.reply);
        const displayBotName = memory.botName || L('Asistan', 'Assistant');
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
        // streamed ise yanit zaten canli basildi (sanitize edilerek) — tekrar basma
        if (wf.streamed) process.stdout.write('\n');
        else process.stdout.write('\n' + fixedReply + '\n');
        messages.push({ role: 'assistant', content: fixedReply });
        totalInputTokens += Math.ceil(line.length / 4);
        totalOutputTokens += Math.ceil(fullReply.length / 4);
      } else if (!useWorkflow || wf.status === 'completed' || (wf.results && wf.results.length > 0)) {
        // Two ways in:
        //  - workflow off (the default): the agent loop below IS the turn, so
        //    nothing is injected and sendStreaming drives tools itself;
        //  - workflow ran: its report is injected as context and the model
        //    turns those results into the user-facing answer.
        const preWfLen = messages.length;
        let injectedChars = 0;
        if (useWorkflow) {
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
            ? `\n\n${L('Kullanılan beceriler', 'Skills used')}: ${wf.skillsLoaded.join(', ')}`
            : '';
          messages.push({
            role: 'system',
            content: L(
              `=== İŞ AKIŞI SONUÇLARI ===\nŞu araçlar çalıştı:\n${report}${skillInfo}\n\nBu sonuçları kullanıcı için anlamlı biçimde özetle.\n=== SONUÇ BİTTİ ===`,
              `=== WORKFLOW RESULTS ===\nThe following tools ran:\n${report}${skillInfo}\n\nSummarize these results clearly for the user.\n=== END RESULTS ===`,
            ),
          });
          injectedChars = (messages[preWfLen].content || '').length;
        }
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
        if (useWorkflow) messages.splice(preWfLen, 1);
        // v5.6.12: Tam metin 'reply' olarak zaten geldi (non-stream mode)
        const fullReply = String(reply || '');
        // Bot adini al
        const displayBotName = memory.botName || L('Asistan', 'Assistant');
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
        totalInputTokens += Math.ceil(((fullReply || '').length + line.length + injectedChars) / 4);
        totalOutputTokens += Math.ceil((fullReply || '').length / 4);
      } else {
        // Workflow failed or returned unexpected format
        const fullReply = wf.error || JSON.stringify(wf).slice(0, 400) || L('İş akışı işlenemedi.', 'Workflow could not be processed.');
        const displayBotName = memory.botName || L('Asistan', 'Assistant');
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
    safePrompt();
  }

  rl.on('close', () => {
    _rlClosed = true;
    // EOF (pipe/script): süren yanıt varsa bitmesini bekle, sonra kapan
    const wait = () => {
      if (_busy > 0) { setTimeout(wait, 200); return; }
      cleanup(0);
    };
    wait();
  });
}

module.exports = startRepl;
// v5.40: test icin — cross-session hafiza bozulma regresyonu (kod adı ≠ kullanici adi)
module.exports.extractPreferenceFacts = extractPreferenceFacts;
module.exports._internal = { printHelp, CLI_COMMANDS, loadMemory, warmMcpTools, getToolDefs };
