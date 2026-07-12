const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');
const fs = require('fs');
const { execSync } = require('child_process');

const { checkExistingToken } = require('./channel-helper');

async function imessage(action, recipient, message) {
  if (!action || action === 'connect') return connectImessage();
  if (action === 'disconnect') return disconnectImessage();
  if (action === 'status') return statusImessage();
  if (action === 'probe') return probeImessage();
  if (action === 'send') return sendMessage(recipient, message);
  if (action === 'allow') return allowNumber(recipient);
  if (action === 'disallow') return disallowNumber(recipient);
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status, probe, send, allow, disallow\n'));
  process.exit(1);
}

/**
 * v5.6.25: iMessage ile mesaj gönder
 * @param {string} recipient - Telefon numarası veya Apple ID email
 * @param {string} message - Mesaj metni
 */
/**
 * v5.6.27: Allow/Disallow numara
 */
async function allowNumber(number) {
  const config = getConfig();
  if (!config.imessageCliPath) {
    console.log(chalk.red(L('\n❌ iMessage bağlı değil.\n', '\n❌ iMessage not connected.\n')));
    process.exit(1);
  }
  if (!number) {
    console.log(chalk.red(L('\n❌ Numara belirtilmedi\n', '\n❌ Number not specified\n')));
    console.log(chalk.gray(L('Kullanım: natureco imessage allow <numara|email>\n', 'Usage: natureco imessage allow <number|email>\n')));
    process.exit(1);
  }

  const allowList = config.imessageAllowedNumbers || [];
  if (!allowList.includes(number)) {
    allowList.push(number);
  }

  // DM politikasini 'allowlist' yap
  config.imessageDmPolicy = 'allowlist';
  config.imessageAllowedNumbers = allowList;
  saveConfig(config);

  console.log(chalk.green(`\n✅ ${L('İzin verildi', 'Allowed')}: ${number}`));
  console.log(chalk.gray(`${L('Toplam izinli', 'Total allowed')}: ${allowList.length}`));
}

async function disallowNumber(number) {
  const config = getConfig();
  if (!number) {
    console.log(chalk.red(L('\n❌ Numara belirtilmedi\n', '\n❌ Number not specified\n')));
    process.exit(1);
  }

  const allowList = config.imessageAllowedNumbers || [];
  const newList = allowList.filter(n => n !== number);
  config.imessageAllowedNumbers = newList;
  saveConfig(config);

  console.log(chalk.green(`\n✅ ${L('İzin kaldırıldı', 'Permission removed')}: ${number}`));
}

async function sendMessage(recipient, message) {
  const config = getConfig();

  if (!config.imessageCliPath) {
    console.log(chalk.red(L('\n❌ iMessage bağlı değil. Önce "natureco imessage connect" çalıştırın.\n', '\n❌ iMessage not connected. Run "natureco imessage connect" first.\n')));
    process.exit(1);
  }

  if (!recipient) {
    console.log(chalk.red(L('\n❌ Alıcı belirtilmedi\n', '\n❌ Recipient not specified\n')));
    console.log(chalk.gray(L('Kullanım: natureco imessage send <numara|email> <mesaj>\n', 'Usage: natureco imessage send <number|email> <message>\n')));
    console.log(chalk.gray(L('Örnek:   natureco imessage send +905551234567 Merhaba!\n', 'Example: natureco imessage send +905551234567 Hello!\n')));
    process.exit(1);
  }

  if (!message) {
    console.log(chalk.red(L('\n❌ Mesaj belirtilmedi\n', '\n❌ Message not specified\n')));
    process.exit(1);
  }

  // Birden fazla kelimeyi birleştir
  const fullMessage = process.argv.slice(process.argv.indexOf(recipient) + 1).join(' ') || message;

  console.log(chalk.cyan(`\n📤 iMessage ${L('gönderiliyor...', 'sending...')}`));
  console.log(chalk.gray(`   ${L('Alıcı', 'Recipient')}: ${recipient}`));
  console.log(chalk.gray(`   ${L('Mesaj', 'Message')}: ${fullMessage.slice(0, 60)}${fullMessage.length > 60 ? '...' : ''}\n`));

  try {
    // imsg send komutu (v5.6.26: --to kullan, --recipient değil)
    const cmd = `${config.imessageCliPath} send --to "${recipient}" --text "${fullMessage.replace(/"/g, '\\"')}"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });

    console.log(chalk.green(L('✅ Mesaj gönderildi!', '✅ Message sent!')));
    if (output && output.trim()) {
      console.log(chalk.gray(output.trim()));
    }
    return { success: true, recipient, message: fullMessage };
  } catch (e) {
    console.log(chalk.red(L('❌ Mesaj gönderilemedi', '❌ Message could not be sent')));
    if (e.stderr) console.log(chalk.gray(e.stderr.toString()));
    else if (e.message) console.log(chalk.gray(e.message));
    return { success: false, error: e.message };
  }
}

async function connectImessage() {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red(L('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n', '\n❌ Setup not done. Run "natureco setup" first.\n')));
    process.exit(1);
  }

  if (process.platform !== 'darwin') {
    console.log(chalk.red(L('\n❌ iMessage sadece macOS\'te çalışır.\n', '\n❌ iMessage only works on macOS.\n')));
    console.log(chalk.gray(L('Mevcut platform:', 'Current platform:')), chalk.white(process.platform));
    console.log(chalk.gray(L('Diğer platformlar için SMS (Twilio) kullanılabilir.\n', 'For other platforms, SMS (Twilio) can be used.\n')));
    process.exit(1);
  }

  console.log(chalk.yellow(L('\n⏳ iMessage bağlantısı hazırlanıyor...\n', '\n⏳ Preparing iMessage connection...\n')));
  console.log(chalk.gray(L('Gereken: imsg bridge — https://github.com/mbilker/imsg\n', 'Required: imsg bridge — https://github.com/mbilker/imsg\n')));

  const defaults = {
    cliPath: config.imessageCliPath || '',
    service: config.imessageService || 'auto',
    dbPath: config.imessageDbPath || '~/Library/Messages/chat.db',
    dmPolicy: config.imessageDmPolicy || 'pairing',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'cliPath', message: L('imsg CLI yolu (boş = PATH):', 'imsg CLI path (empty = PATH):'), default: defaults.cliPath },
    { type: 'input', name: 'dbPath', message: L('iMessage veritabanı yolu:', 'iMessage database path:'), default: defaults.dbPath },
    { type: 'list', name: 'service', message: L('Servis:', 'Service:'), default: defaults.service, choices: [
      { name: L('Auto-detect (önerilen)', 'Auto-detect (recommended)'), value: 'auto' },
      { name: 'iMessage', value: 'imessage' },
      { name: 'SMS', value: 'sms' },
    ]},
    { type: 'list', name: 'dmPolicy', message: L('DM politikası:', 'DM policy:'), default: defaults.dmPolicy, choices: [
      { name: L('Pairing (önerilen)', 'Pairing (recommended)'), value: 'pairing' },
      { name: 'Allowlist', value: 'allowlist' },
      { name: 'Open', value: 'open' },
      { name: 'Disabled', value: 'disabled' },
    ]},
  ]);

  const botId = `imessage_${Date.now()}`;
  config.imessageCliPath = answers.cliPath.trim() || '';
  config.imessageDbPath = answers.dbPath.trim() || '~/Library/Messages/chat.db';
  config.imessageService = answers.service;
  config.imessageDmPolicy = answers.dmPolicy;
  config.imessageBotId = botId;
  saveConfig(config);

  console.log(chalk.green(L('\n✅ iMessage bağlantısı kaydedildi!\n', '\n✅ iMessage connection saved!\n')));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  if (config.imessageCliPath) console.log(chalk.cyan(L('CLI Yolu:', 'CLI Path:')), chalk.white(config.imessageCliPath));
  console.log(chalk.cyan(L('Servis:', 'Service:')), chalk.white(answers.service));
  console.log(chalk.gray(L('\nGateway ile başlatmak için: natureco gateway start\n', '\nTo start with the gateway: natureco gateway start\n')));
}

async function disconnectImessage() {
  const config = getConfig();
  if (!config.imessageBotId) {
    console.log(chalk.gray('\n⚠️  No iMessage connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: L('iMessage bağlantısını kaldırmak istediğinize emin misiniz?', 'Are you sure you want to remove the iMessage connection?'), default: false }
  ]);
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  delete config.imessageCliPath; delete config.imessageDbPath; delete config.imessageService;
  delete config.imessageDmPolicy; delete config.imessageBotId;
  saveConfig(config);
  console.log(chalk.green('\n✅ iMessage disconnected\n'));
}

async function statusImessage() {
  const config = getConfig();
  if (!config.imessageBotId) {
    console.log(chalk.gray('\n⚠️  iMessage not connected\n'));
    console.log(chalk.gray('Connect with: natureco imessage connect\n'));
    return;
  }
  console.log(chalk.green('\n✅ iMessage connected\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(config.imessageBotId));
  if (config.imessageCliPath) console.log(chalk.cyan(L('CLI Yolu:', 'CLI Path:')), chalk.white(config.imessageCliPath));
  console.log(chalk.cyan(L('Servis:', 'Service:')), chalk.white(config.imessageService || 'auto'));

  if (process.platform === 'darwin') {
    const imsgPath = findImsgBinary(config);
    console.log(chalk.cyan('imsg binary:'), chalk.white(imsgPath || L('Bulunamadı', 'Not found')));
    if (config.imessageDbPath) console.log(chalk.cyan(L('DB Yolu:', 'DB Path:')), chalk.white(config.imessageDbPath));
  } else {
    console.log(chalk.yellow(L('\n⚠️  iMessage sadece macOS\'te çalışır', '\n⚠️  iMessage only works on macOS')));
  }

  console.log(chalk.gray('\nDisconnect with: natureco imessage disconnect\n'));
}

async function probeImessage() {
  const config = getConfig();
  if (!config.imessageBotId) {
    console.log(chalk.red(L('\n❌ iMessage bağlantısı yapılmamış\n', '\n❌ iMessage connection not set up\n')));
    console.log(chalk.gray(L('Önce: natureco imessage connect\n', 'First: natureco imessage connect\n')));
    process.exit(1);
  }

  if (process.platform !== 'darwin') {
    console.log(chalk.red(L('\n❌ iMessage sadece macOS\'te kullanılabilir.\n', '\n❌ iMessage can only be used on macOS.\n')));
    process.exit(1);
  }

  console.log(chalk.yellow(L('\n⏳ iMessage problanıyor...\n', '\n⏳ Probing iMessage...\n')));

  const imsgPath = findImsgBinary(config);
  if (!imsgPath) {
    console.log(chalk.red(L('✗ imsg binary bulunamadı\n', '✗ imsg binary not found\n')));
    console.log(chalk.gray(L('Kurulum: brew install mbilker/imsg/imsg', 'Installation: brew install mbilker/imsg/imsg')));
    console.log(chalk.gray(L('Veya: https://github.com/mbilker/imsg\n', 'Or: https://github.com/mbilker/imsg\n')));
    process.exit(1);
  }
  console.log(chalk.green(`✓ imsg found: ${imsgPath}`));

  // Check DB
  const dbPath = (config.imessageDbPath || '~/Library/Messages/chat.db').replace(/^~/, require('os').homedir());
  if (fs.existsSync(dbPath)) {
    console.log(chalk.green(`✓ iMessage DB: ${dbPath}`));
  } else {
    console.log(chalk.yellow(`⚠️  iMessage DB ${L('bulunamadı', 'not found')}: ${dbPath}`));
  }

  // Try to send a test message (dry run)
  try {
    const result = execSync(`"${imsgPath}" --help 2>&1`, { encoding: 'utf-8', timeout: 5000 });
    console.log(chalk.gray(`\nimsg version: ${result.split('\n')[0]}`));
  } catch {
    console.log(chalk.yellow(L('⚠️  imsg çalıştırılamadı', '⚠️  imsg could not be run')));
  }

  console.log('');
}

function findImsgBinary(config) {
  if (config.imessageCliPath && fs.existsSync(config.imessageCliPath)) {
    return config.imessageCliPath;
  }
  try {
    const which = execSync('which imsg 2>/dev/null || echo ""', { encoding: 'utf-8', timeout: 5000 });
    const p = which.trim();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null;
}

module.exports = imessage;
