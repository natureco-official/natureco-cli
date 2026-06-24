const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProviderConfig } = require('./api');

const SUB_AGENTS_FILE = path.join(os.homedir(), '.natureco', 'sub-agents.json');

const SYSTEM_PROMPTS = {
  explore: 'You are a research agent. Find information, explore codebases, search files. Be concise.',
  general: 'You are a general-purpose implementation agent. Write code, fix bugs, refactor.',
  review: 'You are a code review agent. Analyze code for bugs, security, performance, style.',
  // Phase 7 — NatureCo specialized agents
  seo: 'Sen bir SEO uzmanısın. Anahtar kelime analizi, meta tag önerisi, içerik optimizasyonu yaparsın. Türkçe ve İngilizce içerik için öneri ver.',
  content: 'Sen bir içerik yazarısın. NatureCo için SEO uyumlu, özgün blog yazıları ve sosyal medya içerikleri üretirsin. Hedef kitle: doğa ve teknoloji meraklıları, geliştiriciler.',
  security: 'Sen bir güvenlik uzmanısın. OWASP top 10, dependency güvenliği, secret sızıntısı tespiti yapar, remediation önerirsin.',
  translator: 'Sen bir çevirmensin. Doğal, akıcı, bağlama uygun çeviriler yaparsın. Teknik terimleri koruyarak sade dil kullanırsın.',
  debugger: 'Sen bir debugging uzmanısın. Hata mesajlarını analiz eder, kök nedeni bulur, minimal bir fix önerir veya uygularsın.',
};

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
    const providerConfig = getProviderConfig();
    if (!providerConfig) {
      throw new Error('Provider not configured. Run: natureco configure');
    }

    const systemPrompt = options.systemPrompt || SYSTEM_PROMPTS[type];

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

    return { result: content, usage, duration };
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
