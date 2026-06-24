const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');

async function irc(action) {
  if (!action || action === 'connect') return connectIrc();
  if (action === 'disconnect') return disconnectIrc();
  if (action === 'status') return statusIrc();
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status\n'));
  process.exit(1);
}

async function connectIrc() {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }
  console.log(chalk.yellow('\n⏳ IRC bağlantısı hazırlanıyor...\n'));

  const defaults = {
    host: config.ircHost || '',
    port: config.ircPort || 6697,
    tls: config.ircTls !== undefined ? config.ircTls : true,
    nick: config.ircNick || '',
    username: config.ircUsername || '',
    realname: config.ircRealname || '',
    password: config.ircPassword || '',
    channels: config.ircChannels || [],
    dmPolicy: config.ircDmPolicy || 'pairing',
    nickservEnabled: config.ircNickservEnabled !== undefined ? config.ircNickservEnabled : true,
    nickservPassword: config.ircNickservPassword || '',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'host', message: 'IRC sunucusu:', default: defaults.host, validate: v => v.trim() ? true : 'Gerekli' },
    { type: 'input', name: 'port', message: 'Port:', default: String(defaults.port), validate: v => { const n = parseInt(v); return n > 0 && n < 65536 ? true : '1-65535 arası' } },
    { type: 'confirm', name: 'tls', message: 'TLS kullanılsın mı?', default: defaults.tls },
    { type: 'input', name: 'nick', message: 'Nick:', default: defaults.nick, validate: v => v.trim() ? true : 'Gerekli' },
    { type: 'input', name: 'username', message: 'Kullanıcı adı (opsiyonel):', default: defaults.username || defaults.nick },
    { type: 'input', name: 'realname', message: 'Gerçek ad (opsiyonel):', default: defaults.realname || 'NatureCo' },
    { type: 'password', name: 'password', message: 'Sunucu parolası (opsiyonel):' },
    { type: 'input', name: 'channels', message: 'Kanallar (virgülle ayırın):', default: defaults.channels.join(',') },
    { type: 'confirm', name: 'nickservEnabled', message: 'NickServ kullanılsın mı?', default: defaults.nickservEnabled },
    { type: 'password', name: 'nickservPassword', message: 'NickServ parolası (opsiyonel):' },
    { type: 'list', name: 'dmPolicy', message: 'DM politikası:', default: defaults.dmPolicy, choices: [
      { name: 'Pairing (önerilen)', value: 'pairing' },
      { name: 'Allowlist', value: 'allowlist' },
      { name: 'Open', value: 'open' },
      { name: 'Disabled', value: 'disabled' },
    ]},
  ]);

  const botId = `irc_${Date.now()}`;
  config.ircHost = answers.host.trim();
  config.ircPort = parseInt(answers.port);
  config.ircTls = answers.tls;
  config.ircNick = answers.nick.trim();
  config.ircUsername = answers.username.trim() || answers.nick.trim();
  config.ircRealname = answers.realname.trim() || 'NatureCo';
  config.ircPassword = answers.password || '';
  config.ircChannels = answers.channels ? answers.channels.split(',').map(c => c.trim()).filter(Boolean) : [];
  config.ircNickservEnabled = answers.nickservEnabled;
  config.ircNickservPassword = answers.nickservPassword || '';
  config.ircDmPolicy = answers.dmPolicy;
  config.ircBotId = botId;
  saveConfig(config);

  console.log(chalk.green('\n✅ IRC bağlantısı kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Sunucu:'), chalk.white(`${answers.host.trim()}:${answers.port}`));
  console.log(chalk.cyan('Nick:'), chalk.white(answers.nick.trim()));
  if (config.ircChannels.length) console.log(chalk.cyan('Kanallar:'), chalk.white(config.ircChannels.join(', ')));
  console.log(chalk.gray('\nGateway ile başlatmak için: natureco gateway start\n'));
}

async function disconnectIrc() {
  const config = getConfig();
  if (!config.ircBotId) {
    console.log(chalk.gray('\n⚠️  No IRC connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'IRC bağlantısını kaldırmak istediğinize emin misiniz?', default: false }
  ]);
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  delete config.ircHost; delete config.ircPort; delete config.ircTls; delete config.ircNick;
  delete config.ircUsername; delete config.ircRealname; delete config.ircPassword;
  delete config.ircChannels; delete config.ircNickservEnabled; delete config.ircNickservPassword;
  delete config.ircDmPolicy; delete config.ircBotId;
  saveConfig(config);
  console.log(chalk.green('\n✅ IRC disconnected\n'));
}

function statusIrc() {
  const config = getConfig();
  if (!config.ircBotId) {
    console.log(chalk.gray('\n⚠️  IRC not connected\n'));
    console.log(chalk.gray('Connect with: natureco irc connect\n'));
    return;
  }
  console.log(chalk.green('\n✅ IRC connected\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(config.ircBotId));
  console.log(chalk.cyan('Sunucu:'), chalk.white(`${config.ircHost}:${config.ircPort}`));
  console.log(chalk.cyan('TLS:'), chalk.white(config.ircTls ? 'Evet' : 'Hayır'));
  console.log(chalk.cyan('Nick:'), chalk.white(config.ircNick));
  console.log(chalk.cyan('Kullanıcı:'), chalk.white(config.ircUsername));
  if (config.ircRealname) console.log(chalk.cyan('Realname:'), chalk.white(config.ircRealname));
  if (config.ircChannels?.length) console.log(chalk.cyan('Kanallar:'), chalk.white(config.ircChannels.join(', ')));
  console.log(chalk.cyan('NickServ:'), chalk.white(config.ircNickservEnabled ? 'Evet' : 'Hayır'));
  console.log(chalk.cyan('DM Politikası:'), chalk.white(config.ircDmPolicy || 'pairing'));
  console.log(chalk.gray('\nDisconnect with: natureco irc disconnect\n'));
}

module.exports = irc;
