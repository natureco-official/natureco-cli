const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);

const VYDRA_ENDPOINTS = {
  'vydra-image': {
    name: 'Vydra Image Generation',
    endpoint: 'https://api.vydra.ai/v1/images/generations',
    docs: 'https://docs.vydra.ai/image-generation'
  },
  'vydra-video': {
    name: 'Vydra Video Generation',
    endpoint: 'https://api.vydra.ai/v1/video/generations',
    docs: 'https://docs.vydra.ai/video-generation'
  },
  'vydra-music': {
    name: 'Vydra Music Generation',
    endpoint: 'https://api.vydra.ai/v1/music/generations',
    docs: 'https://docs.vydra.ai/music-generation'
  }
};

function vydra(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusVydra();
  if (action === 'configure') return configureVydra(params[0], params[1]);
  if (action === 'test') return testVydra();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco vydra [status|configure|test]\n', '  Usage: natureco vydra [status|configure|test]\n')));
  process.exit(1);
}

function statusVydra() {
  const config = getConfig();
  const apiKey = config.vydraApiKey || process.env.VYDRA_API_KEY;

  console.log(chalk.cyan('\n  🎬 Vydra Media Provider\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('API Key:')}      ${apiKey ? chalk.green('Configured') : chalk.red('Not set')}`);
  console.log(chalk.gray('\n  Available endpoints:\n'));

  for (const [id, ep] of Object.entries(VYDRA_ENDPOINTS)) {
    const configured = apiKey ? chalk.green('✅') : chalk.gray('⏸️');
    console.log(`  ${configured} ${chalk.white(ep.name)}`);
    console.log(`     ${chalk.gray(ep.endpoint)}`);
  }

  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.cyan('    configure <key>') + chalk.gray('    Set Vydra API key'));
  console.log(chalk.cyan('    test') + chalk.gray('              Test API connection'));
  console.log();
}

function configureVydra(key) {
  if (!key) {
    console.log(chalk.red('\n  ❌ API key gerekli\n'));
    process.exit(1);
  }

  const config = getConfig();
  config.vydraApiKey = key;
  saveConfig(config);
  console.log(chalk.green('\n  ✅ Vydra API key saved\n'));
}

async function testVydra() {
  const config = getConfig();
  const apiKey = config.vydraApiKey || process.env.VYDRA_API_KEY;

  if (!apiKey) {
    console.log(chalk.red('\n  ❌ Vydra API key gerekli\n'));
    console.log(chalk.cyan('    natureco vydra configure <your-api-key>\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n  Testing Vydra API connection...\n'));

  for (const [id, ep] of Object.entries(VYDRA_ENDPOINTS)) {
    try {
      const response = await fetch(ep.endpoint, {
        method: 'HEAD',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log(`  ${response.ok ? chalk.green('✅') : chalk.red('❌')} ${chalk.white(ep.name)} ${chalk.gray(`(${response.status})`)}`);
    } catch (err) {
      console.log(`  ${chalk.red('❌')} ${chalk.white(ep.name)} ${chalk.gray(`(${err.message})`)}`);
    }
  }

  console.log(chalk.gray('\n  Vydra API endpoints are available as providers for:'));
  console.log(chalk.cyan('    image_generation') + chalk.gray(' tool (provider: vydra)'));
  console.log(chalk.cyan('    video_generation') + chalk.gray(' tool (provider: vydra)'));
  console.log(chalk.cyan('    music_generation') + chalk.gray(' tool (provider: vydra)'));
  console.log();
}

module.exports = vydra;
