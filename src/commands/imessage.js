const chalk = require('chalk');
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
    console.log(chalk.red('\n❌ iMessage bağlı değil.\n'));
    process.exit(1);
  }
  if (!number) {
    console.log(chalk.red('\n❌ Numara belirtilmedi\n'));
    console.log(chalk.gray('Kullanım: natureco imessage allow <numara|email>\n'));
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

  console.log(chalk.green(`\n✅ İzin verildi: ${number}`));
  console.log(chalk.gray(`Toplam izinli: ${allowList.length}`));
}

async function disallowNumber(number) {
  const config = getConfig();
  if (!number) {
    console.log(chalk.red('\n❌ Numara belirtilmedi\n'));
    process.exit(1);
  }

  const allowList = config.imessageAllowedNumbers || [];
  const newList = allowList.filter(n => n !== number);
  config.imessageAllowedNumbers = newList;
  saveConfig(config);

  console.log(chalk.green(`\n✅ İzin kaldırıldı: ${number}`));
}

async function sendMessage(recipient, message) {
  const config = getConfig();

  if (!config.imessageCliPath) {
    console.log(chalk.red('\n❌ iMessage bağlı değil. Önce "natureco imessage connect" çalıştırın.\n'));
    process.exit(1);
  }

  if (!recipient) {
    console.log(chalk.red('\n❌ Alıcı belirtilmedi\n'));
    console.log(chalk.gray('Kullanım: natureco imessage send <numara|email> <mesaj>\n'));
    console.log(chalk.gray('Örnek:   natureco imessage send +905551234567 Merhaba!\n'));
    process.exit(1);
  }

  if (!message) {
    console.log(chalk.red('\n❌ Mesaj belirtilmedi\n'));
    process.exit(1);
  }

  // Birden fazla kelimeyi birleştir
  const fullMessage = process.argv.slice(process.argv.indexOf(recipient) + 1).join(' ') || message;

  console.log(chalk.cyan(`\n📤 iMessage gönderiliyor...`));
  console.log(chalk.gray(`   Alıcı: ${recipient}`));
  console.log(chalk.gray(`   Mesaj: ${fullMessage.slice(0, 60)}${fullMessage.length > 60 ? '...' : ''}\n`));

  try {
    // imsg send komutu (v5.6.26: --to kullan, --recipient değil)
    const cmd = `${config.imessageCliPath} send --to "${recipient}" --text "${fullMessage.replace(/"/g, '\\"')}"`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });

    console.log(chalk.green('✅ Mesaj gönderildi!'));
    if (output && output.trim()) {
      console.log(chalk.gray(output.trim()));
    }
    return { success: true, recipient, message: fullMessage };
  } catch (e) {
    console.log(chalk.red('❌ Mesaj gönderilemedi'));
    if (e.stderr) console.log(chalk.gray(e.stderr.toString()));
    else if (e.message) console.log(chalk.gray(e.message));
    return { success: false, error: e.message };
  }
}

async function connectImessage() {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }

  if (process.platform !== 'darwin') {
    console.log(chalk.red('\n❌ iMessage sadece macOS\'te çalışır.\n'));
    console.log(chalk.gray('Mevcut platform:'), chalk.white(process.platform));
    console.log(chalk.gray('Diğer platformlar için SMS (Twilio) kullanılabilir.\n'));
    process.exit(1);
  }

  console.log(chalk.yellow('\n⏳ iMessage bağlantısı hazırlanıyor...\n'));
  console.log(chalk.gray('Gereken: imsg bridge — https://github.com/mbilker/imsg\n'));

  const defaults = {
    cliPath: config.imessageCliPath || '',
    service: config.imessageService || 'auto',
    dbPath: config.imessageDbPath || '~/Library/Messages/chat.db',
    dmPolicy: config.imessageDmPolicy || 'pairing',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'cliPath', message: 'imsg CLI yolu (boş = PATH):', default: defaults.cliPath },
    { type: 'input', name: 'dbPath', message: 'iMessage veritabanı yolu:', default: defaults.dbPath },
    { type: 'list', name: 'service', message: 'Servis:', default: defaults.service, choices: [
      { name: 'Auto-detect (önerilen)', value: 'auto' },
      { name: 'iMessage', value: 'imessage' },
      { name: 'SMS', value: 'sms' },
    ]},
    { type: 'list', name: 'dmPolicy', message: 'DM politikası:', default: defaults.dmPolicy, choices: [
      { name: 'Pairing (önerilen)', value: 'pairing' },
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

  console.log(chalk.green('\n✅ iMessage bağlantısı kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  if (config.imessageCliPath) console.log(chalk.cyan('CLI Yolu:'), chalk.white(config.imessageCliPath));
  console.log(chalk.cyan('Servis:'), chalk.white(answers.service));
  console.log(chalk.gray('\nGateway ile başlatmak için: natureco gateway start\n'));
}

async function disconnectImessage() {
  const config = getConfig();
  if (!config.imessageBotId) {
    console.log(chalk.gray('\n⚠️  No iMessage connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'iMessage bağlantısını kaldırmak istediğinize emin misiniz?', default: false }
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
  if (config.imessageCliPath) console.log(chalk.cyan('CLI Yolu:'), chalk.white(config.imessageCliPath));
  console.log(chalk.cyan('Servis:'), chalk.white(config.imessageService || 'auto'));

  if (process.platform === 'darwin') {
    const imsgPath = findImsgBinary(config);
    console.log(chalk.cyan('imsg binary:'), chalk.white(imsgPath || 'Bulunamadı'));
    if (config.imessageDbPath) console.log(chalk.cyan('DB Yolu:'), chalk.white(config.imessageDbPath));
  } else {
    console.log(chalk.yellow('\n⚠️  iMessage sadece macOS\'te çalışır'));
  }

  console.log(chalk.gray('\nDisconnect with: natureco imessage disconnect\n'));
}

async function probeImessage() {
  const config = getConfig();
  if (!config.imessageBotId) {
    console.log(chalk.red('\n❌ iMessage bağlantısı yapılmamış\n'));
    console.log(chalk.gray('Önce: natureco imessage connect\n'));
    process.exit(1);
  }

  if (process.platform !== 'darwin') {
    console.log(chalk.red('\n❌ iMessage sadece macOS\'te kullanılabilir.\n'));
    process.exit(1);
  }

  console.log(chalk.yellow('\n⏳ iMessage problanıyor...\n'));

  const imsgPath = findImsgBinary(config);
  if (!imsgPath) {
    console.log(chalk.red('✗ imsg binary bulunamadı\n'));
    console.log(chalk.gray('Kurulum: brew install mbilker/imsg/imsg'));
    console.log(chalk.gray('Veya: https://github.com/mbilker/imsg\n'));
    process.exit(1);
  }
  console.log(chalk.green(`✓ imsg found: ${imsgPath}`));

  // Check DB
  const dbPath = (config.imessageDbPath || '~/Library/Messages/chat.db').replace(/^~/, require('os').homedir());
  if (fs.existsSync(dbPath)) {
    console.log(chalk.green(`✓ iMessage DB: ${dbPath}`));
  } else {
    console.log(chalk.yellow(`⚠️  iMessage DB bulunamadı: ${dbPath}`));
  }

  // Try to send a test message (dry run)
  try {
    const result = execSync(`"${imsgPath}" --help 2>&1`, { encoding: 'utf-8', timeout: 5000 });
    console.log(chalk.gray(`\nimsg version: ${result.split('\n')[0]}`));
  } catch {
    console.log(chalk.yellow('⚠️  imsg çalıştırılamadı'));
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
