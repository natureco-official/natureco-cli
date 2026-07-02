/**
 * NatureCo CLI — Cost Tracker & Model Router (Phase 4)
 *
 * Token kullanımını USD maliyete çevirir, model router ile
 * basit soruları ucuz modellere yönlendirir, bütçe aşımında uyarır.
 *
 * OpenClaw: $50-200/ay token patlaması.
 * NatureCo: Hedef $5-15/ay akıllı routing ile.
 *
 * Fiyatlar 2026 Haziran itibarıyladır, değişebilir.
 */

// Fiyatlar (USD / 1M token). Provider+model bazlı.
const PRICING = {
  // MiniMax — pay-as-you-go fiyatları (tahmini, güncellenebilir)
  'minimax:MiniMax-M3':             { input: 0.30, output: 1.20 },
  'minimax:MiniMax-M2.7':           { input: 0.15, output: 0.60 },
  'minimax:MiniMax-M2.7-highspeed': { input: 0.20, output: 0.80 },
  'minimax:MiniMax-M2.5':           { input: 0.15, output: 0.60 },
  'minimax:MiniMax-M2.5-highspeed': { input: 0.20, output: 0.80 },
  'minimax:MiniMax-M2.1':           { input: 0.10, output: 0.40 },
  'minimax:MiniMax-M2.1-highspeed': { input: 0.12, output: 0.50 },
  'minimax:MiniMax-M2':             { input: 0.10, output: 0.40 },

  // Groq — genelde ücretsiz tier var, indirimli
  'groq:llama-3.1-8b-instant':   { input: 0.05, output: 0.08 },
  'groq:llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'groq:mixtral-8x7b-32768':     { input: 0.27, output: 0.27 },
  'groq:llama-3.2-90b-vision-preview': { input: 0.90, output: 0.90 },

  // OpenAI
  'openai:gpt-4o':                { input: 2.50, output: 10.00 },
  'openai:gpt-4o-mini':           { input: 0.15, output: 0.60 },
  'openai:gpt-4-turbo':           { input: 10.00, output: 30.00 },
  'openai:o1-mini':               { input: 3.00, output: 12.00 },
  'openai:o1':                    { input: 15.00, output: 60.00 },

  // Anthropic
  'anthropic:claude-sonnet-4-6':  { input: 3.00, output: 15.00 },
  'anthropic:claude-haiku-4-5':   { input: 0.80, output: 4.00 },
  'anthropic:claude-opus-4-5':    { input: 15.00, output: 75.00 },

  // DeepSeek (çok ucuz)
  'deepseek:deepseek-chat':       { input: 0.14, output: 0.28 },
  'deepseek:deepseek-coder':      { input: 0.14, output: 0.28 },

  // Together AI
  'together:meta-llama/Llama-3.3-70B-Instruct-Turbo': { input: 0.88, output: 0.88 },

  // Fireworks
  'fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct': { input: 0.90, output: 0.90 },

  // Local (ücretsiz)
  'ollama:llama3.3':              { input: 0, output: 0 },
  'ollama:qwen2.5-coder':         { input: 0, output: 0 },
  'lmstudio:local':               { input: 0, output: 0 },
};

const DEFAULT_PRICING = { input: 1.00, output: 3.00 };

function getPricingKey(provider, model) {
  if (!provider || !model) return null;
  const p = provider.toLowerCase().replace(/^https?:\/\/[^/]+\//, '');
  return `${p}:${model}`;
}

function getPricing(provider, model) {
  const key = getPricingKey(provider, model);
  if (key && PRICING[key]) return PRICING[key];
  // Provider'ı bul, ilk modelini kullan
  const prefix = `${provider.toLowerCase()}:`;
  for (const [k, v] of Object.entries(PRICING)) {
    if (k.startsWith(prefix)) return v;
  }
  return DEFAULT_PRICING;
}

/**
 * Token kullanımını USD'ye çevir.
 * @param {object} usage - { input: number, output: number }
 * @param {string} provider
 * @param {string} model
 * @returns {number} USD
 */
function calculateCost(usage, provider, model) {
  const pricing = getPricing(provider, model);
  const inputCost = (usage.input || 0) / 1_000_000 * pricing.input;
  const outputCost = (usage.output || 0) / 1_000_000 * pricing.output;
  return inputCost + outputCost;
}

/**
 * Model router — görev tipine göre en uygun modeli öner.
 *
 * Karmaşıklık seviyesi:
 *  - "simple": Basit soru, kısa cevap, sınıflandırma
 *  - "medium": Genel sohbet, doküman özetleme
 *  - "complex": Kod yazma, mimari karar, çok adımlı reasoning
 *  - "creative": Yaratıcı yazı, hikaye, içerik üretimi
 */
const ROUTING = {
  simple: {
    description: 'Basit sorular — sınıflandırma, kısa cevaplar',
    models: [
      { provider: 'groq', model: 'llama-3.1-8b-instant', reason: 'En ucuz, hızlı, çoğu basit görev için yeterli' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Yedek: daha kaliteli ama ucuz' },
      { provider: 'anthropic', model: 'claude-haiku-4-5', reason: 'Yüksek kalite gerekiyorsa' },
    ],
  },
  medium: {
    description: 'Genel sohbet, özetleme, doküman analizi',
    models: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Dengeli fiyat/kalite' },
      { provider: 'anthropic', model: 'claude-haiku-4-5', reason: 'Daha kaliteli cevap' },
      { provider: 'openai', model: 'gpt-4o-mini', reason: 'OpenAI istiyorsan' },
    ],
  },
  complex: {
    description: 'Kod yazma, mimari, çok adımlı reasoning',
    models: [
      { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Hızlı, yeterince akıllı' },
      { provider: 'anthropic', model: 'claude-sonnet-4-6', reason: 'Kod için en iyi kalite' },
      { provider: 'openai', model: 'gpt-4o', reason: 'OpenAI istiyorsan' },
    ],
  },
  creative: {
    description: 'Yaratıcı yazı, hikaye, içerik üretimi',
    models: [
      { provider: 'anthropic', model: 'claude-sonnet-4-6', reason: 'Yaratıcı yazıda güçlü' },
      { provider: 'openai', model: 'gpt-4o', reason: 'OpenAI yaratıcı kalitesi' },
      { provider: 'groq', model: 'llama-3.3-70b-versatile', reason: 'Ücretsiz denemek için' },
    ],
  },
};

/**
 * Basit karmaşıklık tahmini — prompt içeriğine bakarak.
 */
function estimateComplexity(prompt) {
  if (!prompt) return 'simple';
  const text = prompt.toLowerCase();
  const len = text.length;

  // Code işaretleri
  const codeIndicators = (text.match(/```|function|class|import|const |let |var |=>|\{|\}/g) || []).length;
  if (codeIndicators >= 3) return 'complex';

  // Karmaşık soru işaretleri
  const complexKeywords = ['mimari', 'tasarla', 'analiz', 'karşılaştır', 'açıkla', 'optimize et', 'refactor', 'debug', 'neden', 'nasıl çalışır'];
  if (complexKeywords.some(k => text.includes(k))) return 'complex';

  // Yaratıcı işaretler
  const creativeKeywords = ['yaz', 'hikaye', 'şiir', 'blog', 'içerik', 'makale', 'yaratıcı', 'senaryo'];
  if (creativeKeywords.some(k => text.includes(k)) && len > 100) return 'creative';

  // Uzun metin → medium
  if (len > 500) return 'medium';

  return 'simple';
}

/**
 * Bir prompt için önerilen modeli döner.
 */
function suggestModel(prompt, options = {}) {
  const { forceComplexity, currentProvider, currentModel } = options;

  // Mevcut model zaten pahalıysa ve görev basitse, uyar
  const complexity = forceComplexity || estimateComplexity(prompt);
  const route = ROUTING[complexity];

  if (!route) return null;

  // Mevcut model routing listesinde mi?
  if (currentProvider && currentModel) {
    const matched = route.models.find(m => m.provider === currentProvider.toLowerCase() && m.model === currentModel);
    if (matched) {
      return { complexity, ...matched, optimal: true };
    }
  }

  // İlk öneriyi döndür
  return { complexity, ...route.models[0], optimal: false };
}

/**
 * Bir kullanım kaydını cost-tracker'a ekle.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const COST_FILE = path.join(os.homedir(), '.natureco', 'cost-tracking.json');
const BUDGET_CONFIG_FILE = path.join(os.homedir(), '.natureco', 'budget-config.json');

const DEFAULT_BUDGET = {
  dailyLimit: 5.00,       // USD/gün
  monthlyLimit: 100.00,  // USD/ay
  warnAt: 0.75,          // %75'inde uyar
  downgradeAt: 0.90,     // %90'ında otomatik downgrade
};

function loadBudget() {
  try {
    if (fs.existsSync(BUDGET_CONFIG_FILE)) {
      return { ...DEFAULT_BUDGET, ...JSON.parse(fs.readFileSync(BUDGET_CONFIG_FILE, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULT_BUDGET };
}

function saveBudget(budget) {
  const dir = path.dirname(BUDGET_CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BUDGET_CONFIG_FILE, JSON.stringify(budget, null, 2), 'utf8');
}

function loadCosts() {
  try {
    if (fs.existsSync(COST_FILE)) {
      return JSON.parse(fs.readFileSync(COST_FILE, 'utf8'));
    }
  } catch {}
  return { entries: [] };
}

function saveCosts(data) {
  const dir = path.dirname(COST_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(COST_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Yeni bir kullanım kaydı ekle.
 */
function recordUsage({ provider, model, input, output, sessionId, command }) {
  const data = loadCosts();
  const cost = calculateCost({ input, output }, provider, model);
  const entry = {
    ts: new Date().toISOString(),
    provider,
    model,
    input: input || 0,
    output: output || 0,
    cost,
    sessionId: sessionId || null,
    command: command || null,
  };
  data.entries.push(entry);
  // Maksimum 10.000 entry tut (eski dosyaları rotate et)
  if (data.entries.length > 10000) {
    data.entries = data.entries.slice(-10000);
  }
  saveCosts(data);
  return entry;
}

/**
 * Belirli bir dönem için toplam maliyet.
 */
function totalForPeriod(period = 'today') {
  const data = loadCosts();
  const now = new Date();
  let cutoff;

  switch (period) {
    case 'today':
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      break;
    case 'week':
      cutoff = now.getTime() - 7 * 86400000;
      break;
    case 'month':
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      break;
    case 'all':
      cutoff = 0;
      break;
    default:
      cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  const filtered = data.entries.filter(e => new Date(e.ts).getTime() >= cutoff);
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const byProvider = {};
  const byModel = {};

  for (const e of filtered) {
    totalCost += e.cost;
    totalInput += e.input;
    totalOutput += e.output;
    byProvider[e.provider] = (byProvider[e.provider] || 0) + e.cost;
    byModel[`${e.provider}:${e.model}`] = (byModel[`${e.provider}:${e.model}`] || 0) + e.cost;
  }

  return {
    period,
    entries: filtered.length,
    totalCost,
    totalInput,
    totalOutput,
    byProvider,
    byModel,
    topModel: Object.entries(byModel).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
  };
}

/**
 * Bütçe kontrolü — limit aşıldı mı?
 */
function checkBudget() {
  const budget = loadBudget();
  const today = totalForPeriod('today');
  const month = totalForPeriod('month');

  const dailyUsage = today.totalCost / budget.dailyLimit;
  const monthlyUsage = month.totalCost / budget.monthlyLimit;

  return {
    daily: {
      spent: today.totalCost,
      limit: budget.dailyLimit,
      usage: dailyUsage,
      exceeded: dailyUsage >= 1.0,
      warning: dailyUsage >= budget.warnAt,
    },
    monthly: {
      spent: month.totalCost,
      limit: budget.monthlyLimit,
      usage: monthlyUsage,
      exceeded: monthlyUsage >= 1.0,
      warning: monthlyUsage >= budget.warnAt,
    },
    shouldDowngrade: dailyUsage >= budget.downgradeAt || monthlyUsage >= budget.downgradeAt,
  };
}

function formatUSD(amount) {
  if (amount === 0) return '$0.00';
  // 1 sentin altı: yalnızca sent işareti ("0.15¢"), $ ile karıştırma
  if (amount < 0.01) return `${(amount * 100).toFixed(2)}¢`;
  return `$${amount.toFixed(4)}`;
}

module.exports = {
  PRICING,
  ROUTING,
  DEFAULT_BUDGET,
  getPricing,
  calculateCost,
  estimateComplexity,
  suggestModel,
  loadBudget,
  saveBudget,
  recordUsage,
  totalForPeriod,
  checkBudget,
  formatUSD,
};
