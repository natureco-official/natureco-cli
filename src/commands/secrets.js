const chalk = require('chalk');
const tui = require('../utils/tui');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const F = require('../utils/format');
const { getConfig, saveConfig } = require('../utils/config');

function secrets(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listSecrets();
  if (action === 'set') return setSecret(params[0], params.slice(1).join(' '));
  if (action === 'get') return getSecret(params[0]);
  if (action === 'unset') return unsetSecret(params[0]);
  if (action === 'audit') return auditSecrets();
  if (action === 'reload') return reloadSecrets();
  if (action === 'configure') return configureProvider(params[0]);
  if (action === 'apply') return applySecrets();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco secrets [list|set|get|unset|audit|reload|configure|apply]\n', '  Usage: natureco secrets [list|set|get|unset|audit|reload|configure|apply]\n')));
  process.exit(1);
}

function listSecrets() {
  const config = getConfig();
  const secretKeys = Object.keys(config).filter(k =>
    k.toLowerCase().includes('key') || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')
  );

  console.log('\n' + tui.styled('  🔐 Secrets', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  if (secretKeys.length === 0) {
    console.log('\n  ' + tui.C.muted('No secrets stored.'));
    console.log('');
    return;
  }

  const rows = secretKeys.sort().map(key => {
    const val = config[key];
    const masked = val ? val.substring(0, 6) + '…' + val.slice(-4) : '(empty)';
    return { key, masked, updated: '-' };
  });

  console.log('\n' + tui.table(rows, [
    { key: 'key', label: L('İsim', 'Name'), minWidth: 24, render: r => tui.styled(r.key, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'masked', label: L('Maskelenmiş', 'Masked'), minWidth: 16, render: r => tui.styled(r.masked, { color: tui.PALETTE.warning }) },
    { key: 'updated', label: L('Güncellendi', 'Updated'), minWidth: 14, render: r => tui.C.muted(r.updated) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function setSecret(key, value) {
  if (!key || !value) {
    console.log(chalk.red('\n  ❌ key ve value gerekli\n'));
    process.exit(1);
  }

  const config = getConfig();
  config[key] = value;
  saveConfig(config);
  F.success(`Secret set: ${key}`);
}

function getSecret(key) {
  if (!key) {
    console.log(chalk.red('\n  ❌ key gerekli\n'));
    process.exit(1);
  }

  const config = getConfig();
  const value = config[key];

  if (!value) {
    F.warning(`Secret not found: ${key}`);
    return;
  }

  F.kv(key, value);
}

function unsetSecret(key) {
  if (!key) {
    console.log(chalk.red('\n  ❌ key gerekli\n'));
    process.exit(1);
  }

  const config = getConfig();
  delete config[key];
  saveConfig(config);
  F.success(`Secret removed: ${key}`);
}

function auditSecrets() {
  const config = getConfig();
  const secrets = Object.keys(config).filter(k =>
    k.toLowerCase().includes('key') || k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')
  );

  const envKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'TAVILY_API_KEY',
    'ELEVENLABS_API_KEY', 'DEEPGRAM_API_KEY', 'FAL_KEY', 'TOGETHER_API_KEY',
    'PUSHOVER_TOKEN', 'PUSHOVER_USER', 'NTFY_TOPIC', 'NTFY_SERVER',
    'TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_FROM', 'SUNO_API_KEY', 'UDIO_API_KEY',
    'VYDRA_API_KEY', 'SLACK_BOT_TOKEN', 'DISCORD_BOT_TOKEN', 'TELEGRAM_BOT_TOKEN',
    'WHATSAPP_API_KEY'
  ];

  F.header('Secrets Audit');

  const rows = [];
  for (const key of secrets.sort()) {
    const val = config[key];
    rows.push([key, 'config', val ? 'set' : 'empty']);
  }

  let found = 0;
  for (const envKey of envKeys) {
    if (process.env[envKey]) {
      rows.push([envKey, 'env', 'set']);
      found++;
    }
  }

  F.table(['Key', 'Type', 'Status'], rows);

  if (found === 0) F.info('(none set in environment)');

  F.meta(`Total: ${secrets.length} config + ${found} env`);
}

function reloadSecrets() {
  const config = getConfig();
  const envMappings = {
    OPENAI_API_KEY: 'openaiApiKey',
    ANTHROPIC_API_KEY: 'anthropicApiKey',
    GROQ_API_KEY: 'groqApiKey',
    TAVILY_API_KEY: 'tavilyApiKey',
    ELEVENLABS_API_KEY: 'elevenlabsApiKey',
    DEEPGRAM_API_KEY: 'deepgramApiKey',
    FAL_KEY: 'falKey',
    TOGETHER_API_KEY: 'togetherApiKey',
    TELEGRAM_BOT_TOKEN: 'telegramToken',
    DISCORD_BOT_TOKEN: 'discordToken',
    SLACK_BOT_TOKEN: 'slackToken',
  };
  let count = 0;
  for (const [envVar, configKey] of Object.entries(envMappings)) {
    if (process.env[envVar] && !config[configKey]) {
      config[configKey] = process.env[envVar];
      count++;
    }
  }
  if (count > 0) {
    saveConfig(config);
    F.success(`${count} secrets loaded from environment`);
  } else {
    F.warning('No new secrets found in environment');
  }
}

function configureProvider(provider) {
  if (!provider) {
    console.log(chalk.red('\n  ❌ Provider name required\n'));
    console.log(chalk.gray('  Available: openai, anthropic, groq, together, deepseek, mistral, perplexity, elevenlabs, deepgram, fal\n'));
    process.exit(1);
  }

  const instructions = {
    openai: { key: 'openaiApiKey', env: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys' },
    anthropic: { key: 'anthropicApiKey', env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com/keys' },
    groq: { key: 'groqApiKey', env: 'GROQ_API_KEY', url: 'https://console.groq.com/keys' },
    together: { key: 'togetherApiKey', env: 'TOGETHER_API_KEY', url: 'https://together.ai/settings/api-keys' },
    deepseek: { key: 'deepseekApiKey', env: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com/api-keys' },
    mistral: { key: 'mistralApiKey', env: 'MISTRAL_API_KEY', url: 'https://console.mistral.ai/api-keys' },
    perplexity: { key: 'perplexityApiKey', env: 'PERPLEXITY_API_KEY', url: 'https://www.perplexity.ai/settings/api' },
    elevenlabs: { key: 'elevenlabsApiKey', env: 'ELEVENLABS_API_KEY', url: 'https://elevenlabs.io/app/settings/api-keys' },
    deepgram: { key: 'deepgramApiKey', env: 'DEEPGRAM_API_KEY', url: 'https://console.deepgram.com/keys' },
    fal: { key: 'falKey', env: 'FAL_KEY', url: 'https://fal.ai/dashboard/keys' },
  };

  const info = instructions[provider.toLowerCase()];

  if (!info) {
    console.log(chalk.red(`\n  ❌ Unknown provider: ${provider}\n`));
    console.log(chalk.gray('  Available: openai, anthropic, groq, together, deepseek, mistral, perplexity, elevenlabs, deepgram, fal\n'));
    process.exit(1);
  }

  F.section(`Configure ${provider}`);

  F.list([
    { label: 'Config key', value: info.key },
    { label: 'Env var', value: info.env },
    { label: 'Get key', value: info.url },
  ]);

  F.info(`Set it: natureco secrets set ${info.key} <your-key>`);
  F.info(`Or set env: $env:${info.env}="your-key"`);
}

function applySecrets() {
  F.header('Apply Secrets');
  F.info('Secrets are stored locally in config.json');
  F.info('To make them available to running processes:');
  F.list([
    'Set environment variables and restart',
    'Or use: natureco secrets reload',
  ]);
}

module.exports = secrets;
