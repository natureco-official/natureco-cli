const chalk = require('chalk');
const { getConfig } = require('../utils/config');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);

const CAPABILITY_MODEL_PATTERNS = {
  chat: { patterns: ['llama', 'gpt', 'claude', 'mixtral', 'gemma', 'deepseek', 'mistral', 'grok', 'command'] },
  vision: { patterns: ['vision', 'gpt-4o', 'gpt-4-turbo', 'claude', 'llama-3.2', 'llama-3.3', 'grok-vision'] },
  embeddings: { patterns: ['embedding', 'text-embedding', 'gte', 'e5-'] },
  tts: { patterns: ['tts', 'eleven', 'playai'] },
  stt: { patterns: ['whisper', 'deepgram', 'distil-whisper', 'stt'] },
  images: { patterns: ['dall-e', 'dall-e-3', 'stable-diffusion', 'sdxl', 'flux', 'imagen'] },
  video: { patterns: ['runway', 'pika', 'sora', 'video'] },
  music: { patterns: ['suno', 'udio', 'music'] },
  audio: { patterns: ['audio', 'whisper', 'bark'] },
  code: { patterns: ['code', 'deepseek-coder', 'codestral', 'qwen-coder'] },
  search: { patterns: ['search', 'tavily', 'perplexity', 'exa'] },
  reasoning: { patterns: ['reasoner', 'reasoning', 'deepseek-reasoner', 'o1', 'o3'] },
};

async function capability(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listCapabilities();
  if (action === 'infer' || action === 'check') return inferCapabilities(params[0]);

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco capability [list|infer]\n', '  Usage: natureco capability [list|infer]\n')));
  process.exit(1);
}

async function listCapabilities() {
  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const apiKey = config.providerApiKey || '';

  const providerHost = providerUrl.replace('https://', '').split('/')[0] || 'yapılandırılmamış';

  console.log(chalk.cyan('\n  Provider Capabilities\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(`  Provider: ${providerHost}\n`));

  let liveModels = [];
  if (apiKey && providerUrl) {
    try {
      const endpoint = providerUrl.replace(/\/v1\/.*$|\/$/, '') + '/v1/models';
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        liveModels = (data.data || data.models || []).map(m => ({ id: m.id || m }));
      }
    } catch {}
  }

  const capabilities = {
    chat: { providers: [], status: false },
    vision: { providers: [], status: false },
    code: { providers: [], status: false },
    reasoning: { providers: [], status: false },
    embeddings: { providers: [], status: false },
    tts: { providers: [], status: false },
    stt: { providers: [], status: false },
    images: { providers: [], status: false },
    audio: { providers: [], status: false },
    search: { providers: [], status: false },
  };

  if (liveModels.length > 0) {
    for (const [cap, def] of Object.entries(CAPABILITY_MODEL_PATTERNS)) {
      const matched = liveModels.filter(m =>
        def.patterns.some(p => m.id.toLowerCase().includes(p))
      );
      if (matched.length > 0) {
        capabilities[cap].providers = [providerHost];
        capabilities[cap].status = true;
        capabilities[cap].models = matched.map(m => m.id).slice(0, 5);
      }
    }
  } else {
    const knownModels = getKnownProviderModels(providerUrl);
    for (const [cap, def] of Object.entries(CAPABILITY_MODEL_PATTERNS)) {
      const matched = knownModels.filter(m =>
        def.patterns.some(p => m.toLowerCase().includes(p))
      );
      if (matched.length > 0) {
        capabilities[cap].providers = [providerHost];
        capabilities[cap].status = true;
      }
    }
  }

  if (apiKey && !capabilities.chat.status) {
    capabilities.chat.status = true;
    capabilities.chat.providers = [providerHost];
  }

  for (const [cap, info] of Object.entries(capabilities)) {
    const icon = info.status ? chalk.green('●') : chalk.gray('○');
    const detail = info.status && info.models
      ? chalk.gray('(' + info.models.join(', ') + ')')
      : '';
    console.log(`  ${icon} ${chalk.white(cap.padEnd(12))} ${detail}`);
  }

  console.log(chalk.gray('\n  Capabilities are inferred from available models.\n'));
  console.log(chalk.gray(L('  Detaylı sorgu: ', '  Detailed query: ')) + chalk.cyan('natureco capability infer <provider>\n'));
}

function getKnownProviderModels(providerUrl) {
  const providerModels = {
    'api.groq.com': ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-90b-vision-preview', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'llama-guard-3-8b', 'llama-3.2-1b-preview', 'llama-3.2-3b-preview', 'distil-whisper-large-v3-en'],
    'api.openai.com': ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini', 'dall-e-3', 'tts-1', 'whisper-1', 'text-embedding-3-large'],
    'api.anthropic.com': ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
    'api.together.xyz': ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'deepseek-ai/deepseek-coder-33b-instruct'],
    'api.deepseek.com': ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    'api.mistral.ai': ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'codestral-latest'],
    'api.perplexity.ai': ['sonar-pro', 'sonar', 'sonar-reasoning-pro'],
    'api.x.ai': ['grok-beta', 'grok-vision-beta'],
    'api.deepinfra.com': ['meta-llama/Meta-Llama-3.1-70B-Instruct', 'meta-llama/Meta-Llama-3.1-8B-Instruct', 'mistralai/Mixtral-8x22B-Instruct-v0.1'],
    'fireworks.ai': ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'accounts/fireworks/models/llama-v3p1-8b-instruct'],
    'openrouter.ai': ['openrouter/auto'],
  };
  for (const [domain, models] of Object.entries(providerModels)) {
    if (providerUrl.includes(domain)) return models;
  }
  if (providerUrl.includes('openai') || providerUrl.includes('v1')) {
    return providerModels['api.openai.com'];
  }
  return [];
}

async function inferCapabilities(provider) {
  if (!provider) {
    console.log(chalk.red(L('\n  ❌ Provider adı gerekli\n', '\n  ❌ Provider name required\n')));
    process.exit(1);
  }

  const config = getConfig();
  const apiKey = config[`${provider}ApiKey`] || process.env[`${provider.toUpperCase()}_API_KEY`];

  console.log(chalk.cyan(`\n  Inferring capabilities for: ${provider}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (!apiKey) {
    console.log(chalk.red(`  ❌ No API key for ${provider}\n`));
    process.exit(1);
  }

  const urls = {
    openai: 'https://api.openai.com',
    groq: 'https://api.groq.com/openai',
    anthropic: 'https://api.anthropic.com',
    deepseek: 'https://api.deepseek.com',
    mistral: 'https://api.mistral.ai',
    xai: 'https://api.x.ai',
    together: 'https://api.together.xyz',
    perplexity: 'https://api.perplexity.ai',
    deepinfra: 'https://api.deepinfra.com',
    fireworks: 'https://api.fireworks.ai',
    openrouter: 'https://openrouter.ai',
  };

  const baseUrl = urls[provider] || `${config.providerUrl || ''}`;
  if (!baseUrl) {
    console.log(chalk.red(`  ❌ Bilinmeyen provider: ${provider}\n`));
    process.exit(1);
  }

  const modelsEndpoint = baseUrl.replace(/\/$/, '') + '/v1/models';
  let models = [];
  let probeError = null;

  console.log(`  ${chalk.gray('Fetching models...')}`);

  try {
    const res = await fetch(modelsEndpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      models = (data.data || data.models || []).map(m => m.id || m);
      console.log(`  ${chalk.green('✓')} ${chalk.white('models')}: ${chalk.gray(`${models.length} model found`)}`);
    } else if (res.status === 401) {
      probeError = 'Geçersiz API key';
      console.log(`  ${chalk.red('✗')} ${chalk.white('models')}: ${chalk.red(probeError)}`);
    } else if (res.status === 404) {
      console.log(`  ${chalk.yellow('⚠')} ${chalk.white('models')}: ${chalk.gray('Provider does not expose /v1/models')}`);
    } else {
      console.log(`  ${chalk.yellow('⚠')} ${chalk.white('models')}: ${chalk.gray(`HTTP ${res.status}`)}`);
    }
  } catch (err) {
    console.log(`  ${chalk.red('✗')} ${chalk.white('models')}: ${chalk.red(err.message)}`);
  }

  const capabilities = ['chat', 'vision', 'code', 'reasoning', 'embeddings', 'tts', 'stt', 'images', 'audio'];
  for (const cap of capabilities) {
    const def = CAPABILITY_MODEL_PATTERNS[cap];
    const matched = models.filter(m => def.patterns.some(p => m.toLowerCase().includes(p)));
    if (matched.length > 0) {
      console.log(`  ${chalk.green('✓')} ${chalk.white(cap.padEnd(12))}: ${chalk.gray(matched.slice(0, 3).join(', '))}`);
    } else if (!probeError && models.length > 0) {
      console.log(`  ${chalk.gray('○')} ${chalk.white(cap.padEnd(12))}: ${chalk.gray('not detected')}`);
    } else if (probeError) {
      console.log(`  ${chalk.gray('○')} ${chalk.white(cap.padEnd(12))}: ${chalk.gray('unavailable')}`);
    }
  }

  if (models.length > 0) {
    console.log(`\n  ${chalk.green('✓')} ${chalk.white('chat')}:       ${chalk.green('confirmed')}`);
    try {
      const chatUrl = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
      const testRes = await fetch(chatUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: models[0],
          messages: [{ role: 'user', content: 'say ok' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (testRes.ok) {
        console.log(`  ${chalk.green('✓')} ${chalk.white('chat_test')}:   ${chalk.green('working')}`);
      } else {
        console.log(`  ${chalk.yellow('⚠')} ${chalk.white('chat_test')}:   ${chalk.gray(`HTTP ${testRes.status}`)}`);
      }
    } catch (err) {
      console.log(`  ${chalk.yellow('⚠')} ${chalk.white('chat_test')}:   ${chalk.gray(err.message)}`);
    }
  }

  console.log();
}

module.exports = capability;
