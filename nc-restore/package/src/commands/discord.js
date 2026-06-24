const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getApiKey, getConfig, saveConfig } = require('../utils/config');
const { getBots } = require('../utils/api');

const { checkExistingToken } = require('./channel-helper');

async function discord(action) {
  if (!action || action === 'connect') {
    return connectDiscord();
  }
  
  if (action === 'disconnect') {
    return disconnectDiscord();
  }
  
  if (action === 'status') {
    return statusDiscord();
  }
  
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status\n'));
  process.exit(1);
}

async function connectDiscord() {
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
      message: 'Discord bot token:',
      validate: (val) => val.trim() !== '' || 'Token cannot be empty',
    },
  ]);
  
  // Discord için bot ID oluştur (timestamp-based)
  const botId = `discord_${Date.now()}`;
  const selectedBot = { name: 'Discord Bot', id: botId };
  
  console.log(chalk.yellow('\n⏳ Discord bağlantısı kaydediliyor...\n'));
  
  // Save to config (v2.x - no backend call)
  config.discordToken = answers.token.trim();
  config.discordBotId = botId;
  saveConfig(config);
  
  console.log(chalk.green('✅ Discord token kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Token:'), chalk.white(answers.token.slice(0, 20) + '...'));
  console.log(chalk.gray('\nNot: Discord botunuzu Discord Developer Portal\'dan yapılandırmanız gerekiyor.'));
  console.log(chalk.gray('Token config\'e kaydedildi: ~/.natureco/config.json\n'));
}

async function disconnectDiscord() {
  const config = getConfig();
  
  if (!config.discordToken) {
    console.log(chalk.gray('\n⚠️  No Discord connection found\n'));
    return;
  }
  
  process.stdin.resume();
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to disconnect Discord?',
      default: false,
    },
  ]);
  
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  
  // Remove from config
  delete config.discordToken;
  delete config.discordBotId;
  saveConfig(config);
  
  console.log(chalk.green('\n✅ Discord disconnected\n'));
  console.log(chalk.gray('Note: The bot is still registered on Discord.'));
  console.log(chalk.gray('You may need to manually remove it from Discord Developer Portal.\n'));
}

function statusDiscord() {
  const config = getConfig();
  
  if (!config.discordToken) {
    console.log(chalk.gray('\n⚠️  Discord not connected\n'));
    console.log(chalk.gray('Connect with: natureco discord connect\n'));
    return;
  }
  
  console.log(chalk.green('\n✅ Discord connected\n'));
  console.log(chalk.cyan('Token:'), chalk.white(config.discordToken.slice(0, 20) + '...'));
  
  if (config.discordBotId) {
    console.log(chalk.cyan('Bot ID:'), chalk.white(config.discordBotId));
  }
  
  console.log(chalk.gray('\nDisconnect with: natureco discord disconnect\n'));
}

module.exports = discord;
