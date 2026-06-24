const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');

async function mattermost(action) {
  if (!action || action === 'connect') return connectMattermost();
  if (action === 'disconnect') return disconnectMattermost();
  if (action === 'status') return statusMattermost();
  if (action === 'probe') return probeMattermost();
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status, probe\n'));
  process.exit(1);
}

async function connectMattermost() {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }
  console.log(chalk.yellow('\n⏳ Mattermost bağlantısı hazırlanıyor...\n'));
  console.log(chalk.gray('Mattermost bot token almak için:'));
  console.log(chalk.gray('1. Mattermost > System Console > Bot Accounts'));
  console.log(chalk.gray('2. Bot oluşturun veya mevcut botu kullanın'));
  console.log(chalk.gray('3. Access Token oluşturun\n'));

  const defaults = {
    baseUrl: config.mattermostBaseUrl || '',
    token: config.mattermostToken || '',
    dmPolicy: config.mattermostDmPolicy || 'pairing',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'baseUrl', message: 'Mattermost sunucu URL:', default: defaults.baseUrl, validate: v => v.trim() ? true : 'Gerekli' },
    { type: 'input', name: 'token', message: 'Bot token:', default: defaults.token ? defaults.token.slice(0, 10) + '...' : '', validate: v => v.trim() ? true : 'Gerekli' },
    { type: 'confirm', name: 'enableSlash', message: 'Slash komutları kaydedilsin mi?', default: config.mattermostSlashEnabled !== false },
    { type: 'list', name: 'dmPolicy', message: 'DM politikası:', default: defaults.dmPolicy, choices: [
      { name: 'Pairing (önerilen)', value: 'pairing' },
      { name: 'Allowlist', value: 'allowlist' },
      { name: 'Open', value: 'open' },
      { name: 'Disabled', value: 'disabled' },
    ]},
  ]);

  const botId = `mattermost_${Date.now()}`;
  config.mattermostBaseUrl = answers.baseUrl.trim().replace(/\/+$/, '');
  config.mattermostToken = answers.token.trim();
  config.mattermostSlashEnabled = answers.enableSlash;
  config.mattermostDmPolicy = answers.dmPolicy;
  config.mattermostBotId = botId;
  saveConfig(config);

  console.log(chalk.green('\n✅ Mattermost bağlantısı kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Sunucu:'), chalk.white(config.mattermostBaseUrl));
  console.log(chalk.cyan('Token:'), chalk.white((answers.token || '').slice(0, 20) + '...'));
  console.log(chalk.gray('\nGateway ile başlatmak için: natureco gateway start\n'));
}

async function disconnectMattermost() {
  const config = getConfig();
  if (!config.mattermostBotId) {
    console.log(chalk.gray('\n⚠️  No Mattermost connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Mattermost bağlantısını kaldırmak istediğinize emin misiniz?', default: false }
  ]);
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  delete config.mattermostBaseUrl; delete config.mattermostToken;
  delete config.mattermostSlashEnabled; delete config.mattermostDmPolicy;
  delete config.mattermostBotId;
  saveConfig(config);
  console.log(chalk.green('\n✅ Mattermost disconnected\n'));
}

function statusMattermost() {
  const config = getConfig();
  if (!config.mattermostBotId) {
    console.log(chalk.gray('\n⚠️  Mattermost not connected\n'));
    console.log(chalk.gray('Connect with: natureco mattermost connect\n'));
    return;
  }
  console.log(chalk.green('\n✅ Mattermost connected\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(config.mattermostBotId));
  console.log(chalk.cyan('Sunucu:'), chalk.white(config.mattermostBaseUrl));
  console.log(chalk.cyan('Token:'), chalk.white((config.mattermostToken || '').slice(0, 20) + '...'));
  console.log(chalk.cyan('Slash Komutları:'), chalk.white(config.mattermostSlashEnabled !== false ? 'Aktif' : 'Devre Dışı'));
  console.log(chalk.cyan('DM Politikası:'), chalk.white(config.mattermostDmPolicy || 'pairing'));

  // Optionally probe
  if (config.mattermostBaseUrl && config.mattermostToken) {
    console.log(chalk.gray('\nProbe için: natureco mattermost probe\n'));
  }
  console.log(chalk.gray('\nDisconnect with: natureco mattermost disconnect\n'));
}

async function probeMattermost() {
  const config = getConfig();
  if (!config.mattermostBaseUrl || !config.mattermostToken) {
    console.log(chalk.red('\n❌ Mattermost bağlantısı yapılmamış\n'));
    console.log(chalk.gray('Önce: natureco mattermost connect\n'));
    process.exit(1);
  }

  const baseUrl = config.mattermostBaseUrl.replace(/\/+$/, '');
  const token = config.mattermostToken;

  console.log(chalk.yellow(`\n⏳ Problanıyor: ${baseUrl}\n`));

  try {
    const res = await fetch(`${baseUrl}/api/v4/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(chalk.red(`✗ API Hatası: HTTP ${res.status}`));
      if (res.status === 401) console.log(chalk.gray('  Token geçersiz. Yeni bir bot token alın.'));
      if (res.status === 403) console.log(chalk.gray('  Botun yetkisi yetersiz.'));
      process.exit(1);
    }

    const me = await res.json();
    console.log(chalk.green('✓ API Bağlantısı Başarılı\n'));
    console.log(chalk.cyan('Bot Kullanıcı ID:'), chalk.white(me.id));
    console.log(chalk.cyan('Kullanıcı Adı:'), chalk.white(me.username));
    console.log(chalk.cyan('E-posta:'), chalk.white(me.email));
    console.log(chalk.cyan('Rol:'), chalk.white(me.roles));

    // Check WebSocket
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/v4/websocket';
    console.log(chalk.gray(`\nWebSocket: ${wsUrl}`));

    // Check slash commands
    try {
      const teamsRes = await fetch(`${baseUrl}/api/v4/users/me/teams`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (teamsRes.ok) {
        const teams = await teamsRes.json();
        console.log(chalk.gray(`\nTakımlar (${teams.length}):`));
        for (const team of teams.slice(0, 5)) {
          console.log(chalk.gray(`  - ${team.display_name} (${team.name})`));
        }
      }
    } catch {}

    console.log('');

  } catch (err) {
    console.log(chalk.red(`\n✗ Probe hatası: ${err.message}\n`));
    if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      console.log(chalk.gray('Sunucuya erişilemiyor. URL\'yi kontrol edin.\n'));
    }
    process.exit(1);
  }
}

module.exports = mattermost;
