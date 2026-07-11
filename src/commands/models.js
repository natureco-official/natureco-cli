const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const { getConfig, saveConfig } = require('../utils/config');
const { NatureCoError, handleError } = require('../utils/errors');

const PROVIDER_MODELS = {
  'api.groq.com': [
    { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B Versatile',  features: ['tool', 'vision'] },
    { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B Instant',     features: ['tool'] },
    { id: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision', features: ['tool', 'vision'] },
    { id: 'llama-3.1-70b-versatile',  label: 'Llama 3.1 70B Versatile',  features: ['tool'] },
    { id: 'mixtral-8x7b-32768',       label: 'Mixtral 8x7B',             features: ['tool'] },
    { id: 'gemma2-9b-it',             label: 'Gemma 2 9B',               features: [] },
    { id: 'llama-guard-3-8b',         label: 'Llama Guard 3 8B',         features: [] },
    { id: 'llama-3.2-1b-preview',     label: 'Llama 3.2 1B Preview',     features: [] },
    { id: 'llama-3.2-3b-preview',     label: 'Llama 3.2 3B Preview',     features: [] },
    { id: 'distil-whisper-large-v3-en', label: 'Distil Whisper v3',       features: ['audio'] },
  ],
  'api.openai.com': [
    { id: 'gpt-4o',                    label: 'GPT-4o',          features: ['tool', 'vision'] },
    { id: 'gpt-4o-mini',               label: 'GPT-4o Mini',     features: ['tool', 'vision'] },
    { id: 'gpt-4-turbo',               label: 'GPT-4 Turbo',     features: ['tool', 'vision'] },
    { id: 'gpt-4',                     label: 'GPT-4',           features: ['tool'] },
    { id: 'gpt-3.5-turbo',             label: 'GPT-3.5 Turbo',   features: ['tool'] },
    { id: 'o1-preview',                label: 'o1 Preview',      features: [] },
    { id: 'o1-mini',                   label: 'o1 Mini',         features: [] },
    { id: 'dall-e-3',                  label: 'DALL-E 3',        features: ['image'] },
    { id: 'tts-1',                     label: 'TTS-1',           features: ['audio'] },
    { id: 'whisper-1',                 label: 'Whisper-1',       features: ['audio'] },
  ],
  'api.anthropic.com': [
    { id: 'claude-opus-4-7',             label: 'Claude Opus 4.7',      features: ['tool', 'vision'] },
    { id: 'claude-sonnet-4-6',           label: 'Claude Sonnet 4.6',    features: ['tool', 'vision'] },
    { id: 'claude-haiku-4-5-20251001',   label: 'Claude Haiku 4.5',     features: ['tool', 'vision'] },
    { id: 'claude-3-5-sonnet-20241022',  label: 'Claude 3.5 Sonnet',    features: ['tool', 'vision'] },
    { id: 'claude-3-haiku-20240307',     label: 'Claude 3 Haiku',       features: ['tool', 'vision'] },
  ],
  'api.together.xyz': [
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo', features: ['tool'] },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',  label: 'Llama 3.1 8B Turbo',  features: ['tool'] },
    { id: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo', label: 'Llama 3.2 90B Vision', features: ['tool', 'vision'] },
    { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',         label: 'Mixtral 8x7B',        features: ['tool'] },
    { id: 'deepseek-ai/deepseek-coder-33b-instruct',      label: 'DeepSeek Coder 33B',  features: [] },
  ],
  'api.deepseek.com': [
    { id: 'deepseek-chat',     label: 'DeepSeek Chat',      features: ['tool'] },
    { id: 'deepseek-coder',    label: 'DeepSeek Coder',     features: ['tool'] },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner',  features: [] },
  ],
  'api.mistral.ai': [
    { id: 'mistral-large-latest', label: 'Mistral Large',   features: ['tool'] },
    { id: 'mistral-medium-latest', label: 'Mistral Medium', features: ['tool'] },
    { id: 'mistral-small-latest',  label: 'Mistral Small',  features: ['tool'] },
    { id: 'codestral-latest',      label: 'Codestral',      features: ['tool'] },
  ],
  'api.perplexity.ai': [
    { id: 'sonar-pro',            label: 'Sonar Pro',         features: ['tool'] },
    { id: 'sonar',                label: 'Sonar',             features: ['tool'] },
    { id: 'sonar-reasoning-pro',  label: 'Sonar Reasoning Pro', features: [] },
  ],
  'api.x.ai': [
    { id: 'grok-beta', label: 'Grok Beta', features: ['tool'] },
    { id: 'grok-vision-beta', label: 'Grok Vision Beta', features: ['tool', 'vision'] },
  ],
  'api.deepinfra.com': [
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B Instruct', features: ['tool'] },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct',  label: 'Llama 3.1 8B Instruct',  features: ['tool'] },
    { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',   label: 'Mixtral 8x22B',         features: ['tool'] },
  ],
  'fireworks.ai': [
    { id: 'accounts/fireworks/models/llama-v3p1-70b-instruct', label: 'Llama 3.1 70B Instruct', features: ['tool'] },
    { id: 'accounts/fireworks/models/llama-v3p1-8b-instruct',  label: 'Llama 3.1 8B Instruct',  features: ['tool'] },
  ],
  'natureco.me': [
    { id: 'natureco-default',  label: L('NatureCo Default (otomatik)', 'NatureCo Default (auto)'), features: ['tool'] },
    { id: 'natureco-fast',     label: L('NatureCo Fast (hızlı)', 'NatureCo Fast (fast)'),       features: ['tool'] },
    { id: 'natureco-reasoner', label: 'NatureCo Reasoner',           features: [] },
  ],
  'openrouter.ai': [
    { id: 'openrouter/auto',   label: L('OpenRouter Auto (otomatik seçim)', 'OpenRouter Auto (auto-select)'), features: ['tool', 'vision'] },
  ],
};

const PROVIDER_API_PATTERNS = [
  { match: 'openai.com', modelsEndpoint: 'https://api.openai.com/v1/models', type: 'openai' },
  { match: 'groq.com', modelsEndpoint: null, type: 'groq' },
  { match: 'anthropic.com', modelsEndpoint: null, type: 'anthropic' },
  { match: 'together.xyz', modelsEndpoint: null, type: 'openai' },
  { match: 'deepseek.com', modelsEndpoint: 'https://api.deepseek.com/v1/models', type: 'openai' },
  { match: 'mistral.ai', modelsEndpoint: 'https://api.mistral.ai/v1/models', type: 'openai' },
  { match: 'perplexity.ai', modelsEndpoint: 'https://api.perplexity.ai/v1/models', type: 'openai' },
  { match: 'x.ai', modelsEndpoint: 'https://api.x.ai/v1/models', type: 'openai' },
  { match: 'deepinfra.com', modelsEndpoint: 'https://api.deepinfra.com/v1/models', type: 'openai' },
  { match: 'fireworks.ai', modelsEndpoint: 'https://api.fireworks.ai/v1/models', type: 'openai' },
  { match: 'openrouter.ai', modelsEndpoint: 'https://openrouter.ai/api/v1/models', type: 'openrouter' },
  { match: 'natureco.me', modelsEndpoint: null, type: 'natureco' },
];

const FEATURE_ICONS = {
  tool: '🔧',
  vision: '👁',
  audio: '🎤',
  image: '🎨',
};

async function models(args) {
  const [action, ...params] = (args || []);

  if (!action || action === 'list' || action === 'status') {
    const opts = parseFlags(params);
    return listModels(opts);
  }
  if (action === 'set') return setModel(params[0]);
  if (action === 'scan') {
    const opts = parseFlags(params);
    return scanModels(opts);
  }
  if (action === 'aliases') return manageAliases(params);
  if (action === 'fallbacks') return manageFallbacks(params);
  if (action === 'set-image') return setImageModel(params[0]);
  if (action === 'image-fallbacks') return manageImageFallbacks(params);

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco models [list|set|scan|aliases|fallbacks|set-image|image-fallbacks]\n', '  Usage: natureco models [list|set|scan|aliases|fallbacks|set-image|image-fallbacks]\n')));
  process.exit(1);
}

function parseFlags(params) {
  return {
    refresh: params.includes('--refresh') || params.includes('-r'),
    probe: params.includes('--probe') || params.includes('-p'),
    json: params.includes('--json') || params.includes('-j'),
    all: params.includes('--all') || params.includes('-a'),
    provider: extractFlag(params, '--provider'),
    timeout: parseInt(extractFlag(params, '--timeout') || '10000', 10),
  };
}

function extractFlag(params, name) {
  const idx = params.indexOf(name);
  return idx >= 0 && idx + 1 < params.length ? params[idx + 1] : null;
}

async function listModels(opts) {
  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const currentModel = config.providerModel || '';
  const fallbackModel = config.fallbackModel || '';
  const count = opts.refresh ? 50 : 0;

  const providerHost = providerUrl.replace('https://', '').split('/')[0] || L('yapılandırılmamış', 'not configured');
  let liveModels = [];

  if (opts.refresh) {
    const endpoint = findModelsEndpoint(providerUrl);
    if (endpoint) {
      console.log(chalk.gray(L('\n  Canlı modeller taranıyor...\n', '\n  Scanning live models...\n')));
      try {
        liveModels = await fetchLiveModels(endpoint, config.providerApiKey, opts);
        if (liveModels.length > 0) {
          console.log(chalk.gray(`  ${liveModels.length} ${L('model bulundu', 'models found')}\n`));
        }
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ ${err.message}\n`));
      }
    }
  }

  if (opts.json) {
    const data = {
      provider: providerHost,
      currentModel,
      fallbackModel,
      models: liveModels.length > 0 ? liveModels : getKnownModels(providerUrl),
      liveModels: liveModels.length > 0,
    };
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(L('\n  Model Yapılandırması\n', '\n  Model Configuration\n')));
  console.log(chalk.gray('  Provider : ') + chalk.white(providerHost));
  console.log(chalk.gray(L('  Aktif    : ', '  Active   : ')) + chalk.cyan(currentModel || L('ayarlanmamış', 'not set')));
  if (fallbackModel) {
    console.log(chalk.gray(L('  Yedek    : ', '  Fallback : ')) + chalk.yellow(fallbackModel));
  }

  if (config.modelAliases && Object.keys(config.modelAliases).length > 0) {
    console.log(chalk.gray(L('  Takma ad : ', '  Alias    : ')) + chalk.white(
      Object.entries(config.modelAliases).map(([k, v]) => `${k}→${v}`).join(', ')
    ));
  }

  if (liveModels.length > 0) {
    console.log(chalk.cyan.bold(`\n  ${L('Canlı Modeller', 'Live Models')} (${liveModels.length})\n`));
    liveModels.slice(0, count || 30).forEach(m => {
      const active = m.id === currentModel ? chalk.green(L(' ← aktif', ' ← active')) : '';
      const fallback = m.id === fallbackModel ? chalk.yellow(L(' ← yedek', ' ← fallback')) : '';
      console.log(chalk.white(`  ${m.id}`) + active + fallback);
    });
    if (liveModels.length > 30 && !count) {
      console.log(chalk.gray(`  ... ${L('ve', 'and')} ${liveModels.length - 30} ${L('model daha (--refresh ile tümü)', 'more models (--refresh for all)')}`));
    }
  } else if (!opts.refresh) {
    const knownModels = getKnownModels(providerUrl);
    if (knownModels.length > 0) {
      console.log(chalk.cyan.bold(L('\n  Bilinen Modeller\n', '\n  Known Models\n')));
      knownModels.forEach(m => {
        const active = m.id === currentModel ? chalk.green(L(' ← aktif', ' ← active')) : '';
        const fallback = m.id === fallbackModel ? chalk.yellow(L(' ← yedek', ' ← fallback')) : '';
        const featureIcons = (m.features || []).map(f => FEATURE_ICONS[f] || '').join(' ');
        console.log(chalk.white(`  ${m.id}`) + active + fallback);
        console.log(chalk.gray(`    ${m.label}`) + (featureIcons ? ` ${featureIcons}` : ''));
      });
    }
  }

  if (opts.probe && config.providerUrl) {
    console.log(chalk.cyan.bold(L('\n  Canlı Sınama\n', '\n  Live Probe\n')));
    await probeProvider(config.providerUrl, config.providerApiKey, currentModel, opts);
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(L('  Değiştirmek  : ', '  Change       : ')) + chalk.cyan('natureco models set <model-id>'));
  console.log(chalk.gray(L('  Taramak      : ', '  Scan         : ')) + chalk.cyan('natureco models scan'));
  console.log(chalk.gray(L('  Yedek model  : ', '  Fallback     : ')) + chalk.cyan('natureco models fallbacks set <model-id>'));
  console.log(chalk.gray(L('  Canlı sınama : ', '  Live probe   : ')) + chalk.cyan('natureco models list --probe\n'));
}

async function setModel(modelId) {
  const config = getConfig();

  if (!modelId) {
    const knownModels = getKnownModels(config.providerUrl || '');
    if (knownModels.length === 0) {
      console.log(chalk.red(L('\n  ❌ Bu provider için bilinen model yok. Model ID\'sini parametre olarak verin.\n', '\n  ❌ No known models for this provider. Pass the model ID as a parameter.\n')));
      console.log(chalk.gray(L('  Kullanım: natureco models set <model-id>\n', '  Usage: natureco models set <model-id>\n')));
      process.exit(1);
    }
    console.log(chalk.cyan(L('\n  Mevcut Modeller\n', '\n  Available Models\n')));
    knownModels.forEach((m, i) => {
      console.log(chalk.white(`  ${i + 1}. ${m.id}`));
      console.log(chalk.gray(`     ${m.label}`));
    });
    console.log('');
    console.log(chalk.gray(L('  Kullanım: natureco models set <model-id>\n', '  Usage: natureco models set <model-id>\n')));
    return;
  }

  config.providerModel = modelId;
  saveConfig(config);
  console.log(chalk.green(`\n  ✓ ${L('Model güncellendi', 'Model updated')}: ${modelId}\n`));
}

async function scanModels(opts) {
  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const providerHost = providerUrl.replace('https://', '').split('/')[0] || '';

  const spinner = ['\\', '|', '/', '-'];
  let si = 0;
  const spin = setInterval(() => {
    process.stdout.write(`\r  ${chalk.gray(spinner[si % spinner.length])} ${L('Modeller taranıyor...', 'Scanning models...')}`);
    si++;
  }, 150);

  const allModels = [];
  const errors = [];

  // 1. Provider /v1/models API'sinden canlı tarama
  const endpoint = findModelsEndpoint(providerUrl);
  if (endpoint) {
    try {
      const live = await fetchLiveModels(endpoint, config.providerApiKey, { timeout: opts.timeout || 10000 });
      allModels.push(...live.map(m => ({ ...m, source: 'live' })));
    } catch (err) {
      errors.push(`API: ${err.message}`);
    }
  }

  // 2. OpenRouter ücretsiz model kataloğu
  if (!providerUrl || providerUrl.includes('openrouter')) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        signal: AbortSignal.timeout(opts.timeout || 10000),
      });
      if (res.ok) {
        const data = await res.json();
        const free = (data.data || []).filter(m => m.pricing?.prompt === '0');
        free.forEach(m => {
          if (!allModels.some(ex => ex.id === m.id)) {
            allModels.push({
              id: m.id,
              label: m.name || m.id,
              features: [],
              source: 'openrouter-free',
              context: m.context_length || null,
              pricing: m.pricing,
            });
          }
        });
      }
    } catch (err) {
      errors.push(`OpenRouter: ${err.message}`);
    }
  }

  // 3. Bilinen ${L('statik', 'static')} modeller
  const known = getKnownModels(providerUrl);
  known.forEach(m => {
    if (!allModels.some(ex => ex.id === m.id)) {
      allModels.push({ ...m, source: 'static' });
    }
  });

  clearInterval(spin);
  process.stdout.write('\r' + ' '.repeat(50) + '\r');

  if (opts.json) {
    console.log(JSON.stringify({
      models: allModels,
      total: allModels.length,
      sources: {
        live: allModels.filter(m => m.source === 'live').length,
        openrouter_free: allModels.filter(m => m.source === 'openrouter-free').length,
        static: allModels.filter(m => m.source === 'static').length,
      },
      errors: errors.length > 0 ? errors : undefined,
    }, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (errors.length > 0) {
    console.log(chalk.yellow(`\n  ⚠  ${errors.length} ${L('uyarı', 'warning(s)')}:`));
    errors.forEach(e => console.log(chalk.gray(`     ${e}`)));
  }

  const liveCount = allModels.filter(m => m.source === 'live').length;
  const freeCount = allModels.filter(m => m.source === 'openrouter-free').length;
  const staticCount = allModels.filter(m => m.source === 'static').length;

  console.log(chalk.cyan.bold(`\n  ${L('Modeller', 'Models')} (${allModels.length} ${L('bulundu', 'found')})\n`));
  console.log(chalk.gray(`  ${L('Kaynak', 'Source')}: ${liveCount} ${L('canlı', 'live')}, ${freeCount} ${L('ücretsiz', 'free')}, ${staticCount} ${L('statik', 'static')}\n`));

  if (liveCount > 0) {
    console.log(chalk.cyan(L('  Canlı Modeller\n', '  Live Models\n')));
    allModels.filter(m => m.source === 'live').slice(0, 20).forEach(m => {
      console.log(chalk.white(`  ${m.id}`));
      if (m.context) console.log(chalk.gray(`    ${L('Bağlam', 'Context')}: ${m.context} token`));
    });
    if (allModels.filter(m => m.source === 'live').length > 20) {
      console.log(chalk.gray(`  ... ${L('ve', 'and')} ${allModels.filter(m => m.source === 'live').length - 20} ${L('model daha', 'more models')}`));
    }
  }

  if (freeCount > 0) {
    console.log(chalk.cyan(L('\n  OpenRouter Ücretsiz Modeller\n', '\n  OpenRouter Free Models\n')));
    allModels.filter(m => m.source === 'openrouter-free').slice(0, 15).forEach(m => {
      console.log(chalk.white(`  ${m.id}`));
      if (m.label && m.label !== m.id) console.log(chalk.gray(`    ${m.label}`));
    });
    if (allModels.filter(m => m.source === 'openrouter-free').length > 15) {
      console.log(chalk.gray(`  ... ${L('ve', 'and')} ${allModels.filter(m => m.source === 'openrouter-free').length - 15} ${L('model daha', 'more models')}`));
    }
  }

  if (staticCount > 0 && liveCount === 0) {
    console.log(chalk.cyan(L('\n  Statik Modeller\n', '\n  Static Models\n')));
    allModels.filter(m => m.source === 'static').forEach(m => {
      const featureIcons = (m.features || []).map(f => FEATURE_ICONS[f] || '').join(' ');
      console.log(chalk.white(`  ${m.id}`) + (featureIcons ? ` ${featureIcons}` : ''));
      console.log(chalk.gray(`    ${m.label}`));
    });
  }

  const currentModel = config.providerModel || '';
  if (currentModel && !allModels.some(m => m.id === currentModel)) {
    console.log(chalk.yellow(`\n  ⚠  ${L('Mevcut model', 'Current model')} "${currentModel}" ${L('bu provider için bulunamadı.', 'was not found for this provider.')}`));
    console.log(chalk.gray(L('     Güncellemek için: ', '     To update: ')) + chalk.cyan('natureco models set <model-id>'));
  }

  console.log('');
}

function manageAliases(params) {
  const config = getConfig();
  const aliases = config.modelAliases || {};

  if (params.length === 0) {
    console.log(chalk.cyan.bold(L('\n  Model Takma Adları\n', '\n  Model Aliases\n')));
    if (Object.keys(aliases).length === 0) {
      console.log(chalk.gray(L('  Takma ad yok.\n', '  No aliases.\n')));
      console.log(chalk.gray(L('  Eklemek için: ', '  To add: ')) + chalk.cyan('natureco models aliases <alias> <model-id>\n'));
      return;
    }
    Object.entries(aliases).forEach(([alias, model]) => {
      console.log(chalk.white(`  ${alias.padEnd(15)} → `) + chalk.cyan(model));
    });
    console.log('');
    return;
  }

  if (params.length === 2) {
    const [alias, modelId] = params;
    aliases[alias] = modelId;
    config.modelAliases = aliases;
    saveConfig(config);
    console.log(chalk.green(`\n  ✓ ${L('Takma ad eklendi', 'Alias added')}: ${alias} → ${modelId}\n`));
    return;
  }

  if (params.length === 1 && (params[0] === 'clear' || params[0] === '--clear')) {
    config.modelAliases = {};
    saveConfig(config);
    console.log(chalk.green(L('\n  ✓ Tüm takma adlar temizlendi.\n', '\n  ✓ All aliases cleared.\n')));
    return;
  }

  if (params.length === 1 && aliases[params[0]]) {
    delete aliases[params[0]];
    config.modelAliases = aliases;
    saveConfig(config);
    console.log(chalk.green(`\n  ✓ ${L('Takma ad silindi', 'Alias removed')}: ${params[0]}\n`));
    return;
  }

  if (params.length === 1) {
    const resolved = resolveModel(params[0]);
    if (resolved) {
      console.log(chalk.cyan(`\n  ${params[0]} → ${resolved}\n`));
    } else {
      console.log(chalk.yellow(`\n  "${params[0]}" ${L('çözülemedi.', "couldn't be resolved.")}\n`));
    }
    return;
  }

  console.log(chalk.gray(L('\n  Kullanım: natureco models aliases [<takma-ad> <model-id>]\n', '\n  Usage: natureco models aliases [<alias> <model-id>]\n')));
}

function manageFallbacks(params) {
  const config = getConfig();

  if (params.length === 0 || params[0] === 'list') {
    console.log(chalk.cyan.bold(L('\n  Model Yedekleri\n', '\n  Model Fallbacks\n')));
    console.log(chalk.gray(L('  Birincil : ', '  Primary  : ')) + chalk.white(config.providerModel || L('ayarlanmamış', 'not set')));
    console.log(chalk.gray(L('  Yedek    : ', '  Fallback : ')) + chalk.white(config.fallbackModel || L('ayarlanmamış', 'not set')));
    console.log('');
    console.log(chalk.gray(L('  Ayarlamak için: ', '  To set: ')) + chalk.cyan('natureco models fallbacks set <model-id>\n'));
    return;
  }

  if (params[0] === 'set' && params[1]) {
    config.fallbackModel = params[1];
    saveConfig(config);
    console.log(chalk.green(`\n  ✓ ${L('Yedek model ayarlandı', 'Fallback model set')}: ${params[1]}\n`));
    return;
  }

  if (params[0] === 'clear') {
    delete config.fallbackModel;
    saveConfig(config);
    console.log(chalk.green(L('\n  ✓ Yedek model temizlendi.\n', '\n  ✓ Fallback model cleared.\n')));
    return;
  }

  console.log(chalk.gray(L('\n  Kullanım: natureco models fallbacks [list|set <model-id>|clear]\n', '\n  Usage: natureco models fallbacks [list|set <model-id>|clear]\n')));
}

function setImageModel(modelId) {
  if (!modelId) {
    console.log(chalk.cyan('\n  Current image model: ') + chalk.white(getConfig().imageModel || 'not set'));
    console.log(chalk.gray('\n  Usage: natureco models set-image <model-id>\n'));
    return;
  }
  const config = getConfig();
  config.imageModel = modelId;
  saveConfig(config);
  console.log(chalk.green(`\n  ✓ Image model set: ${modelId}\n`));
}

function manageImageFallbacks(params) {
  const config = getConfig();
  if (params.length === 0 || params[0] === 'list') {
    console.log(chalk.cyan.bold('\n  Image Model Fallbacks\n'));
    console.log(chalk.gray('  Primary    : ') + chalk.white(config.imageModel || 'not set'));
    console.log(chalk.gray('  Fallback   : ') + chalk.white(config.imageFallbackModel || 'not set'));
    console.log(chalk.gray('\n  Set: natureco models image-fallbacks set <model-id>'));
    console.log(chalk.gray('  Clear: natureco models image-fallbacks clear\n'));
    return;
  }
  if (params[0] === 'set' && params[1]) {
    config.imageFallbackModel = params[1];
    saveConfig(config);
    console.log(chalk.green(`\n  ✓ Image fallback set: ${params[1]}\n`));
    return;
  }
  if (params[0] === 'clear') {
    delete config.imageFallbackModel;
    saveConfig(config);
    console.log(chalk.green('\n  ✓ Image fallback cleared\n'));
    return;
  }
}

function resolveModel(input) {
  const config = getConfig();
  const aliases = config.modelAliases || {};
  if (aliases[input]) return aliases[input];

  const knownModels = getKnownModels(config.providerUrl || '');
  const match = knownModels.find(m => m.id === input);
  if (match) return match.id;

  if (input.includes('/')) return input;
  return null;
}

function getKnownModels(providerUrl) {
  for (const [domain, list] of Object.entries(PROVIDER_MODELS)) {
    if (providerUrl.includes(domain)) {
      return list;
    }
  }
  if (providerUrl.includes('openai') || providerUrl.includes('v1')) {
    return PROVIDER_MODELS['api.openai.com'];
  }
  return [];
}

function findModelsEndpoint(providerUrl) {
  if (!providerUrl) return null;
  for (const pattern of PROVIDER_API_PATTERNS) {
    if (providerUrl.includes(pattern.match)) {
      return pattern.modelsEndpoint || (providerUrl.replace(/\/v1\/.*$|\/$/, '') + '/v1/models');
    }
  }
  if (providerUrl.includes('/v1')) {
    return providerUrl.replace(/\/v1\/.*$/, '/v1/models');
  }
  return null;
}

async function fetchLiveModels(endpoint, apiKey, opts) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(opts.timeout || 10000),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(L('API key geçersiz veya yetkisiz erişim', 'Invalid API key or unauthorized'));
    }
    if (res.status === 404) {
      throw new Error(L('Provider bu endpoint\'i desteklemiyor (/v1/models)', 'Provider does not support this endpoint (/v1/models)'));
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const rawModels = data.data || data.models || [];

  return rawModels.map(m => ({
    id: m.id || m.name || String(m),
    label: m.name || m.id || String(m),
    context: m.context_length || m.max_tokens || m.context_window || null,
    features: [],
  }));
}

async function probeProvider(providerUrl, apiKey, modelId, opts) {
  const testModel = modelId || 'gpt-4o-mini';
  const testUrl = providerUrl.includes('/v1/')
    ? providerUrl
    : providerUrl.replace(/\/$/, '') + '/v1/chat/completions';

  const start = Date.now();
  try {
    const res = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'Respond with only the word "ok".' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(opts.timeout || 10000),
    });

    const ms = Date.now() - start;
    if (res.ok) {
      console.log(chalk.green(`  ✓ ${testModel}: ${ms}ms ${L('(yanıt alındı)', '(response received)')}`));
    } else if (res.status === 401 || res.status === 403) {
      console.log(chalk.red(`  ✗ ${testModel}: ${L('Yetkisiz', 'Unauthorized')} (${res.status})`));
    } else if (res.status === 429) {
      console.log(chalk.yellow(`  ⚠ ${testModel}: Rate limit (${res.status})`));
    } else {
      console.log(chalk.yellow(`  ⚠ ${testModel}: HTTP ${res.status} (${ms}ms)`));
    }
  } catch (err) {
    const ms = Date.now() - start;
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.log(chalk.red(`  ✗ ${testModel}: ${L('Zaman aşımı', 'Timeout')} (${opts.timeout}ms)`));
    } else {
      console.log(chalk.red(`  ✗ ${testModel}: ${err.message}`));
    }
  }
}

module.exports = models;
