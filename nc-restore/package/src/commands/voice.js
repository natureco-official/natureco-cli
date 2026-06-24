const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  microsoft: 'Microsoft (Azure)',
  deepgram: 'Deepgram',
  google: 'Google Cloud'
};

function mask(str, keep = 6) {
  if (!str) return '(unset)';
  return str.length <= keep ? '***' : `${str.slice(0, keep)}…`;
}

async function voice(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusVoice();
  if (action === 'providers') return listProviders();
  if (action === 'set') return setVoiceProvider(params);

  console.log(chalk.red(`\n  ❌ Unknown command: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco voice [status|providers|set]\n'));
  process.exit(1);
}

function statusVoice() {
  const config = getConfig();
  const ttsConfig = config.tts || {};
  const provider = ttsConfig.provider || 'openai';
  const voiceId = ttsConfig.voiceId;
  const apiKey = ttsConfig.apiKey || config[`${provider}ApiKey`] || process.env[`${provider.toUpperCase()}_API_KEY`];

  console.log(chalk.cyan('\n  🎤 Voice Status\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Provider:')}     ${chalk.cyan(provider)}`);
  console.log(`  ${chalk.white('Voice ID:')}      ${chalk.cyan(voiceId || '(default)')}`);
  console.log(`  ${chalk.white('API Key:')}       ${chalk.gray(mask(apiKey))}`);
  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.cyan('    natureco voice providers') + chalk.gray('  List available providers'));
  console.log(chalk.cyan('    natureco voice set <provider> [voiceId]') + chalk.gray('  Set voice provider'));
  console.log();
}

function listProviders() {
  console.log(chalk.cyan('\n  🎤 Voice Providers\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  for (const [id, label] of Object.entries(PROVIDER_LABELS)) {
    console.log(`  ${chalk.white(label)} ${chalk.gray(`(${id})`)}`);
  }

  console.log(chalk.gray('\n  Set provider:'));
  console.log(chalk.cyan('    natureco voice set openai'));
  console.log(chalk.cyan('    natureco voice set elevenlabs [voiceId]'));
  console.log();
}

function setVoiceProvider(args) {
  const provider = args[0];
  const voiceId = args.slice(1).join(' ') || '';

  if (!provider || !PROVIDER_LABELS[provider]) {
    console.log(chalk.red(`\n  ❌ Unknown provider: ${provider}\n`));
    console.log(chalk.gray('  Available: ' + Object.keys(PROVIDER_LABELS).join(', ')));
    console.log();
    process.exit(1);
  }

  const config = getConfig();
  if (!config.tts) config.tts = {};
  config.tts.provider = provider;
  if (voiceId) config.tts.voiceId = voiceId;
  else delete config.tts.voiceId;
  saveConfig(config);

  console.log(chalk.green(`\n  ✅ Voice provider set to ${PROVIDER_LABELS[provider]}${voiceId ? ` (voice: ${voiceId})` : ''}\n`));
}

module.exports = voice;
