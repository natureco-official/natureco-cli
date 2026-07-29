const chalk = require('chalk');
const { getConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getProviderModels } = require('../utils/model-catalog');

const STATE_FILE = path.join(os.homedir(), '.natureco', 'infer-state.json');

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function writeState(state) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.log(chalk.yellow('  \u26A0 Could not write state: ' + err.message));
  }
}

const MODEL_FEATURE_MAP = [
  { pattern: 'vision', features: ['vision', 'multimodal'] },
  { pattern: 'gpt-4o', features: ['chat', 'vision', 'code'] },
  { pattern: 'gpt-4-turbo', features: ['chat', 'vision'] },
  { pattern: 'claude', features: ['chat', 'vision', 'code'] },
  { pattern: 'llama-3.2', features: ['chat', 'vision'] },
  { pattern: 'llama-3.3', features: ['chat', 'vision'] },
  { pattern: 'grok-vision', features: ['chat', 'vision'] },
  { pattern: 'deepseek-coder', features: ['chat', 'code'] },
  { pattern: 'codestral', features: ['chat', 'code'] },
  { pattern: 'qwen-coder', features: ['chat', 'code'] },
  { pattern: 'embedding', features: ['embedding'] },
  { pattern: 'tts', features: ['tts'] },
  { pattern: 'whisper', features: ['stt', 'audio'] },
  { pattern: 'distil-whisper', features: ['stt', 'audio'] },
  { pattern: 'dall-e', features: ['images'] },
  { pattern: 'stable-diffusion', features: ['images'] },
  { pattern: 'suno', features: ['music'] },
  { pattern: 'reasoner', features: ['reasoning'] },
  { pattern: 'o1-preview', features: ['reasoning', 'chat'] },
  { pattern: 'o1-mini', features: ['reasoning', 'chat'] },
  { pattern: 'o3', features: ['reasoning', 'chat'] },
  { pattern: 'sonar', features: ['search', 'chat'] },
];

async function infer(args) {
  const [action, sub1, sub2, ...rest] = args || [];

  if (!action) {
    console.log(chalk.cyan('\n  OpenClaw Infer\n'));
    console.log(chalk.gray('  Usage:'));
    console.log(chalk.white('    natureco infer <command> [options]'));
    console.log();
    console.log(chalk.gray('  Commands:'));
    console.log(chalk.white('    models                        ') + chalk.gray('List available models'));
    console.log(chalk.white('    media                         ') + chalk.gray('Show media capabilities'));
    console.log(chalk.white('    capabilities                  ') + chalk.gray('Show provider capabilities'));
    console.log(chalk.white('    list                          ') + chalk.gray('List model providers'));
    console.log(chalk.white('    inspect <provider>            ') + chalk.gray('Inspect a provider'));
    console.log(chalk.white('    model run <prompt>            ') + chalk.gray('Run inference'));
    console.log(chalk.white('    model list                    ') + chalk.gray('List models'));
    console.log(chalk.white('    model inspect <model>         ') + chalk.gray('Inspect a model'));
    console.log(chalk.white('    model providers               ') + chalk.gray('List model providers'));
    console.log(chalk.white('    model auth login <provider>   ') + chalk.gray('Authenticate with provider'));
    console.log(chalk.white('    model auth logout <provider>  ') + chalk.gray('Logout from provider'));
    console.log(chalk.white('    model auth status             ') + chalk.gray('Show auth status'));
    console.log(chalk.white('    image generate <prompt>       ') + chalk.gray('Generate image'));
    console.log(chalk.white('    image edit <path> <prompt>    ') + chalk.gray('Edit an image'));
    console.log(chalk.white('    image describe <path>         ') + chalk.gray('Describe an image'));
    console.log(chalk.white('    image describe-many <dir>     ') + chalk.gray('Describe multiple images'));
    console.log(chalk.white('    image providers               ') + chalk.gray('List image providers'));
    console.log(chalk.white('    audio transcribe <path>       ') + chalk.gray('Transcribe audio'));
    console.log(chalk.white('    audio providers               ') + chalk.gray('List audio providers'));
    console.log(chalk.white('    tts convert <text>            ') + chalk.gray('Text to speech'));
    console.log(chalk.white('    tts voices                    ') + chalk.gray('List voices'));
    console.log(chalk.white('    tts providers                 ') + chalk.gray('List TTS providers'));
    console.log(chalk.white('    tts status                    ') + chalk.gray('Show TTS status'));
    console.log(chalk.white('    tts enable                    ') + chalk.gray('Enable TTS'));
    console.log(chalk.white('    tts disable                   ') + chalk.gray('Disable TTS'));
    console.log(chalk.white('    tts set-provider <name>       ') + chalk.gray('Set TTS provider'));
    console.log(chalk.white('    video generate <prompt>       ') + chalk.gray('Generate video'));
    console.log(chalk.white('    video describe <path>         ') + chalk.gray('Describe video'));
    console.log(chalk.white('    video providers               ') + chalk.gray('List video providers'));
    console.log(chalk.white('    web search <query>            ') + chalk.gray('Web search'));
    console.log(chalk.white('    web fetch <url>               ') + chalk.gray('Fetch a URL'));
    console.log(chalk.white('    web providers                 ') + chalk.gray('List web providers'));
    console.log(chalk.white('    embedding create <text>       ') + chalk.gray('Create embedding'));
    console.log(chalk.white('    embedding providers           ') + chalk.gray('List embedding providers'));
    console.log(chalk.white('    auth <provider>               ') + chalk.gray('Test authentication'));
    console.log(chalk.white('    auth add <provider> <key>     ') + chalk.gray('Add auth key'));
    console.log(chalk.white('    auth login <provider>         ') + chalk.gray('OAuth login'));
    console.log(chalk.white('    auth login-github-copilot     ') + chalk.gray('GitHub Copilot auth'));
    console.log(chalk.white('    auth setup-token              ') + chalk.gray('Setup token auth'));
    console.log(chalk.white('    auth paste-token              ') + chalk.gray('Paste auth token'));
    console.log(chalk.white('    auth order get                ') + chalk.gray('Get auth order'));
    console.log(chalk.white('    auth order set <providers..>  ') + chalk.gray('Set auth order'));
    console.log(chalk.white('    auth order clear              ') + chalk.gray('Clear auth order'));
    console.log();
    return;
  }

  if (action === 'models') return inferModels();
  if (action === 'media') return inferMedia();
  if (action === 'capabilities') return inferCapabilities();
  if (action === 'list') return inferList();

  if (action === 'inspect') {
    if (!sub1) {
      console.log(chalk.red('\n  \u274C Provider name required\n'));
      console.log(chalk.gray('  Usage: natureco infer inspect <provider>\n'));
      process.exit(1);
    }
    return inferInspect(sub1);
  }

  if (action === 'model') {
    if (!sub1) {
      console.log(chalk.red('\n  \u274C Model subcommand required\n'));
      console.log(chalk.gray('  Usage: natureco infer model <run|list|inspect|providers|auth>\n'));
      process.exit(1);
    }
    if (sub1 === 'run') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Prompt required\n'));
        console.log(chalk.gray('  Usage: natureco infer model run [<model>] <prompt>\n'));
        process.exit(1);
      }
      if (rest.length === 0) {
        return inferModelRun(sub2, null);
      }
      return inferModelRun(rest.join(' '), sub2);
    }
    if (sub1 === 'list') return inferModelList();
    if (sub1 === 'inspect') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Model name required\n'));
        console.log(chalk.gray('  Usage: natureco infer model inspect <model>\n'));
        process.exit(1);
      }
      return inferModelInspect(sub2);
    }
    if (sub1 === 'providers') return inferModelProviders();
    if (sub1 === 'auth') {
      if (sub2 === 'login') {
        if (!rest[0]) {
          console.log(chalk.red('\n  \u274C Provider name required\n'));
          process.exit(1);
        }
        return inferModelAuthLogin(rest[0]);
      }
      if (sub2 === 'logout') {
        if (!rest[0]) {
          console.log(chalk.red('\n  \u274C Provider name required\n'));
          process.exit(1);
        }
        return inferModelAuthLogout(rest[0]);
      }
      if (sub2 === 'status') return inferModelAuthStatus();
      console.log(chalk.red('\n  \u274C Unknown model auth subcommand\n'));
      console.log(chalk.gray('  Usage: natureco infer model auth <login|logout|status>\n'));
      process.exit(1);
    }
    console.log(chalk.red('\n  \u274C Unknown model subcommand: ' + sub1 + '\n'));
    console.log(chalk.gray('  Usage: natureco infer model <run|list|inspect|providers|auth>\n'));
    process.exit(1);
  }

  if (action === 'image') {
    if (!sub1) {
      return inferImage('');
    }
    if (sub1 === 'generate') {
      const prompt = [sub2, ...rest].join(' ');
      if (!prompt.trim()) {
        console.log(chalk.red('\n  \u274C Prompt required\n'));
        console.log(chalk.gray('  Usage: natureco infer image generate <prompt>\n'));
        process.exit(1);
      }
      return inferImageGenerate(prompt);
    }
    if (sub1 === 'edit') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Image path required\n'));
        process.exit(1);
      }
      const prompt = rest.join(' ');
      if (!prompt.trim()) {
        console.log(chalk.red('\n  \u274C Edit prompt required\n'));
        process.exit(1);
      }
      return inferImageEdit(sub2, prompt);
    }
    if (sub1 === 'describe') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Image path required\n'));
        process.exit(1);
      }
      return inferImageDescribe(sub2);
    }
    if (sub1 === 'describe-many') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Directory path required\n'));
        process.exit(1);
      }
      return inferImageDescribeMany(sub2);
    }
    if (sub1 === 'providers') return inferImageProviders();
    const oldPrompt = [sub1, sub2, ...rest].join(' ');
    return inferImage(oldPrompt);
  }

  if (action === 'audio') {
    if (sub1 === 'transcribe') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Audio file path required\n'));
        console.log(chalk.gray('  Usage: natureco infer audio transcribe <path>\n'));
        process.exit(1);
      }
      return inferAudioTranscribe(sub2);
    }
    if (sub1 === 'providers') return inferAudioProviders();
    const oldPrompt = [sub1, sub2, ...rest].join(' ');
    return inferAudio(oldPrompt);
  }

  if (action === 'tts') {
    if (sub1 === 'convert') {
      const text = [sub2, ...rest].join(' ');
      if (!text.trim()) {
        console.log(chalk.red('\n  \u274C Text required\n'));
        console.log(chalk.gray('  Usage: natureco infer tts convert <text>\n'));
        process.exit(1);
      }
      return inferTtsConvert(text);
    }
    if (sub1 === 'voices') return inferTtsVoices();
    if (sub1 === 'providers') return inferTtsProviders();
    if (sub1 === 'status') return inferTtsStatus();
    if (sub1 === 'enable') return inferTtsEnable();
    if (sub1 === 'disable') return inferTtsDisable();
    if (sub1 === 'set-provider') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Provider name required\n'));
        process.exit(1);
      }
      return inferTtsSetProvider(sub2);
    }
    const oldText = [sub1, sub2, ...rest].join(' ');
    return inferTts(oldText);
  }

  if (action === 'video') {
    if (sub1 === 'generate') {
      const prompt = [sub2, ...rest].join(' ');
      if (!prompt.trim()) {
        console.log(chalk.red('\n  \u274C Prompt required\n'));
        console.log(chalk.gray('  Usage: natureco infer video generate <prompt>\n'));
        process.exit(1);
      }
      return inferVideoGenerate(prompt);
    }
    if (sub1 === 'describe') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Video path required\n'));
        process.exit(1);
      }
      return inferVideoDescribe(sub2);
    }
    if (sub1 === 'providers') return inferVideoProviders();
    const oldPrompt = [sub1, sub2, ...rest].join(' ');
    return inferVideo(oldPrompt);
  }

  if (action === 'web') {
    if (sub1 === 'search') {
      const query = [sub2, ...rest].join(' ');
      if (!query.trim()) {
        console.log(chalk.red('\n  \u274C Search query required\n'));
        console.log(chalk.gray('  Usage: natureco infer web search <query>\n'));
        process.exit(1);
      }
      return inferWebSearch(query);
    }
    if (sub1 === 'fetch') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C URL required\n'));
        console.log(chalk.gray('  Usage: natureco infer web fetch <url>\n'));
        process.exit(1);
      }
      return inferWebFetch(sub2);
    }
    if (sub1 === 'providers') return inferWebProviders();
    const oldQuery = [sub1, sub2, ...rest].join(' ');
    return inferWeb(oldQuery);
  }

  if (action === 'embedding') {
    if (sub1 === 'create') {
      const text = [sub2, ...rest].join(' ');
      if (!text.trim()) {
        console.log(chalk.red('\n  \u274C Text required\n'));
        console.log(chalk.gray('  Usage: natureco infer embedding create <text>\n'));
        process.exit(1);
      }
      return inferEmbeddingCreate(text);
    }
    if (sub1 === 'providers') return inferEmbeddingProviders();
    const oldText = [sub1, sub2, ...rest].join(' ');
    return inferEmbedding(oldText);
  }

  if (action === 'auth') {
    if (!sub1) {
      return inferAuth();
    }
    if (sub1 === 'add') {
      if (!sub2 || rest.length === 0) {
        console.log(chalk.red('\n  \u274C Usage: natureco infer auth add <provider> <key>\n'));
        process.exit(1);
      }
      return inferAuthAdd(sub2, rest.join(' '));
    }
    if (sub1 === 'login') {
      if (!sub2) {
        console.log(chalk.red('\n  \u274C Provider name required\n'));
        process.exit(1);
      }
      return inferAuthLogin(sub2);
    }
    if (sub1 === 'login-github-copilot') return inferAuthLoginGithubCopilot();
    if (sub1 === 'setup-token') return inferAuthSetupToken();
    if (sub1 === 'paste-token') return inferAuthPasteToken();
    if (sub1 === 'order') {
      if (sub2 === 'get') return inferAuthOrderGet();
      if (sub2 === 'set') {
        if (rest.length === 0) {
          console.log(chalk.red('\n  \u274C Usage: natureco infer auth order set <providers...>\n'));
          process.exit(1);
        }
        return inferAuthOrderSet(rest);
      }
      if (sub2 === 'clear') return inferAuthOrderClear();
      console.log(chalk.red('\n  \u274C Unknown order subcommand\n'));
      process.exit(1);
    }
    return inferAuth(sub1);
  }

  console.log(chalk.red('\n  \u274C Unknown command: ' + action + '\n'));
  console.log(chalk.gray('  Usage: natureco infer [models|media|capabilities|list|inspect|model|image|audio|tts|video|web|embedding|auth]\n'));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Existing functions (unchanged)
// ---------------------------------------------------------------------------

async function inferModels() {
  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const apiKey = config.providerApiKey || '';

  console.log(chalk.cyan('\n  Inferring models...\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  const providers = [
    { name: 'openai', url: 'https://api.openai.com/v1/models', key: config.openaiApiKey || process.env.OPENAI_API_KEY },
    { name: 'anthropic', url: null, key: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY },
    { name: 'groq', url: 'https://api.groq.com/openai/v1/models', key: config.groqApiKey || process.env.GROQ_API_KEY },
    { name: 'deepseek', url: 'https://api.deepseek.com/v1/models', key: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY },
    { name: 'mistral', url: 'https://api.mistral.ai/v1/models', key: config.mistralApiKey || process.env.MISTRAL_API_KEY },
    { name: 'xai', url: 'https://api.x.ai/v1/models', key: config.xaiApiKey || process.env.XAI_API_KEY },
    { name: 'perplexity', url: 'https://api.perplexity.ai/v1/models', key: config.perplexityApiKey || process.env.PERPLEXITY_API_KEY },
    { name: 'together', url: 'https://api.together.xyz/v1/models', key: config.togetherApiKey || process.env.TOGETHER_API_KEY },
    { name: 'openrouter', url: 'https://openrouter.ai/api/v1/models', key: config.openrouterApiKey || process.env.OPENROUTER_API_KEY },
  ];

  for (const p of providers) {
    if (!p.key) {
      console.log('  ' + chalk.gray('\u25CB') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.gray('not configured'));
      continue;
    }

    if (!p.url) {
      console.log('  ' + chalk.green('\u25CF') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.gray('API key found'));
      continue;
    }

    try {
      const res = await fetch(p.url, {
        headers: { Authorization: 'Bearer ' + p.key, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const models = (data.data || data.models || []).map(m => m.id || m);
        const modelCount = models.length;
        const supported = models.slice(0, 5).join(', ');
        const more = modelCount > 5 ? '... +' + (modelCount - 5) : '';
        console.log('  ' + chalk.green('\u25CF') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.gray(modelCount + ' models'));
        console.log('     ' + chalk.gray(supported) + ' ' + more);
      } else if (res.status === 401) {
        console.log('  ' + chalk.red('\u2717') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.red('invalid API key'));
      } else if (res.status === 404) {
        console.log('  ' + chalk.green('\u25CF') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.gray('API key found (no model list endpoint)'));
      } else {
        console.log('  ' + chalk.yellow('\u26A0') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.gray('HTTP ' + res.status));
      }
    } catch (err) {
      console.log('  ' + chalk.yellow('\u26A0') + ' ' + chalk.white(p.name.padEnd(12)) + ': ' + chalk.gray(err.message));
    }
  }

  console.log(chalk.gray('\n  Set model: ') + chalk.cyan('natureco models set <model-id>\n'));
}

async function inferMedia() {
  const config = getConfig();

  console.log(chalk.cyan('\n  Inferring media capabilities...\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  const providerUrl = config.providerUrl || '';
  const apiKey = config.providerApiKey || '';

  let liveModels = [];
  if (apiKey && providerUrl) {
    try {
      const endpoint = providerUrl.replace(/\/v1\/.*$|\/$/, '') + '/v1/models';
      const res = await fetch(endpoint, {
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        liveModels = (data.data || data.models || []).map(m => ({ id: m.id || m }));
      }
    } catch {}
  }

  const mediaChecks = [
    { name: 'Image Generation', models: [], checkKey: ['openaiApiKey', 'falApiKey', 'togetherApiKey'] },
    { name: 'Video Generation', models: [], checkKey: ['runwayApiKey'] },
    { name: 'Music Generation', models: [], checkKey: ['sunoApiKey', 'udioApiKey', 'elevenlabsApiKey'] },
    { name: 'Speech-to-Text', models: [], checkKey: ['openaiApiKey'] },
    { name: 'Text-to-Speech', models: [], checkKey: ['elevenlabsApiKey', 'openaiApiKey'] },
    { name: 'Audio Understanding', models: [], checkKey: ['openaiApiKey'] },
    { name: 'Image Analysis (Vision)', models: [], checkKey: ['openaiApiKey', 'anthropicApiKey'] },
  ];

  if (liveModels.length > 0) {
    for (const check of mediaChecks) {
      if (check.name === 'Speech-to-Text') {
        check.models = liveModels.filter(m => m.id.toLowerCase().includes('whisper') || m.id.toLowerCase().includes('distil-whisper'));
      } else if (check.name === 'Text-to-Speech') {
        check.models = liveModels.filter(m => m.id.toLowerCase().includes('tts'));
      } else if (check.name === 'Image Analysis (Vision)') {
        check.models = liveModels.filter(m => m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('gpt-4o') || m.id.toLowerCase().includes('claude'));
      } else if (check.name === 'Audio Understanding') {
        check.models = liveModels.filter(m => m.id.toLowerCase().includes('whisper') || m.id.toLowerCase().includes('audio'));
      } else if (check.name === 'Image Generation') {
        check.models = liveModels.filter(m => m.id.toLowerCase().includes('dall-e') || m.id.toLowerCase().includes('stable-diffusion') || m.id.toLowerCase().includes('flux'));
      }
    }
  }

  for (const c of mediaChecks) {
    const hasKey = c.checkKey.some(k => config[k] || process.env[k.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()]);
    const hasModel = c.models.length > 0;
    const available = hasKey || hasModel;
    const icon = available ? chalk.green('\u25CF') : chalk.gray('\u25CB');
    const detail = hasModel
      ? chalk.gray('(' + c.models.slice(0, 2).map(m => m.id).join(', ') + ')')
      : hasKey ? chalk.gray('(API key found)') : '';
    console.log('  ' + icon + ' ' + chalk.white(c.name.padEnd(24)) + ' ' + detail);
  }
  console.log();
}

async function inferCapabilities() {
  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const apiKey = config.providerApiKey || '';

  console.log(chalk.cyan('\n  Inferring provider capabilities...\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  let liveModels = [];
  if (apiKey && providerUrl) {
    console.log('  ' + chalk.gray('Fetching models from provider...'));
    try {
      const endpoint = providerUrl.replace(/\/v1\/.*$|\/$/, '') + '/v1/models';
      const res = await fetch(endpoint, {
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        liveModels = (data.data || data.models || []).map(m => ({ id: m.id || m }));
        console.log('  ' + chalk.green('\u2713') + ' ' + liveModels.length + ' models fetched\n');
      } else if (res.status === 401) {
        console.log('  ' + chalk.red('\u2717') + ' Invalid API key\n');
      } else if (res.status === 404) {
        console.log('  ' + chalk.yellow('\u26A0') + ' Provider does not expose /v1/models\n');
      } else {
        console.log('  ' + chalk.yellow('\u26A0') + ' HTTP ' + res.status + '\n');
      }
    } catch (err) {
      console.log('  ' + chalk.yellow('\u26A0') + ' ' + err.message + '\n');
    }
  }

  if (liveModels.length === 0) {
    const knownModels = getKnownModels(providerUrl);
    if (knownModels.length > 0) {
      liveModels = knownModels.map(m => ({ id: m }));
    }
  }

  const caps = {};
  for (const [model] of Object.entries(liveModels)) {
    const m = model || liveModels[model];
    if (typeof m === 'string' || !m.id) {
      const id = typeof m === 'string' ? m : '';
      if (!id) continue;
      for (const entry of MODEL_FEATURE_MAP) {
        if (id.toLowerCase().includes(entry.pattern)) {
          for (const feature of entry.features) {
            caps[feature] = (caps[feature] || 0) + 1;
          }
        }
      }
      if (id.includes('llama') || id.includes('gpt') || id.includes('claude') || id.includes('mixtral') || id.includes('mistral') || id.includes('deepseek') || id.includes('grok')) {
        caps['chat'] = (caps['chat'] || 0) + 1;
      }
    } else {
      const id = m.id || '';
      for (const entry of MODEL_FEATURE_MAP) {
        if (id.toLowerCase().includes(entry.pattern)) {
          for (const feature of entry.features) {
            caps[feature] = (caps[feature] || 0) + 1;
          }
        }
      }
      if (id.includes('llama') || id.includes('gpt') || id.includes('claude') || id.includes('mixtral') || id.includes('mistral') || id.includes('deepseek') || id.includes('grok')) {
        caps['chat'] = (caps['chat'] || 0) + 1;
      }
    }
  }

  if (!caps['chat'] && (apiKey || config.providerModel)) {
    caps['chat'] = 1;
  }

  const capList = [
    { name: 'Chat', key: 'chat' },
    { name: 'Vision', key: 'vision' },
    { name: 'Code Generation', key: 'code' },
    { name: 'Reasoning', key: 'reasoning' },
    { name: 'Embeddings', key: 'embedding' },
    { name: 'TTS', key: 'tts' },
    { name: 'STT', key: 'stt' },
    { name: 'Image Gen', key: 'images' },
    { name: 'Search', key: 'search' },
    { name: 'Audio', key: 'audio' },
    { name: 'Music', key: 'music' },
  ];

  for (const c of capList) {
    const count = caps[c.key] || 0;
    const icon = count > 0 ? chalk.green('\u25CF (' + count + ')') : chalk.gray('\u25CB');
    console.log('  ' + icon + ' ' + chalk.white(c.name.padEnd(16)));
  }

  if (liveModels.length > 0) {
    console.log(chalk.gray('\n  Probe chat endpoint...'));
    try {
      const providerHost = providerUrl.replace('https://', '').split('/')[0] || '';
      const testUrl = providerUrl.includes('/v1/')
        ? providerUrl
        : providerUrl.replace(/\/$/, '') + '/v1/chat/completions';
      const testModel = caps['reasoning'] > 0
        ? liveModels.find(m => (m.id || '').includes('reasoner') || (m.id || '').includes('o1'))?.id || liveModels[0]?.id || config.providerModel || 'gpt-4o-mini'
        : config.providerModel || liveModels[0]?.id || 'gpt-4o-mini';

      const probeRes = await fetch(testUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'Respond with word: ok' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (probeRes.ok) {
        const provider = providerHost || config.provider || 'unknown';
        console.log('  ' + chalk.green('\u2713') + ' ' + chalk.white('Chat API') + ': ' + chalk.green('working'));
        if (caps['vision'] > 0) {
          console.log('  ' + chalk.green('\u25CF') + ' ' + chalk.white('Vision') + ': ' + chalk.gray('model supports vision'));
        }
      } else {
        console.log('  ' + chalk.yellow('\u26A0') + ' ' + chalk.white('Chat API') + ': ' + chalk.gray('HTTP ' + probeRes.status));
      }
    } catch (err) {
      console.log('  ' + chalk.yellow('\u26A0') + ' ' + chalk.white('Chat API') + ': ' + chalk.gray(err.message));
    }
  }

  console.log();
}

function getKnownModels(providerUrl) {
  return getProviderModels(providerUrl).map(model => model.id);
}

async function inferModelRun(prompt, modelOverride) {
  if (!prompt) {
    console.log(chalk.red('\n  \u274C Prompt gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer model run [<model>] <prompt>\n'));
    process.exit(1);
  }
  const config = getConfig();
  const providerUrl = config.providerUrl;
  const apiKey = config.providerApiKey || config.apiKey;
  const model = modelOverride || config.providerModel || 'gpt-4o-mini';
  if (!providerUrl || !apiKey) {
    console.log(chalk.red('\n  \u274C Provider not configured. Run setup first.\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Running inference...\n'));
  console.log(chalk.gray('  Model   : ') + chalk.white(model));
  console.log(chalk.gray('  Prompt  : ') + chalk.white(prompt.slice(0, 80) + (prompt.length > 80 ? '...' : '')));
  console.log('');
  const endpoint = providerUrl.includes('/v1/') ? providerUrl : providerUrl.replace(/\/$/, '') + '/v1/chat/completions';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 256 }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || data.response || '(no content)';
      console.log(chalk.green('  Response:\n'));
      console.log(chalk.white('  ' + reply.split('\n').join('\n  ')));
      console.log('');
    } else if (res.status === 401) {
      console.log(chalk.red('  \u274C Invalid API key\n'));
    } else {
      const text = await res.text().catch(() => '');
      console.log(chalk.yellow('  \u26A0 HTTP ' + res.status + ': ' + text.slice(0, 100) + '\n'));
    }
  } catch (err) {
    console.log(chalk.red('  \u274C ' + err.message + '\n'));
  }
}

async function inferAuth(provider) {
  const config = getConfig();
  const providers = [
    { name: 'openai', key: config.openaiApiKey || process.env.OPENAI_API_KEY, url: 'https://api.openai.com/v1/models' },
    { name: 'anthropic', key: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY, url: null },
    { name: 'groq', key: config.groqApiKey || process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/models' },
    { name: 'deepseek', key: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY, url: 'https://api.deepseek.com/v1/models' },
    { name: 'mistral', key: config.mistralApiKey || process.env.MISTRAL_API_KEY, url: 'https://api.mistral.ai/v1/models' },
    { name: 'perplexity', key: config.perplexityApiKey || process.env.PERPLEXITY_API_KEY, url: 'https://api.perplexity.ai/v1/models' },
    { name: 'together', key: config.togetherApiKey || process.env.TOGETHER_API_KEY, url: 'https://api.together.xyz/v1/models' },
    { name: 'xai', key: config.xaiApiKey || process.env.XAI_API_KEY, url: 'https://api.x.ai/v1/models' },
    { name: 'elevenlabs', key: config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY, url: null },
    { name: 'deepgram', key: config.deepgramApiKey || process.env.DEEPGRAM_API_KEY, url: null },
    { name: 'fal', key: config.falKey || process.env.FAL_KEY, url: null },
    { name: 'openrouter', key: config.openrouterApiKey || process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/models' },
  ];
  if (provider) {
    const p = providers.find(x => x.name === provider.toLowerCase());
    if (!p) {
      console.log(chalk.red('\n  \u274C Unknown provider: ' + provider + '\n'));
      console.log(chalk.gray('  Available: ' + providers.map(x => x.name).join(', ') + '\n'));
      process.exit(1);
    }
    console.log(chalk.cyan('\n  Testing ' + p.name + ' authentication...\n'));
    if (!p.key) {
      console.log(chalk.yellow('  \u26A0 No API key found\n'));
      console.log(chalk.gray('  Set it: natureco secrets set ' + p.name + 'ApiKey <key>\n'));
      return;
    }
    if (!p.url) {
      console.log(chalk.green('  \u2713 API key found (no test endpoint available)\n'));
      return;
    }
    try {
      const res = await fetch(p.url, {
        headers: { Authorization: 'Bearer ' + p.key },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        console.log(chalk.green('  \u2713 Authentication successful\n'));
      } else if (res.status === 401) {
        console.log(chalk.red('  \u2717 Invalid API key\n'));
      } else {
        console.log(chalk.yellow('  \u26A0 HTTP ' + res.status + '\n'));
      }
    } catch (err) {
      console.log(chalk.yellow('  \u26A0 ' + err.message + '\n'));
    }
    return;
  }
  console.log(chalk.cyan('\n  Testing all providers...\n'));
  for (const p of providers) {
    if (!p.key) {
      console.log(chalk.gray('  \u25CB ' + p.name + ': not configured'));
      continue;
    }
    if (!p.url) {
      console.log(chalk.green('  \u2713 ' + p.name + ': API key found'));
      continue;
    }
    try {
      const res = await fetch(p.url, {
        headers: { Authorization: 'Bearer ' + p.key },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        console.log(chalk.green('  \u2713 ' + p.name + ': authenticated'));
      } else if (res.status === 401) {
        console.log(chalk.red('  \u2717 ' + p.name + ': invalid key'));
      } else {
        console.log(chalk.yellow('  \u26A0 ' + p.name + ': HTTP ' + res.status));
      }
    } catch (err) {
      console.log(chalk.yellow('  \u26A0 ' + p.name + ': ' + err.message));
    }
  }
  console.log('');
}

async function inferImage(prompt) {
  if (!prompt) {
    console.log(chalk.red('\n  \u274C Prompt gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer image <prompt>\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Image Generation\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Prompt: ') + chalk.white(prompt));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 image generation not available'));
  console.log(chalk.gray('  To enable: configure a provider with image generation support'));
  console.log(chalk.gray('  (e.g., OpenAI DALL-E, Together AI, or Fal.ai)\n'));
}

async function inferAudio(prompt) {
  if (!prompt) {
    console.log(chalk.red('\n  \u274C Prompt gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer audio <prompt>\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Audio Generation\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Prompt: ') + chalk.white(prompt));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 audio generation not available'));
  console.log(chalk.gray('  Providers: Suno, Udio, ElevenLabs\n'));
}

async function inferTts(text) {
  if (!text) {
    console.log(chalk.red('\n  \u274C Text gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer tts <text>\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Text-to-Speech\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Text : ') + chalk.white(text.slice(0, 80)));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 TTS not available'));
  console.log(chalk.gray('  Providers: ElevenLabs, OpenAI TTS\n'));
}

async function inferVideo(prompt) {
  if (!prompt) {
    console.log(chalk.red('\n  \u274C Prompt gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer video <prompt>\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Video Generation\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Prompt: ') + chalk.white(prompt));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 video generation not available'));
  console.log(chalk.gray('  Providers: Runway, Pika, Synthesia\n'));
}

async function inferWeb(query) {
  if (!query) {
    console.log(chalk.red('\n  \u274C Query gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer web <query>\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Web Search via AI\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Query: ') + chalk.white(query));
  const config = getConfig();
  const apiKey = config.tavilyApiKey || process.env.TAVILY_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        console.log(chalk.green('\n  Results (' + results.length + '):\n'));
        for (const r of results.slice(0, 5)) {
          console.log(chalk.cyan('  ' + (r.title || 'Untitled')));
          console.log(chalk.gray('    ' + (r.url || '')));
          console.log(chalk.white('    ' + (r.content || '').slice(0, 120)));
          console.log('');
        }
        return;
      } else {
        console.log(chalk.yellow('  Search API error: HTTP ' + res.status + '\n'));
      }
    } catch (err) {
      console.log(chalk.yellow('  Search error: ' + err.message + '\n'));
    }
  } else {
    console.log(chalk.gray('\n  No search API key configured (Tavily).'));
    console.log(chalk.gray('  Set: natureco secrets set tavilyApiKey <key>\n'));
  }
}

async function inferEmbedding(text) {
  if (!text) {
    console.log(chalk.red('\n  \u274C Text gerekli\n'));
    console.log(chalk.gray('  Kullan\u0131m: natureco infer embedding <text>\n'));
    process.exit(1);
  }
  const config = getConfig();
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  console.log(chalk.cyan('\n  Generate Embedding\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Text : ') + chalk.white(text.slice(0, 80)));
  if (apiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        const embedding = data.data?.[0]?.embedding || [];
        console.log(chalk.green('\n  \u2713 Embedding generated\n'));
        console.log(chalk.gray('  Dimensions: ') + chalk.white(embedding.length));
        console.log(chalk.gray('  Vector    : ') + chalk.gray('[' + embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ') + ', ...]'));
        console.log('');
        return;
      } else {
        console.log(chalk.yellow('  Embedding API error: HTTP ' + res.status + '\n'));
      }
    } catch (err) {
      console.log(chalk.yellow('  Embedding error: ' + err.message + '\n'));
    }
  } else {
    console.log(chalk.gray('\n  No OpenAI API key configured.'));
    console.log(chalk.gray('  Set: natureco secrets set openaiApiKey <key>\n'));
  }
}

// ---------------------------------------------------------------------------
// New functions
// ---------------------------------------------------------------------------

async function inferList() {
  console.log(chalk.cyan('\n  Available Model Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  const knownProviders = [
    { name: 'openai', description: 'GPT-4, GPT-4o, DALL-E, Whisper, TTS, Embeddings' },
    { name: 'anthropic', description: 'Claude Opus, Sonnet, Haiku' },
    { name: 'groq', description: 'Llama, Mixtral, Gemma (fast inference)' },
    { name: 'deepseek', description: 'DeepSeek Chat, Coder, Reasoner' },
    { name: 'mistral', description: 'Mistral Large, Medium, Small, Codestral' },
    { name: 'xai', description: 'Grok Beta, Grok Vision' },
    { name: 'perplexity', description: 'Sonar Pro, Sonar, Sonar Reasoning' },
    { name: 'together', description: 'Llama, Mixtral, DeepSeek, Qwen' },
    { name: 'openrouter', description: 'Unified API for many providers' },
    { name: 'elevenlabs', description: 'Text-to-Speech, Voice Cloning' },
    { name: 'deepgram', description: 'Speech-to-Text, Audio Intelligence' },
    { name: 'fal', description: 'Image/Video generation models' },
  ];

  const config = getConfig();
  for (const p of knownProviders) {
    const keyName = p.name + 'ApiKey';
    const keyNameAlt = p.name === 'fal' ? 'falKey' : null;
    const hasKey = config[keyName] || config[keyNameAlt] || process.env[keyName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()];
    const icon = hasKey ? chalk.green('\u25CF') : chalk.gray('\u25CB');
    console.log('  ' + icon + ' ' + chalk.white(p.name.padEnd(14)) + chalk.gray(p.description));
  }

  console.log(chalk.gray('\n  Inspect: ') + chalk.cyan('natureco infer inspect <provider>'));
  console.log();
}

async function inferInspect(provider) {
  const config = getConfig();
  const providerMap = {
    openai: { name: 'OpenAI', url: 'https://api.openai.com/v1/models', key: config.openaiApiKey, docs: 'https://platform.openai.com/docs' },
    anthropic: { name: 'Anthropic', url: null, key: config.anthropicApiKey, docs: 'https://docs.anthropic.com' },
    groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1/models', key: config.groqApiKey, docs: 'https://console.groq.com/docs' },
    deepseek: { name: 'DeepSeek', url: 'https://api.deepseek.com/v1/models', key: config.deepseekApiKey, docs: 'https://platform.deepseek.com' },
    mistral: { name: 'Mistral', url: 'https://api.mistral.ai/v1/models', key: config.mistralApiKey, docs: 'https://docs.mistral.ai' },
    xai: { name: 'xAI', url: 'https://api.x.ai/v1/models', key: config.xaiApiKey, docs: 'https://docs.x.ai' },
    perplexity: { name: 'Perplexity', url: 'https://api.perplexity.ai/v1/models', key: config.perplexityApiKey, docs: 'https://docs.perplexity.ai' },
    together: { name: 'Together', url: 'https://api.together.xyz/v1/models', key: config.togetherApiKey, docs: 'https://docs.together.ai' },
    openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/models', key: config.openrouterApiKey, docs: 'https://openrouter.ai/docs' },
    elevenlabs: { name: 'ElevenLabs', url: null, key: config.elevenlabsApiKey, docs: 'https://elevenlabs.io/docs' },
    deepgram: { name: 'Deepgram', url: null, key: config.deepgramApiKey, docs: 'https://developers.deepgram.com' },
    fal: { name: 'Fal.ai', url: null, key: config.falKey, docs: 'https://fal.ai/docs' },
  };

  const p = providerMap[provider.toLowerCase()];
  if (!p) {
    console.log(chalk.red('\n  \u274C Unknown provider: ' + provider + '\n'));
    console.log(chalk.gray('  Known providers: ' + Object.keys(providerMap).join(', ') + '\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n  Provider: ' + p.name + '\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Name        : ') + chalk.white(p.name));
  console.log(chalk.gray('  API Key     : ') + (p.key ? chalk.green('\u2713 configured') : chalk.gray('not set')));
  console.log(chalk.gray('  API URL     : ') + chalk.white(p.url || '(no model list endpoint)'));
  console.log(chalk.gray('  Docs        : ') + chalk.cyan(p.docs));
  console.log();

  if (p.url && p.key) {
    console.log(chalk.gray('  Fetching models...'));
    try {
      const res = await fetch(p.url, {
        headers: { Authorization: 'Bearer ' + p.key },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || data.models || []).map(m => m.id || m);
        console.log(chalk.green('  \u2713 ' + models.length + ' models available\n'));
        for (const m of models.slice(0, 10)) {
          console.log(chalk.white('    - ' + m));
        }
        if (models.length > 10) {
          console.log(chalk.gray('    ... and ' + (models.length - 10) + ' more'));
        }
      } else if (res.status === 401) {
        console.log(chalk.red('  \u2717 Invalid API key\n'));
      } else {
        console.log(chalk.yellow('  \u26A0 HTTP ' + res.status + '\n'));
      }
    } catch (err) {
      console.log(chalk.yellow('  \u26A0 ' + err.message + '\n'));
    }
  } else if (!p.key) {
    console.log(chalk.gray('  Set API key via: natureco secrets set ' + provider + 'ApiKey <key>\n'));
  }
}

async function inferModelList() {
  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const apiKey = config.providerApiKey || '';

  console.log(chalk.cyan('\n  Available Models\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  if (apiKey && providerUrl) {
    try {
      const endpoint = providerUrl.includes('/v1/') ? providerUrl : providerUrl.replace(/\/$/, '') + '/v1/models';
      const res = await fetch(endpoint, {
        headers: { Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || data.models || []).map(m => m.id || m);
        if (models.length === 0) {
          console.log(chalk.gray('  No models returned by provider\n'));
        } else {
          for (const m of models) {
            const features = [];
            for (const entry of MODEL_FEATURE_MAP) {
              if (m.toLowerCase().includes(entry.pattern)) {
                features.push(entry.features.join(', '));
              }
            }
            const tag = features.length > 0 ? chalk.gray('  [' + features[0] + ']') : '';
            console.log(chalk.white('  - ' + m) + ' ' + tag);
          }
        }
        console.log();
        return;
      } else if (res.status === 401) {
        console.log(chalk.red('  \u2717 Invalid API key\n'));
        return;
      }
    } catch (err) {
      console.log(chalk.yellow('  \u26A0 ' + err.message + '\n'));
      return;
    }
  }

  const known = getKnownModels(providerUrl);
  if (known.length > 0) {
    console.log(chalk.gray('  Known models for current provider:\n'));
    for (const m of known) {
      console.log(chalk.white('  - ' + m));
    }
    console.log();
  } else {
    console.log(chalk.gray('  No models found. Configure a provider with:\n'));
    console.log(chalk.cyan('    natureco setup\n'));
  }
}

async function inferModelInspect(model) {
  console.log(chalk.cyan('\n  Model: ' + model + '\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  const id = model.toLowerCase();
  const matchedFeatures = [];
  for (const entry of MODEL_FEATURE_MAP) {
    if (id.includes(entry.pattern)) {
      matchedFeatures.push(entry.features);
    }
  }
  const allFeatures = [...new Set(matchedFeatures.flat())];

  console.log(chalk.gray('  Name       : ') + chalk.white(model));
  console.log(chalk.gray('  Capabilities: ') + (allFeatures.length > 0 ? chalk.green(allFeatures.join(', ')) : chalk.gray('generic model')));
  console.log();

  const config = getConfig();
  const providerUrl = config.providerUrl || '';
  const apiKey = config.providerApiKey || '';
  if (apiKey && providerUrl) {
    console.log(chalk.gray('  Testing chat endpoint...'));
    try {
      const testUrl = providerUrl.includes('/v1/') ? providerUrl : providerUrl.replace(/\/$/, '') + '/v1/chat/completions';
      const res = await fetch(testUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Respond with word: ok' }], max_tokens: 5 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        console.log(chalk.green('  \u2713 Model responds\n'));
      } else if (res.status === 404) {
        console.log(chalk.yellow('  \u26A0 Model not found or not accessible\n'));
      } else {
        console.log(chalk.yellow('  \u26A0 HTTP ' + res.status + '\n'));
      }
    } catch (err) {
      console.log(chalk.yellow('  \u26A0 ' + err.message + '\n'));
    }
  }
}

async function inferModelProviders() {
  return inferList();
}

async function inferModelAuthLogin(provider) {
  const config = getConfig();
  const key = config[provider + 'ApiKey'] || process.env[provider.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase() + '_API_KEY'];
  if (key) {
    console.log(chalk.green('\n  \u2713 Already authenticated with ' + provider + '\n'));
    return;
  }
  console.log(chalk.cyan('\n  Authenticating with ' + provider + '...\n'));
  console.log(chalk.gray('  Use: ') + chalk.white('natureco secrets set ' + provider + 'ApiKey <key>'));
  console.log(chalk.gray('  Or:  ') + chalk.white('natureco infer auth add ' + provider + ' <key>'));
  console.log();
}

async function inferModelAuthLogout(provider) {
  console.log(chalk.yellow('\n  \u26A0 Logout from ' + provider + '...\n'));
  console.log(chalk.gray('  Remove API key from secrets:'));
  console.log(chalk.white('    natureco secrets delete ' + provider + 'ApiKey'));
  console.log();
}

async function inferModelAuthStatus() {
  const config = getConfig();
  console.log(chalk.cyan('\n  Model Auth Status\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));

  const providers = [
    { name: 'openai', key: config.openaiApiKey || process.env.OPENAI_API_KEY },
    { name: 'anthropic', key: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY },
    { name: 'groq', key: config.groqApiKey || process.env.GROQ_API_KEY },
    { name: 'deepseek', key: config.deepseekApiKey || process.env.DEEPSEEK_API_KEY },
    { name: 'mistral', key: config.mistralApiKey || process.env.MISTRAL_API_KEY },
    { name: 'xai', key: config.xaiApiKey || process.env.XAI_API_KEY },
    { name: 'perplexity', key: config.perplexityApiKey || process.env.PERPLEXITY_API_KEY },
    { name: 'together', key: config.togetherApiKey || process.env.TOGETHER_API_KEY },
  ];

  for (const p of providers) {
    const icon = p.key ? chalk.green('\u25CF') : chalk.gray('\u25CB');
    const status = p.key ? chalk.green('authenticated') : chalk.gray('not configured');
    console.log('  ' + icon + ' ' + chalk.white(p.name.padEnd(14)) + status);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Image subcommands
// ---------------------------------------------------------------------------

async function inferImageGenerate(prompt) {
  console.log(chalk.cyan('\n  Image Generation\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Prompt: ') + chalk.white(prompt));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 image generation not available'));
  console.log(chalk.gray('  To generate images, configure DALL-E, Stable Diffusion, or Fal.ai\n'));
}

async function inferImageEdit(path, prompt) {
  console.log(chalk.cyan('\n  Image Edit\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Image : ') + chalk.white(path));
  console.log(chalk.gray('  Edit  : ') + chalk.white(prompt));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 image editing not available'));
  console.log();
}

async function inferImageDescribe(imagePath) {
  console.log(chalk.cyan('\n  Image Description\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Path  : ') + chalk.white(imagePath));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 image description not available'));
  console.log(chalk.gray('  Requires a vision-capable model (GPT-4o, Claude, Llama-3.2)\n'));
}

async function inferImageDescribeMany(dir) {
  console.log(chalk.cyan('\n  Describe Images in Directory\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Dir   : ') + chalk.white(dir));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 batch description not available'));
  console.log();
}

async function inferImageProviders() {
  console.log(chalk.cyan('\n  Image Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  const providers = [
    { name: 'OpenAI DALL-E', models: 'dall-e-3, dall-e-2' },
    { name: 'Stable Diffusion', models: 'SDXL, SD3, Flux' },
    { name: 'Fal.ai', models: 'Flux, Stable Diffusion, Pika' },
    { name: 'Together AI', models: 'Stable Diffusion, Flux' },
  ];
  for (const p of providers) {
    console.log(chalk.white('  \u25CF ' + p.name.padEnd(22)) + chalk.gray(p.models));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Audio subcommands
// ---------------------------------------------------------------------------

async function inferAudioTranscribe(audioPath) {
  const config = getConfig();
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
  console.log(chalk.cyan('\n  Audio Transcription\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  File  : ') + chalk.white(audioPath));
  if (apiKey) {
    console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 transcription via Whisper not available in CLI'));
    console.log(chalk.gray('  Use: ') + chalk.white('curl https://api.openai.com/v1/audio/transcriptions ...'));
    console.log();
  } else {
    console.log(chalk.gray('  Status: ') + chalk.yellow('not configured'));
    console.log(chalk.gray('  Set: natureco secrets set openaiApiKey <key>\n'));
  }
}

async function inferAudioProviders() {
  console.log(chalk.cyan('\n  Audio Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  const providers = [
    { name: 'OpenAI Whisper', feature: 'Speech-to-Text' },
    { name: 'Deepgram', feature: 'Speech-to-Text, Audio Intelligence' },
    { name: 'ElevenLabs', feature: 'Speech-to-Text, Voice Design' },
  ];
  for (const p of providers) {
    console.log(chalk.white('  \u25CF ' + p.name.padEnd(22)) + chalk.gray(p.feature));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// TTS subcommands
// ---------------------------------------------------------------------------

async function inferTtsConvert(text) {
  const config = getConfig();
  const state = readState();
  const ttsProvider = state.ttsProvider || 'elevenlabs';
  console.log(chalk.cyan('\n  Text-to-Speech Conversion\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Text    : ') + chalk.white(text.slice(0, 80)));
  console.log(chalk.gray('  Provider: ') + chalk.white(ttsProvider));
  console.log(chalk.gray('  Status  : ') + chalk.yellow('MOCK \u2014 TTS conversion not available'));
  console.log(chalk.gray('  Providers: ElevenLabs, OpenAI TTS\n'));
}

async function inferTtsVoices() {
  console.log(chalk.cyan('\n  Available TTS Voices\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  ElevenLabs: Rachel, Adam, Bella, Joshua, etc.'));
  console.log(chalk.gray('  OpenAI    : alloy, echo, fable, nova, shimmer'));
  console.log();
}

async function inferTtsProviders() {
  console.log(chalk.cyan('\n  TTS Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.white('  \u25CF ElevenLabs  ') + chalk.gray('High-quality voice synthesis'));
  console.log(chalk.white('  \u25CF OpenAI TTS  ') + chalk.gray('GPT-4o integrated TTS'));
  console.log();
}

async function inferTtsStatus() {
  const state = readState();
  const enabled = state.ttsEnabled !== false;
  const provider = state.ttsProvider || 'elevenlabs';
  console.log(chalk.cyan('\n  TTS Status\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Enabled : ') + (enabled ? chalk.green('yes') : chalk.red('no')));
  console.log(chalk.gray('  Provider: ') + chalk.white(provider));
  console.log();
}

async function inferTtsEnable() {
  const state = readState();
  state.ttsEnabled = true;
  writeState(state);
  console.log(chalk.green('\n  \u2713 TTS enabled\n'));
}

async function inferTtsDisable() {
  const state = readState();
  state.ttsEnabled = false;
  writeState(state);
  console.log(chalk.yellow('\n  \u26A0 TTS disabled\n'));
}

async function inferTtsSetProvider(name) {
  const valid = ['elevenlabs', 'openai'];
  if (!valid.includes(name.toLowerCase())) {
    console.log(chalk.red('\n  \u274C Invalid TTS provider. Valid: ' + valid.join(', ') + '\n'));
    process.exit(1);
  }
  const state = readState();
  state.ttsProvider = name.toLowerCase();
  writeState(state);
  console.log(chalk.green('\n  \u2713 TTS provider set to ' + name.toLowerCase() + '\n'));
}

// ---------------------------------------------------------------------------
// Video subcommands
// ---------------------------------------------------------------------------

async function inferVideoGenerate(prompt) {
  console.log(chalk.cyan('\n  Video Generation\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Prompt: ') + chalk.white(prompt));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 video generation not available'));
  console.log(chalk.gray('  Providers: Runway, Pika, Synthesia\n'));
}

async function inferVideoDescribe(videoPath) {
  console.log(chalk.cyan('\n  Video Description\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  Path  : ') + chalk.white(videoPath));
  console.log(chalk.gray('  Status: ') + chalk.yellow('MOCK \u2014 video description not available'));
  console.log();
}

async function inferVideoProviders() {
  console.log(chalk.cyan('\n  Video Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  const providers = [
    { name: 'Runway', feature: 'Gen-2, Gen-3 Alpha' },
    { name: 'Pika', feature: 'Pika 2.0' },
    { name: 'Synthesia', feature: 'AI Avatars' },
  ];
  for (const p of providers) {
    console.log(chalk.white('  \u25CF ' + p.name.padEnd(14)) + chalk.gray(p.feature));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Web subcommands
// ---------------------------------------------------------------------------

async function inferWebSearch(query) {
  return inferWeb(query);
}

async function inferWebFetch(url) {
  console.log(chalk.cyan('\n  Web Fetch\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  console.log(chalk.gray('  URL: ') + chalk.white(url));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const text = await res.text();
      const preview = text.replace(/<[^>]+>/g, '').trim().slice(0, 500);
      console.log(chalk.green('\n  \u2713 Fetched ' + (text.length + ' bytes')));
      console.log(chalk.gray('\n  Preview:\n'));
      console.log(chalk.white('  ' + preview));
      console.log();
    } else {
      console.log(chalk.yellow('  \u26A0 HTTP ' + res.status + '\n'));
    }
  } catch (err) {
    console.log(chalk.yellow('  \u26A0 ' + err.message + '\n'));
  }
}

async function inferWebProviders() {
  console.log(chalk.cyan('\n  Web Search Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  const providers = [
    { name: 'Tavily', feature: 'AI-native search API' },
    { name: 'Perplexity', feature: 'Sonar search models' },
    { name: 'Exa', feature: 'Neural search for AI' },
  ];
  for (const p of providers) {
    console.log(chalk.white('  \u25CF ' + p.name.padEnd(14)) + chalk.gray(p.feature));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Embedding subcommands
// ---------------------------------------------------------------------------

async function inferEmbeddingCreate(text) {
  return inferEmbedding(text);
}

async function inferEmbeddingProviders() {
  console.log(chalk.cyan('\n  Embedding Providers\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  const providers = [
    { name: 'OpenAI', models: 'text-embedding-3-large, text-embedding-3-small' },
    { name: 'Mistral', models: 'mistral-embed' },
    { name: 'Together', models: 'BAAI/bge-*' },
  ];
  for (const p of providers) {
    console.log(chalk.white('  \u25CF ' + p.name.padEnd(14)) + chalk.gray(p.models));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Auth subcommands
// ---------------------------------------------------------------------------

async function inferAuthAdd(provider, key) {
  console.log(chalk.cyan('\n  Adding auth for ' + provider + '...\n'));
  console.log(chalk.gray('  To persist, use:'));
  console.log(chalk.white('    natureco secrets set ' + provider + 'ApiKey ' + key.slice(0, 8) + '...'));
  console.log(chalk.gray('\n  Or set environment variable:'));
  console.log(chalk.white('    set ' + provider.toUpperCase() + '_API_KEY=' + key.slice(0, 8) + '...'));
  console.log();
}

async function inferAuthLogin(provider) {
  console.log(chalk.cyan('\n  OAuth Login: ' + provider + '\n'));
  console.log(chalk.gray('  Opening browser for OAuth flow...'));
  console.log(chalk.yellow('  \u26A0 OAuth not yet supported in CLI'));
  console.log(chalk.gray('  Use: natureco secrets set ' + provider + 'ApiKey <key>\n'));
}

async function inferAuthLoginGithubCopilot() {
  console.log(chalk.cyan('\n  GitHub Copilot Auth\n'));
  console.log(chalk.gray('  To authenticate with GitHub Copilot:'));
  console.log(chalk.white('    1. Visit https://github.com/settings/tokens'));
  console.log(chalk.white('    2. Generate a token with copilot scope'));
  console.log(chalk.white('    3. Run: natureco infer auth paste-token'));
  console.log();
}

async function inferAuthSetupToken() {
  console.log(chalk.cyan('\n  Token Authentication Setup\n'));
  console.log(chalk.gray('  To set up token-based auth:'));
  console.log(chalk.white('    natureco infer auth add <provider> <token>'));
  console.log(chalk.gray('  Or paste an existing token:'));
  console.log(chalk.white('    natureco infer auth paste-token'));
  console.log();
}

async function inferAuthPasteToken() {
  console.log(chalk.cyan('\n  Paste Auth Token\n'));
  console.log(chalk.gray('  Paste your token below:'));
  console.log(chalk.yellow('  \u26A0 Interactive input not yet supported'));
  console.log(chalk.gray('  Use: natureco infer auth add <provider> <token>\n'));
}

async function inferAuthOrderGet() {
  const state = readState();
  const order = state.authOrder || ['openai', 'anthropic', 'groq', 'deepseek', 'mistral', 'xai', 'perplexity', 'together'];
  console.log(chalk.cyan('\n  Auth Provider Order\n'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(48)));
  order.forEach((p, i) => {
    console.log('  ' + chalk.white((i + 1) + '.') + ' ' + chalk.cyan(p));
  });
  console.log(chalk.gray('\n  Set: ') + chalk.white('natureco infer auth order set <providers...>'));
  console.log();
}

async function inferAuthOrderSet(providers) {
  const state = readState();
  state.authOrder = providers;
  writeState(state);
  console.log(chalk.green('\n  \u2713 Auth order set\n'));
  providers.forEach((p, i) => {
    console.log('  ' + chalk.white((i + 1) + '.') + ' ' + chalk.cyan(p));
  });
  console.log();
}

async function inferAuthOrderClear() {
  const state = readState();
  delete state.authOrder;
  writeState(state);
  console.log(chalk.green('\n  \u2713 Auth order reset to default\n'));
}

module.exports = infer;
