'use strict';

// Text/chat model fallbacks used when a provider cannot expose its live
// model catalog. Keep this deliberately small: live provider APIs remain the
// source of truth for account-specific availability.
const PROVIDERS = {
  openai: {
    name: 'OpenAI (GPT)', url: 'https://api.openai.com/v1', default: 'gpt-5.6-sol',
    models: [
      ['gpt-5.6-sol', 'GPT-5.6 Sol', 'flagship', 'Complex reasoning and coding'],
      ['gpt-5.6-terra', 'GPT-5.6 Terra', 'balanced', 'Intelligence and cost balance'],
      ['gpt-5.6-luna', 'GPT-5.6 Luna', 'fast', 'High-volume, cost-sensitive work'],
      ['gpt-5.6', 'GPT-5.6 (latest alias)', 'flagship', 'Alias for GPT-5.6 Sol'],
    ],
  },
  anthropic: {
    name: 'Anthropic (Claude)', url: 'https://api.anthropic.com/v1', default: 'claude-fable-5',
    models: [
      ['claude-fable-5', 'Claude Fable 5', 'flagship', 'Most capable widely released Claude'],
      ['claude-opus-5', 'Claude Opus 5', 'flagship', 'Complex agentic coding'],
      ['claude-sonnet-5', 'Claude Sonnet 5', 'balanced', 'Speed and intelligence balance'],
      ['claude-haiku-4-5', 'Claude Haiku 4.5', 'fast', 'Fast near-frontier model'],
      ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5 (pinned)', 'fast', 'Pinned API version'],
    ],
  },
  gemini: {
    name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta', default: 'gemini-3.5-flash',
    models: [
      ['gemini-3.6-flash', 'Gemini 3.6 Flash', 'flagship', 'Agentic and multimodal coding'],
      ['gemini-3.5-flash', 'Gemini 3.5 Flash', 'flagship', 'Sustained agentic performance'],
      ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'fast', 'High-throughput execution'],
      ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 'fast', 'Efficient stable model'],
      ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'preview', 'Frontier preview'],
    ],
  },
  groq: {
    name: 'Groq', url: 'https://api.groq.com/openai/v1', default: 'openai/gpt-oss-120b',
    models: [
      ['openai/gpt-oss-120b', 'GPT-OSS 120B', 'flagship', 'Production reasoning model'],
      ['openai/gpt-oss-20b', 'GPT-OSS 20B', 'fast', 'Fast production model'],
      ['qwen/qwen3.6-27b', 'Qwen 3.6 27B', 'preview', 'Current coding/reasoning preview'],
      ['groq/compound', 'Groq Compound', 'agentic', 'Web search and code execution system'],
      ['groq/compound-mini', 'Groq Compound Mini', 'fast', 'Fast agentic system'],
    ],
  },
  deepseek: {
    name: 'DeepSeek', url: 'https://api.deepseek.com/v1', default: 'deepseek-chat',
    models: [
      ['deepseek-chat', 'DeepSeek Chat', 'balanced', 'General chat and tool use'],
      ['deepseek-reasoner', 'DeepSeek Reasoner', 'reasoning', 'Reasoning model'],
    ],
  },
  ollama: {
    name: 'Ollama (local)', url: 'http://localhost:11434/v1', default: 'qwen3-coder',
    models: [
      ['qwen3-coder', 'Qwen 3 Coder', 'flagship', 'Local coding model'],
      ['llama4', 'Llama 4', 'flagship', 'Current Llama family'],
      ['deepseek-r1', 'DeepSeek R1', 'reasoning', 'Local reasoning model'],
      ['gemma3', 'Gemma 3', 'balanced', 'Efficient multimodal model'],
    ],
  },
  minimax: {
    name: 'MiniMax', url: 'https://api.minimax.io', default: 'MiniMax-M2.7',
    models: [
      ['MiniMax-M2.7', 'MiniMax M2.7', 'flagship', 'Latest engineering and agent model'],
      ['MiniMax-M2.7-highspeed', 'MiniMax M2.7 Highspeed', 'fast', 'M2.7 with faster inference'],
      ['MiniMax-M2.5', 'MiniMax M2.5', 'balanced', 'Code generation and refactoring'],
      ['MiniMax-M2.5-highspeed', 'MiniMax M2.5 Highspeed', 'fast', 'Faster M2.5 inference'],
      ['MiniMax-M2.1', 'MiniMax M2.1', 'legacy', 'Previous coding generation'],
      ['MiniMax-M2.1-highspeed', 'MiniMax M2.1 Highspeed', 'legacy', 'Faster M2.1 inference'],
      ['MiniMax-M2', 'MiniMax M2', 'legacy', 'Agentic legacy model'],
    ],
  },
  openrouter: {
    name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', default: 'openrouter/auto',
    models: [
      ['openrouter/auto', 'OpenRouter Auto', 'agentic', 'Automatic model routing'],
      ['~openai/gpt-latest', 'OpenAI GPT Latest', 'flagship', 'Latest OpenAI alias'],
      ['x-ai/grok-4.5', 'Grok 4.5', 'flagship', 'Current Grok flagship'],
    ],
  },
  mistral: {
    name: 'Mistral AI', url: 'https://api.mistral.ai/v1', default: 'mistral-medium-latest',
    models: [
      ['mistral-medium-latest', 'Mistral Medium 3.5', 'flagship', 'Agentic and coding model'],
      ['mistral-small-latest', 'Mistral Small 4', 'balanced', 'Efficient hybrid model'],
      ['mistral-large-latest', 'Mistral Large', 'flagship', 'General flagship alias'],
      ['codestral-latest', 'Codestral', 'coding', 'Code-focused model alias'],
    ],
  },
  cohere: {
    name: 'Cohere', url: 'https://api.cohere.ai/v1', default: 'command-a-03-2025',
    models: [
      ['command-a-03-2025', 'Command A', 'flagship', 'Agentic enterprise model'],
      ['command-r7b-12-2024', 'Command R7B', 'fast', 'Efficient retrieval model'],
      ['command-r-plus-08-2024', 'Command R+', 'legacy', 'Pinned Command R+'],
      ['command-r-08-2024', 'Command R', 'legacy', 'Pinned Command R'],
    ],
  },
  xai: {
    name: 'xAI (Grok)', url: 'https://api.x.ai/v1', default: 'grok-4.5',
    models: [
      ['grok-4.5', 'Grok 4.5', 'flagship', 'Code and agentic tool calling'],
    ],
  },
  together: {
    name: 'Together AI', url: 'https://api.together.xyz/v1', default: 'MiniMaxAI/MiniMax-M3',
    models: [
      ['MiniMaxAI/MiniMax-M3', 'MiniMax M3', 'flagship', 'Current serverless agent model'],
      ['Qwen/Qwen3.7-Max', 'Qwen 3.7 Max', 'flagship', 'Current Qwen flagship'],
      ['Qwen/Qwen3.6-Plus', 'Qwen 3.6 Plus', 'balanced', 'Long-context Qwen model'],
      ['moonshotai/Kimi-K3', 'Kimi K3', 'flagship', 'Current Kimi flagship'],
      ['moonshotai/Kimi-K2.7-Code', 'Kimi K2.7 Code', 'coding', 'Coding model'],
      ['deepseek-ai/DeepSeek-V4-Pro', 'DeepSeek V4 Pro', 'reasoning', 'Current DeepSeek serverless model'],
      ['openai/gpt-oss-120b', 'GPT-OSS 120B', 'balanced', 'Open-weight reasoning model'],
    ],
  },
  perplexity: {
    name: 'Perplexity', url: 'https://api.perplexity.ai', default: 'sonar-pro',
    models: [
      ['sonar-pro', 'Sonar Pro', 'flagship', 'Advanced grounded search'],
      ['sonar', 'Sonar', 'fast', 'Fast grounded search'],
      ['sonar-reasoning-pro', 'Sonar Reasoning Pro', 'reasoning', 'Grounded multi-step reasoning'],
      ['sonar-deep-research', 'Sonar Deep Research', 'research', 'Exhaustive research reports'],
    ],
  },
  deepinfra: {
    name: 'DeepInfra', url: 'https://api.deepinfra.com/v1/openai', default: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo',
    models: [
      ['Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo', 'Qwen3 Coder 480B Turbo', 'coding', 'Current coding model'],
      ['openai/gpt-oss-120b', 'GPT-OSS 120B', 'flagship', 'Open-weight reasoning model'],
      ['deepseek-ai/DeepSeek-V3.1-Terminus', 'DeepSeek V3.1 Terminus', 'balanced', 'General instruction model'],
      ['zai-org/GLM-4.6', 'GLM 4.6', 'balanced', 'Agentic model'],
    ],
  },
  fireworks: {
    name: 'Fireworks AI', url: 'https://api.fireworks.ai/inference/v1', default: 'accounts/fireworks/models/gpt-oss-120b',
    models: [
      ['accounts/fireworks/models/gpt-oss-120b', 'GPT-OSS 120B', 'flagship', 'Recommended serverless flagship'],
      ['accounts/fireworks/models/gpt-oss-20b', 'GPT-OSS 20B', 'fast', 'Fast serverless model'],
    ],
  },
  natureco: {
    name: 'NatureCo', url: 'https://api.natureco.me/v1', default: 'natureco-default',
    models: [
      ['natureco-default', 'NatureCo Default', 'balanced', 'Automatic default routing'],
      ['natureco-fast', 'NatureCo Fast', 'fast', 'Low-latency routing'],
      ['natureco-reasoner', 'NatureCo Reasoner', 'reasoning', 'Reasoning routing'],
    ],
  },
  kimi: {
    name: 'Moonshot AI (Kimi)', url: 'https://api.moonshot.ai/v1', default: 'kimi-k3',
    models: [
      ['kimi-k3', 'Kimi K3', 'flagship', 'Latest strongest Kimi model'],
      ['kimi-k2.5', 'Kimi K2.5', 'flagship', 'Current multimodal agent model'],
      ['kimi-k2-thinking', 'Kimi K2 Thinking', 'reasoning', 'Long-form reasoning model'],
    ],
  },
  glm: {
    name: 'Z.ai (GLM)', url: 'https://api.z.ai/api/paas/v4', default: 'glm-5.1',
    models: [
      ['glm-5.1', 'GLM 5.1', 'flagship', 'Long-horizon coding and agents'],
      ['glm-5', 'GLM 5', 'flagship', 'Planning, coding and debugging'],
      ['glm-5-turbo', 'GLM 5 Turbo', 'fast', 'Fast complex agent execution'],
      ['glm-4.7', 'GLM 4.7', 'balanced', 'Agentic coding model'],
      ['glm-4.7-flashx', 'GLM 4.7 FlashX', 'fast', 'Fast lightweight model'],
      ['glm-4.7-flash', 'GLM 4.7 Flash', 'fast', 'Free lightweight model'],
      ['glm-4.6', 'GLM 4.6', 'legacy', 'Previous coding model'],
      ['glm-4.5-flash', 'GLM 4.5 Flash', 'legacy', 'Free legacy model'],
    ],
  },
};

const HOST_TO_PROVIDER = [
  ['api.openai.com', 'openai'], ['api.anthropic.com', 'anthropic'],
  ['generativelanguage.googleapis.com', 'gemini'], ['api.groq.com', 'groq'],
  ['api.deepseek.com', 'deepseek'], ['localhost:11434', 'ollama'],
  ['api.minimax.io', 'minimax'], ['api.minimaxi.com', 'minimax'],
  ['openrouter.ai', 'openrouter'], ['api.mistral.ai', 'mistral'],
  ['api.cohere.ai', 'cohere'], ['api.x.ai', 'xai'], ['api.together.xyz', 'together'],
  ['api.perplexity.ai', 'perplexity'], ['api.deepinfra.com', 'deepinfra'],
  ['fireworks.ai', 'fireworks'], ['natureco.me', 'natureco'],
  ['api.moonshot.ai', 'kimi'], ['api.moonshot.cn', 'kimi'], ['api.z.ai', 'glm'],
];

function normalizeModels(models) {
  return models.map(([id, label, tier, desc]) => ({
    id, label, tier, desc, features: ['tool'], cost: '',
  }));
}

function providerKeyFromUrl(url = '') {
  const value = String(url).toLowerCase();
  return HOST_TO_PROVIDER.find(([host]) => value.includes(host))?.[1] || null;
}

function getProviderModels(urlOrKey = '') {
  const key = PROVIDERS[urlOrKey] ? urlOrKey : providerKeyFromUrl(urlOrKey);
  return key ? normalizeModels(PROVIDERS[key].models) : [];
}

function getSetupPresets(L = (tr) => tr) {
  const presets = {};
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    presets[key] = {
      name: key === 'groq' ? L('Groq (hızlı)', 'Groq (fast)') : provider.name,
      url: provider.url,
      default: provider.default,
      models: normalizeModels(provider.models),
    };
  }
  presets.custom = {
    name: 'Custom URL', url: '', default: 'custom',
    models: [{ id: 'custom', label: 'Custom', tier: 'custom', desc: L('Manuel model adı', 'Manual model ID'), cost: '' }],
  };
  return presets;
}

function applySetupCatalog(target, L) {
  const current = getSetupPresets(L);
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, current);
  return target;
}

/**
 * Model seçim listesini üretir — HİÇBİR MODELİ DÜŞÜRMEDEN.
 *
 * Eskiden bu mantık setup.js içinde satır içiydi ve gruplar sabit kodluydu:
 * flagship/reasoning, balanced, fast, classic, audio/vision/embedding/custom.
 * Bu listelerin hiçbirine uymayan bir `tier` değeri modeli SESSİZCE
 * düşürüyordu. Ölçüldü: 76 modelin 15'i seçim ekranında hiç görünmüyordu
 * (preview, agentic, legacy, coding, research katmanlarının tamamı). Model
 * katalogda vardı ve `natureco models` onu listeliyordu, ama kurulumda
 * seçilemiyordu.
 *
 * Ayrıca satır `${label} (${cost})` biçimindeydi; `cost` katalogda 76/76 boş
 * olduğu için ekranda "Claude Fable 5 ()" görünüyordu.
 *
 * @param {Array<{id:string,label:string,tier?:string,desc?:string,cost?:string}>} models
 * @param {(tr:string,en:string)=>string} L
 */
function buildModelChoices(models, L = (tr) => tr) {
  const KATMAN_SIRASI = [
    ['flagship', L('🟢 GÜÇLÜ (en iyi)', '🟢 POWERFUL (best)')],
    ['reasoning', L('🧠 DÜŞÜNEN (reasoning)', '🧠 REASONING')],
    ['balanced', L('🟡 ORTA (dengeli)', '🟡 MID (balanced)')],
    ['fast', L('🔵 HIZLI / UCUZ', '🔵 FAST / CHEAP')],
    ['coding', L('💻 KODLAMA', '💻 CODING')],
    ['agentic', L('🤖 AJAN', '🤖 AGENTIC')],
    ['research', L('🔎 ARAŞTIRMA', '🔎 RESEARCH')],
    ['preview', L('🧪 ÖNİZLEME', '🧪 PREVIEW')],
    ['audio', L('🔊 SES', '🔊 AUDIO')],
    ['vision', L('👁 GÖRÜ', '👁 VISION')],
    ['embedding', L('🧮 EMBEDDING', '🧮 EMBEDDING')],
    ['classic', L('⚪ KLASİK', '⚪ CLASSIC')],
    ['legacy', L('⚪ ESKİ (legacy)', '⚪ LEGACY')],
  ];

  const liste = Array.isArray(models) ? models : [];
  const satir = (m) => {
    const ek = [m.desc, m.cost].filter(x => x && String(x).trim()).join(' · ');
    return { name: ek ? `  ${m.label || m.id} — ${ek}` : `  ${m.label || m.id}`, value: m.id };
  };

  const secenekler = [];
  const yerlesenler = new Set();
  for (const [katman, baslik] of KATMAN_SIRASI) {
    const grup = liste.filter(m => m.tier === katman);
    if (!grup.length) continue;
    grup.forEach(m => yerlesenler.add(m.id));
    secenekler.push({ name: '─────────────────────', disabled: true });
    secenekler.push({ name: baslik, disabled: true });
    secenekler.push(...grup.map(satir));
  }
  // Yakalayıcı: bilinmeyen ya da eksik `tier` değeri olan modeller de listelenir.
  // Katalog büyüdükçe hiçbir model sessizce kaybolmaz.
  const kalanlar = liste.filter(m => !yerlesenler.has(m.id));
  if (kalanlar.length) {
    secenekler.push({ name: '─────────────────────', disabled: true });
    secenekler.push({ name: L('📦 DİĞER', '📦 OTHER'), disabled: true });
    secenekler.push(...kalanlar.map(satir));
  }
  return secenekler;
}

module.exports = {
  PROVIDERS, providerKeyFromUrl, getProviderModels, getSetupPresets,
  applySetupCatalog, buildModelChoices,
};
