const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProviderConfig } = require('./api');
const { AgentWorkspaceManager } = require('./agent-workspace');
const { getLang: _gl } = require('./i18n');

const SUB_AGENTS_FILE = path.join(os.homedir(), '.natureco', 'sub-agents.json');

/**
 * Sub-agent personas.
 *
 * These are both shown in `natureco team list` and sent to the model as the
 * sub-agent's system prompt. Five of the eight were Turkish-only while the rest
 * were English, so `team list` printed a mix and a sub-agent's working language
 * depended on which type you picked rather than on the interface language.
 *
 * Exposed as a getter so the language is resolved at call time, not at require
 * time (`natureco lang` can change it within a process).
 */
function buildSystemPrompts() {
  const L = (tr, en) => (_gl() === 'en' ? en : tr);
  return {
    explore: L(
      'Sen bir araştırma ajanısın. Bilgi bul, kod tabanını keşfet, dosyalarda ara. Kısa ve öz ol.',
      'You are a research agent. Find information, explore codebases, search files. Be concise.',
    ),
    general: L(
      'Sen genel amaçlı bir uygulama ajanısın. Kod yaz, hata düzelt, yeniden düzenle.',
      'You are a general-purpose implementation agent. Write code, fix bugs, refactor.',
    ),
    review: L(
      'Sen bir kod inceleme ajanısın. Kodu hata, güvenlik, performans ve stil açısından analiz et.',
      'You are a code review agent. Analyze code for bugs, security, performance, style.',
    ),
    seo: L(
      'Sen bir SEO uzmanısın. Anahtar kelime analizi, meta tag önerisi ve içerik optimizasyonu yaparsın.',
      'You are an SEO specialist. You do keyword analysis, meta tag suggestions and content optimization.',
    ),
    content: L(
      'Sen bir içerik yazarısın. NatureCo için SEO uyumlu, özgün blog yazıları ve sosyal medya içerikleri üretirsin. Hedef kitle: topluluk yöneticileri, içerik üreticileri ve geliştiriciler.',
      'You are a content writer. You produce original, SEO-friendly blog posts and social content for NatureCo. Audience: community managers, creators and developers.',
    ),
    security: L(
      'Sen bir güvenlik uzmanısın. OWASP Top 10, bağımlılık güvenliği ve secret sızıntısı tespiti yapar, düzeltme önerirsin.',
      'You are a security specialist. You cover the OWASP Top 10, dependency security and secret-leak detection, and propose remediation.',
    ),
    translator: L(
      'Sen bir çevirmensin. Doğal, akıcı, bağlama uygun çeviriler yaparsın. Teknik terimleri koruyarak sade dil kullanırsın.',
      'You are a translator. You produce natural, fluent, context-appropriate translations, keeping technical terms intact and the language plain.',
    ),
    debugger: L(
      'Sen bir hata ayıklama uzmanısın. Hata mesajlarını analiz eder, kök nedeni bulur, minimal bir düzeltme önerir veya uygularsın.',
      'You are a debugging specialist. You analyze error messages, find the root cause, and propose or apply a minimal fix.',
    ),
  };
}

// Reads like the old constant at every call site, but resolves per language.
const SYSTEM_PROMPTS = new Proxy({}, {
  get: (_t, key) => buildSystemPrompts()[key],
  ownKeys: () => Reflect.ownKeys(buildSystemPrompts()),
  has: (_t, key) => key in buildSystemPrompts(),
  getOwnPropertyDescriptor: (_t, key) => ({
    value: buildSystemPrompts()[key], enumerable: true, configurable: true, writable: false,
  }),
});

function ensureDir() {
  const dir = path.dirname(SUB_AGENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAgents() {
  ensureDir();
  if (!fs.existsSync(SUB_AGENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SUB_AGENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveAgents(agents) {
  ensureDir();
  fs.writeFileSync(SUB_AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function spawnSubAgent(type, task, options = {}) {
  const validTypes = Object.keys(SYSTEM_PROMPTS);
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid sub-agent type: ${type}. Valid: ${validTypes.join(', ')}`);
  }

  console.log(`  [Sub-agent ${type}] Spawned for: ${task.slice(0, 80)}`);

  const entry = {
    id: generateId(),
    type,
    task,
    status: 'running',
    result: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const agents = loadAgents();
  agents.push(entry);
  saveAgents(agents);

  try {
    const workspaceManager = options.workspaceManager || new AgentWorkspaceManager();
    const useWorkspace = options.isolatedWorktree !== false && ['general', 'debugger'].includes(type);
    const executeAgent = async (workspace = null) => {
    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      throw new Error('Provider not configured. Run: natureco configure');
    }

    const systemPrompt = (options.systemPrompt || SYSTEM_PROMPTS[type]) + (workspace ? `\n\nIsolated workspace: ${workspace.cwd}\nOnly operate inside this workspace.` : '');

    const baseUrl = providerConfig.url.replace(/\/+$/, '');
    const endpoint = `${baseUrl}/chat/completions`;

    const maxTokens = options.maxTokens || 512;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${providerConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Provider API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';

    entry.status = 'completed';
    entry.result = content;
    entry.completedAt = new Date().toISOString();
    saveAgents(loadAgents().map(a => a.id === entry.id ? entry : a));

    const usage = data.usage || {};
    const duration = new Date(entry.completedAt) - new Date(entry.startedAt);

    return { result: content, usage, duration, workspace: workspace?.cwd || null };
    };
    if (useWorkspace) {
      const isolated = await workspaceManager.run(entry.id, executeAgent, { merge: options.mergeWorktree === true });
      if (!isolated.ok) throw new Error(isolated.error);
      return isolated.result;
    }
    return await executeAgent();
  } catch (err) {
    entry.status = 'failed';
    entry.result = err.message;
    entry.completedAt = new Date().toISOString();
    saveAgents(loadAgents().map(a => a.id === entry.id ? entry : a));

    throw err;
  }
}

async function spawnParallel(agents) {
  const promises = agents.map(a =>
    spawnSubAgent(a.type, a.task, a.options || {}).then(
      result => ({ status: 'fulfilled', result }),
      error => ({ status: 'rejected', reason: error.message })
    )
  );

  const results = await Promise.allSettled(promises);

  const failed = results.filter(r => r.status === 'rejected');
  return { results, failed };
}

function getStatus() {
  const agents = loadAgents();
  const last20 = agents.slice(-20).reverse();
  return {
    total: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    completed: agents.filter(a => a.status === 'completed').length,
    failed: agents.filter(a => a.status === 'failed').length,
    agents: last20,
  };
}

module.exports = {
  spawnSubAgent,
  spawnParallel,
  getStatus,
  SYSTEM_PROMPTS,
};
