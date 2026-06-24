const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getApiKey, getConfig, saveConfig } = require('../utils/config');
const { getBots } = require('../utils/api');

const { checkExistingToken } = require('./channel-helper');

async function slack(action) {
  if (!action || action === 'connect') {
    return connectSlack();
  }
  
  if (action === 'disconnect') {
    return disconnectSlack();
  }
  
  if (action === 'status') {
    return statusSlack();
  }
  
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status\n'));
  process.exit(1);
}

async function connectSlack() {
  const config = getConfig();
  
  if (!config.providerUrl) {
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }
  
  process.stdin.resume();
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Slack bot token (starts with xoxb-):',
      validate: (val) => {
        const trimmed = val.trim();
        if (trimmed === '') return 'Token cannot be empty';
        if (!trimmed.startsWith('xoxb-')) return 'Slack bot token must start with xoxb-';
        return true;
      },
    },
  ]);
  
  // Slack için bot ID oluştur (timestamp-based)
  const botId = `slack_${Date.now()}`;
  const selectedBot = { name: 'Slack Bot', id: botId };
  
  console.log(chalk.yellow('\n⏳ Slack bağlantısı kaydediliyor...\n'));
  
  // Save to config (v2.x - no backend call)
  config.slackToken = answers.token.trim();
  config.slackBotId = botId;
  saveConfig(config);
  
  console.log(chalk.green('✅ Slack token kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Token:'), chalk.white(answers.token.slice(0, 20) + '...'));
  console.log(chalk.gray('\nNot: Slack botunuzu Slack App settings\'ten yapılandırmanız gerekiyor.'));
  console.log(chalk.gray('Token config\'e kaydedildi: ~/.natureco/config.json\n'));
}

async function disconnectSlack() {
  const config = getConfig();
  
  if (!config.slackToken) {
    console.log(chalk.gray('\n⚠️  No Slack connection found\n'));
    return;
  }
  
  process.stdin.resume();
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to disconnect Slack?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  
  // Remove from config
  delete config.slackToken;
  delete config.slackBotId;
  saveConfig(config);
  
  console.log(chalk.green('\n✅ Slack disconnected\n'));
  console.log(chalk.gray('Note: The bot is still registered on Slack.'));
  console.log(chalk.gray('You may need to manually remove it from Slack App settings.\n'));
}

function statusSlack() {
  const config = getConfig();
  
  if (!config.slackToken) {
    console.log(chalk.gray('\n⚠️  Slack not connected\n'));
    console.log(chalk.gray('Connect with: natureco slack connect\n'));
    return;
  }
  
  console.log(chalk.green('\n✅ Slack connected\n'));
  console.log(chalk.cyan('Token:'), chalk.white(config.slackToken.slice(0, 20) + '...'));
  
  if (config.slackBotId) {
    console.log(chalk.cyan('Bot ID:'), chalk.white(config.slackBotId));
  }
  
  console.log(chalk.gray('\nDisconnect with: natureco slack disconnect\n'));
}

module.exports = slack;
