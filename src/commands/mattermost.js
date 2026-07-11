const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
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
    console.log(chalk.red(L('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n', '\n❌ Setup not done. Run "natureco setup" first.\n')));
    process.exit(1);
  }
  console.log(chalk.yellow(L('\n⏳ Mattermost bağlantısı hazırlanıyor...\n', '\n⏳ Preparing Mattermost connection...\n')));
  console.log(chalk.gray(L('Mattermost bot token almak için:', 'To get a Mattermost bot token:')));
  console.log(chalk.gray('1. Mattermost > System Console > Bot Accounts'));
  console.log(chalk.gray(L('2. Bot oluşturun veya mevcut botu kullanın', '2. Create a bot or use an existing one')));
  console.log(chalk.gray(L('3. Access Token oluşturun\n', '3. Create an Access Token\n')));

  const defaults = {
    baseUrl: config.mattermostBaseUrl || '',
    token: config.mattermostToken || '',
    dmPolicy: config.mattermostDmPolicy || 'pairing',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'baseUrl', message: L('Mattermost sunucu URL:', 'Mattermost server URL:'), default: defaults.baseUrl, validate: v => v.trim() ? true : L('Gerekli', 'Required') },
    { type: 'input', name: 'token', message: 'Bot token:', default: defaults.token ? defaults.token.slice(0, 10) + '...' : '', validate: v => v.trim() ? true : L('Gerekli', 'Required') },
    { type: 'confirm', name: 'enableSlash', message: L('Slash komutları kaydedilsin mi?', 'Register slash commands?'), default: config.mattermostSlashEnabled !== false },
    { type: 'list', name: 'dmPolicy', message: L('DM politikası:', 'DM policy:'), default: defaults.dmPolicy, choices: [
      { name: L('Pairing (önerilen)', 'Pairing (recommended)'), value: 'pairing' },
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

  console.log(chalk.green(L('\n✅ Mattermost bağlantısı kaydedildi!\n', '\n✅ Mattermost connection saved!\n')));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan(L('Sunucu:', 'Server:')), chalk.white(config.mattermostBaseUrl));
  console.log(chalk.cyan('Token:'), chalk.white((answers.token || '').slice(0, 20) + '...'));
  console.log(chalk.gray(L('\nGateway ile başlatmak için: natureco gateway start\n', '\nTo start with the gateway: natureco gateway start\n')));
}

async function disconnectMattermost() {
  const config = getConfig();
  if (!config.mattermostBotId) {
    console.log(chalk.gray('\n⚠️  No Mattermost connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: L('Mattermost bağlantısını kaldırmak istediğinize emin misiniz?', 'Are you sure you want to remove the Mattermost connection?'), default: false }
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
  console.log(chalk.cyan(L('Sunucu:', 'Server:')), chalk.white(config.mattermostBaseUrl));
  console.log(chalk.cyan('Token:'), chalk.white((config.mattermostToken || '').slice(0, 20) + '...'));
  console.log(chalk.cyan(L('Slash Komutları:', 'Slash Commands:')), chalk.white(config.mattermostSlashEnabled !== false ? L('Aktif', 'Active') : L('Devre Dışı', 'Disabled')));
  console.log(chalk.cyan(L('DM Politikası:', 'DM Policy:')), chalk.white(config.mattermostDmPolicy || 'pairing'));

  // Optionally probe
  if (config.mattermostBaseUrl && config.mattermostToken) {
    console.log(chalk.gray(L('\nProbe için: natureco mattermost probe\n', '\nFor probe: natureco mattermost probe\n')));
  }
  console.log(chalk.gray('\nDisconnect with: natureco mattermost disconnect\n'));
}

async function probeMattermost() {
  const config = getConfig();
  if (!config.mattermostBaseUrl || !config.mattermostToken) {
    console.log(chalk.red(L('\n❌ Mattermost bağlantısı yapılmamış\n', '\n❌ Mattermost connection not set up\n')));
    console.log(chalk.gray(L('Önce: natureco mattermost connect\n', 'First: natureco mattermost connect\n')));
    process.exit(1);
  }

  const baseUrl = config.mattermostBaseUrl.replace(/\/+$/, '');
  const token = config.mattermostToken;

  console.log(chalk.yellow(`\n⏳ ${L('Problanıyor', 'Probing')}: ${baseUrl}\n`));

  try {
    const res = await fetch(`${baseUrl}/api/v4/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(chalk.red(`✗ ${L('API Hatası', 'API Error')}: HTTP ${res.status}`));
      if (res.status === 401) console.log(chalk.gray(L('  Token geçersiz. Yeni bir bot token alın.', '  Token invalid. Get a new bot token.')));
      if (res.status === 403) console.log(chalk.gray(L('  Botun yetkisi yetersiz.', '  Bot has insufficient permissions.')));
      process.exit(1);
    }

    const me = await res.json();
    console.log(chalk.green(L('✓ API Bağlantısı Başarılı\n', '✓ API Connection Successful\n')));
    console.log(chalk.cyan(L('Bot Kullanıcı ID:', 'Bot User ID:')), chalk.white(me.id));
    console.log(chalk.cyan(L('Kullanıcı Adı:', 'Username:')), chalk.white(me.username));
    console.log(chalk.cyan(L('E-posta:', 'Email:')), chalk.white(me.email));
    console.log(chalk.cyan(L('Rol:', 'Role:')), chalk.white(me.roles));

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
        console.log(chalk.gray(`\n${L('Takımlar', 'Teams')} (${teams.length}):`));
        for (const team of teams.slice(0, 5)) {
          console.log(chalk.gray(`  - ${team.display_name} (${team.name})`));
        }
      }
    } catch {}

    console.log('');

  } catch (err) {
    console.log(chalk.red(`\n✗ ${L('Probe hatası', 'Probe error')}: ${err.message}\n`));
    if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      console.log(chalk.gray(L('Sunucuya erişilemiyor. URL\'yi kontrol edin.\n', 'Cannot reach the server. Check the URL.\n')));
    }
    process.exit(1);
  }
}

module.exports = mattermost;
