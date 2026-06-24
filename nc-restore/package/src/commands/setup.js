const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const inquirer = require('../utils/inquirer-wrapper');
const brand = require('../utils/branding');
const { COLORS, FULL_LOGO } = brand;

const BASE_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

const DIRS = ['sources', 'concepts', 'cache', 'skills', 'memory', 'sessions', 'backups'];

const PROVIDER_PRESETS = {
  groq:     { url: 'https://api.groq.com/openai/v1',                 model: 'llama-3.3-70b-versatile' },
  openai:   { url: 'https://api.openai.com/v1',                      model: 'gpt-4o' },
  anthropic:{ url: 'https://api.anthropic.com',                      model: 'claude-sonnet-4-6' },
  deepseek: { url: 'https://api.deepseek.com/v1',                    model: 'deepseek-chat' },
  ollama:   { url: 'http://localhost:11434/v1',                      model: 'llama3.3' },
  // MiniMax — özel endpoint gerekiyor (/v1/text/chatcompletion_v2)
  // OpenAI uyumlu DEĞİL — llm_task ve api.js bunu tespit edip yönlendiriyor
  minimax:  { url: 'https://api.minimax.io',                         model: 'MiniMax-M2.5' },
  // OpenRouter — 100+ model, tek key ile hepsine erişim
  openrouter: { url: 'https://openrouter.ai/api/v1',                 model: 'meta-llama/llama-3.3-70b-instruct:free' },
  // Together AI
  together: { url: 'https://api.together.xyz/v1',                    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
};

function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveConfig(data) {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function setup(params) {
  try {
    const [action] = params || [];

    if (!action || action === 'wizard') return await cmdWizard();
    if (action === 'status') return cmdStatus();
    if (action === 'config') return cmdConfig();
    if (action === 'workspace') return cmdWorkspace();
    if (action === 'dirs') return cmdDirs();

    console.log(chalk.yellow('\n  Usage:'));
    console.log(chalk.gray('    natureco setup               Interactive setup wizard'));
    console.log(chalk.gray('    natureco setup config         Create default config'));
    console.log(chalk.gray('    natureco setup workspace      Create workspace directories'));
    console.log(chalk.gray('    natureco setup dirs           Create data directories'));
    console.log(chalk.gray('    natureco setup status         Show setup status\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Setup error: ${err.message}\n`));
  }
}

async function cmdWizard() {
  console.clear();
  // Tam NatureCo logosu — brand kimliği
  for (const line of FULL_LOGO) console.log(COLORS.primary(line));
  console.log('');
  console.log(COLORS.secondary.bold('  ⚡ Setup Wizard — 60 saniyede hazır'));
  console.log(COLORS.muted('  Provider seç, API key gir, hemen başla.\n'));

  // Ensure directories
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  for (const dir of DIRS) {
    const p = path.join(BASE_DIR, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  const cfg = getConfig();

  // v5.6.2: Step 1 - Provider + Model wizard
  console.log(chalk.white('  Step 1: Provider & Model'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));

  const providerKeys = Object.keys(PROVIDER_PRESETS);

  // 1a) Provider secimi
  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: '  AI Provider:',
    choices: [
      ...providerKeys.map(k => ({
        name: `${PROVIDER_PRESETS[k].name} - ${PROVIDER_PRESETS[k].models[PROVIDER_PRESETS[k].default].label}`,
        value: k,
      })),
    ],
    pageSize: 12,
  }]);

  const preset = PROVIDER_PRESETS[provider];

  // 1b) Model tier secimi
  let providerUrl = preset.url;
  let providerModel = preset.models[preset.default].id;

  if (provider === 'custom') {
    providerUrl = await rlQuestion(`  Provider URL (${cfg.providerUrl || 'https://api.openai.com/v1'}): `) || cfg.providerUrl || 'https://api.openai.com/v1';
    providerModel = await rlQuestion(`  Model (${cfg.providerModel || 'gpt-4o'}): `) || cfg.providerModel || 'gpt-4o';
  } else {
    // Tier secimi wizard
    const tierChoices = [
      {
        name: `\u{1F7E2} GUCLU   - ${preset.models.powerful.label} | ${preset.models.powerful.desc} | ${preset.models.powerful.cost}`,
        value: 'powerful',
        short: preset.models.powerful.label,
      },
      {
        name: `\u{1F7E1} ORTA   - ${preset.models.balanced.label} | ${preset.models.balanced.desc} | ${preset.models.balanced.cost}`,
        value: 'balanced',
        short: preset.models.balanced.label,
      },
      {
        name: `\u{1F535} HIZLI  - ${preset.models.fast.label} | ${preset.models.fast.desc} | ${preset.models.fast.cost}`,
        value: 'fast',
        short: preset.models.fast.label,
      },
      { name: '✏️  Custom model adı (ileri düzey)', value: 'custom' },
    ];

    const { tier } = await inquirer.prompt([{
      type: 'list',
      name: 'tier',
      message: '  Model tier:',
      choices: tierChoices,
      pageSize: 5,
    }]);

    if (tier === 'custom') {
      providerModel = await rlQuestion(`  Model adı (${cfg.providerModel || preset.models.balanced.id}): `) || cfg.providerModel || preset.models.balanced.id;
    } else {
      providerModel = preset.models[tier].id;
      console.log(chalk.gray(`  \u2713 Secildi: ${preset.models[tier].label} (${tier})`));
    }
  }

  console.log(chalk.gray(`  URL:   ${providerUrl}`));
  console.log(chalk.gray(`  Model: ${providerModel}`));
  }

  // Step 2: API Key
  console.log('');
  console.log(chalk.white('  Step 2: API Key'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  console.log(chalk.gray('  Get a key from: ') + chalk.cyan('developers.natureco.me'));
  console.log(chalk.gray('  Or use your own provider API key.\n'));

  const currentKey = cfg.providerApiKey || '';
  if (currentKey) {
    console.log('');
    console.log(chalk.yellow('  ⚠️  Mevcut API key tespit edildi (son 4 karakter: ' + currentKey.slice(-4) + ')'));
    const reset = await inquirer.prompt([{
      type: 'confirm',
      name: 'fresh',
      message: 'Sıfırdan yeni kurulum mu yapacaksın? (N = mevcut korunur)',
      default: false,
    }]);
    if (reset.fresh) {
      // Sifirla - tum eski kanallari temizle
      delete cfg.telegramToken;
      delete cfg.whatsappPhone;
      delete cfg.discordToken;
      delete cfg.slackToken;
      delete cfg.signalBot;
      delete cfg.mattermostBot;
      delete cfg.smsTwilioSid;
      delete cfg.webhooks;
      console.log(chalk.green('  ✓ Eski ayarlar temizlendi'));
    }
  }
  const apiKey = await rlQuestion(`  API Key ${currentKey ? '(leave blank to keep current)' : ''}: `);
  if (apiKey) {
    cfg.providerApiKey = apiKey;
    // v5.6.0: API key dogrula
    console.log('\n  Doğrulanıyor...');
    const isValid = await validateApiKey(cfg.providerUrl, apiKey);
    if (!isValid) {
      console.log('  ❌ API key gecersiz! Lutfen kontrol edin.');
      const retry = await inquirer.prompt([{
        type: 'confirm',
        name: 'continue',
        message: 'Yine de devam etmek istiyor musunuz? (key sonra duzeltilebilir)',
        default: false,
      }]);
      if (!retry.continue) {
        console.log('  Setup iptal edildi. Tekrar deneyin: natureco setup');
        process.exit(1);
      }
    } else {
      console.log('  ✓ API key gecerli!');
    }
  }

  // Step 3: Bot & User identity
  console.log('');
  console.log(chalk.white('  Step 3: Bot & Kullanıcı'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  const userName = await rlQuestion(`  Sizin adınız: `);
  if (userName) cfg.userName = userName;
  const botName = await rlQuestion(`  Bot adı: `);
  if (botName) cfg.botName = botName;

  // Step 4: Kanal Entegrasyonları (isteğe bağlı, isteyen atlayabilir)
  console.log('');
  console.log(chalk.white('  Step 4: Kanal Entegrasyonları (opsiyonel)'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  console.log(chalk.gray('  Telegram, WhatsApp, Discord, Slack bağlamak ister misiniz?'));
  console.log(chalk.gray('  Atlamak için hepsini boş bırakın, sonra: natureco <kanal> connect\n'));

  const integrations = [
    { key: 'telegramToken',   name: 'Telegram',   hint: 'BotFather\'dan al (@BotFather → /newbot → token)' },
    { key: 'whatsappPhone',   name: 'WhatsApp',   hint: 'Telefon numaranızı girin (örn: +905422842631)' },
    { key: 'discordToken',    name: 'Discord',    hint: 'Discord bot token (Discord Developer Portal)' },
    { key: 'slackToken',      name: 'Slack',      hint: 'Slack bot token (api.slack.com/apps)' },
    { key: 'signalBotId',     name: 'Signal',     hint: 'Signal bot numarası veya ID' },
    { key: 'ircBotId',        name: 'IRC',        hint: 'IRC bot kullanıcı adı (örn: NatureCoBot)' },
    { key: 'mattermostBotId', name: 'Mattermost', hint: 'Mattermost bot kullanıcı adı' },
    { key: 'imessageBotId',   name: 'iMessage',   hint: 'iMessage bridge endpoint veya ad' },
    { key: 'smsBotId',        name: 'SMS (Twilio)', hint: 'Twilio hesap SID veya bot ID' },
    { key: 'webhooks',        name: 'Webhooks',   hint: 'Webhook URL (veya boş bırakın, sonra: natureco webhooks add)' },
  ];

  for (const integ of integrations) {
    const current = cfg[integ.key] || '';
    if (current) {
      console.log(chalk.gray(`  ${integ.name}: zaten ayarlı, boş bırakırsanız korunur`));
    } else {
      console.log(chalk.gray(`  ${integ.hint}`));
    }
    const val = await rlQuestion(`  ${integ.name} ${current ? '(mevcut - boş bırakın)' : '(boş = atla)'}: `);
    if (val) {
      cfg[integ.key] = val;
      console.log(chalk.green(`    ✓ ${integ.name} ayarlandı`));
    }
  }

  // Save
  cfg.providerUrl = providerUrl;
  cfg.providerModel = providerModel;
  cfg.setupCompleted = true;
  cfg.updated = new Date().toISOString();
  if (!cfg.created) cfg.created = new Date().toISOString();
  if (!cfg.version) cfg.version = 1;
  if (cfg.skills === undefined) cfg.skills = { enabled: true, list: [] };
  if (cfg.mcpServers === undefined) cfg.mcpServers = {};

  saveConfig(cfg);

  console.log('');
  console.log(chalk.green('  ✓ Setup complete!\n'));
  console.log(chalk.white('  Config saved to: ') + chalk.gray(CONFIG_FILE));
  console.log('');
  console.log(chalk.white('  Next steps:'));
  console.log(chalk.cyan('    natureco chat              Start chatting'));
  console.log(chalk.cyan('    natureco repl              İnteraktif REPL (persistent memory)'));
  console.log(chalk.cyan('    natureco telegram connect  Telegram bot bağla (henüz yapılmadıysa)'));
  console.log(chalk.cyan('    natureco help              View all commands'));
  console.log('');
}

function cmdStatus() {
  console.log(chalk.cyan('\n  Setup Status\n'));

  const configExists = fs.existsSync(CONFIG_FILE);
  const dirExists = fs.existsSync(BASE_DIR);

  console.log(chalk.white('  Config:     ') + (configExists ? chalk.green('exists') : chalk.yellow('missing')));
  console.log(chalk.white('  Directory:  ') + (dirExists ? chalk.green('exists') : chalk.yellow('missing')));

  if (configExists) {
    const cfg = getConfig();
    console.log(chalk.white('  Provider:   ') + chalk.gray(cfg.providerUrl || 'not set'));
    console.log(chalk.white('  Model:      ') + chalk.gray(cfg.providerModel || 'not set'));
    console.log(chalk.white('  API Key:    ') + (cfg.providerApiKey ? chalk.green('set') : chalk.yellow('not set')));
    console.log(chalk.white('  Setup:      ') + (cfg.setupCompleted ? chalk.green('completed') : chalk.yellow('incomplete')));
  }

  if (dirExists) {
    const existing = fs.readdirSync(BASE_DIR).filter(f => fs.statSync(path.join(BASE_DIR, f)).isDirectory());
    const present = DIRS.filter(d => existing.includes(d));
    const absent = DIRS.filter(d => !existing.includes(d));
    if (present.length) console.log(chalk.white('  Dirs:       ') + chalk.green(present.join(', ')));
    if (absent.length) console.log(chalk.white('  Missing:    ') + chalk.yellow(absent.join(', ')));
  }

  console.log('');
}

function cmdConfig() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

  const defaults = {
    version: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    setupCompleted: false,
    skills: { enabled: true, list: [] },
    mcpServers: {},
  };

  if (fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow('\n  Config already exists at: ' + CONFIG_FILE + '\n'));
    return;
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf8');
  console.log(chalk.green('\n  Config created at: ' + CONFIG_FILE + '\n'));
}

function cmdWorkspace() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

  const workspaceDir = path.join(BASE_DIR, 'workspace');
  const logsDir = path.join(BASE_DIR, 'logs');

  if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  console.log(chalk.green('\n  Workspace directories created:\n'));
  console.log(chalk.gray('    ' + workspaceDir));
  console.log(chalk.gray('    ' + logsDir));
  console.log('');
}

function cmdDirs() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

  let created = 0;
  for (const dir of DIRS) {
    const p = path.join(BASE_DIR, dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created++;
    }
  }

  console.log(chalk.green(`\n  Created ${created} data director${created === 1 ? 'y' : 'ies'}`));
  if (created > 0) {
    console.log(chalk.gray('  Location: ' + BASE_DIR));
  }
  console.log('');
}

module.exports = setup;

/**
 * v5.6.0: API key dogrulama — test istegi gonder
 * Boylece kullanici yanlis key ile devam etmez
 */
async function validateApiKey(providerUrl, apiKey) {
  return new Promise((resolve) => {
    const https = require('https');
    const url = new URL(providerUrl);
    const endpoint = url.hostname.includes('minimax') 
      ? providerUrl.replace(/\/+$/, '') + '/v1/text/chatcompletion_v2'
      : providerUrl.replace(/\/+$/, '') + '/chat/completions';
    
    const data = JSON.stringify({
      model: 'test',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    });
    
    const u = new URL(endpoint);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(data);
    req.end();
  });
}
