const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');

async function sms(action) {
  if (!action || action === 'connect') return connectSms();
  if (action === 'disconnect') return disconnectSms();
  if (action === 'status') return statusSms();
  if (action === 'probe') return probeSms();
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status, probe\n'));
  process.exit(1);
}

async function connectSms() {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }
  console.log(chalk.yellow('\n⏳ SMS (Twilio) bağlantısı hazırlanıyor...\n'));
  console.log(chalk.gray('Twilio hesabı gereklidir: https://twilio.com\n'));

  const defaults = {
    accountSid: config.smsAccountSid || '',
    authToken: config.smsAuthToken || '',
    fromNumber: config.smsFromNumber || '',
    webhookUrl: config.smsPublicWebhookUrl || '',
    dmPolicy: config.smsDmPolicy || 'allowlist',
    messagingServiceSid: config.smsMessagingServiceSid || '',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'accountSid', message: 'Twilio Account SID:', default: defaults.accountSid ? defaults.accountSid.slice(0, 10) + '...' : '', validate: v => v.trim() ? true : 'Gerekli' },
    { type: 'password', name: 'authToken', message: 'Twilio Auth Token:' },
    { type: 'input', name: 'fromNumber', message: 'Gönderen numara (E.164, +15551234567):', default: defaults.fromNumber, validate: v => v.trim() || defaults.messagingServiceSid ? true : 'Numara veya Messaging Service SID gerekli' },
    { type: 'input', name: 'messagingServiceSid', message: 'Messaging Service SID (opsiyonel):', default: defaults.messagingServiceSid },
    { type: 'input', name: 'webhookUrl', message: 'Genel webhook URL (ngrok vb., opsiyonel):', default: defaults.webhookUrl },
    { type: 'list', name: 'dmPolicy', message: 'DM politikası:', default: defaults.dmPolicy, choices: [
      { name: 'Allowlist (önerilen) — spam koruması', value: 'allowlist' },
      { name: 'Pairing — eşleşme kodu ile', value: 'pairing' },
      { name: 'Open — herkese açık', value: 'open' },
      { name: 'Disabled — devre dışı', value: 'disabled' },
    ]},
    { type: 'confirm', name: 'enableWebhook', message: 'Gelen SMS webhook\'u etkinleştirilsin mi?', default: config.smsEnableWebhook !== false },
  ]);

  const botId = `sms_${Date.now()}`;
  config.smsAccountSid = answers.accountSid.trim();
  config.smsAuthToken = answers.authToken.trim();
  config.smsFromNumber = answers.fromNumber.trim();
  config.smsMessagingServiceSid = answers.messagingServiceSid.trim() || '';
  config.smsPublicWebhookUrl = answers.webhookUrl.trim() || '';
  config.smsDmPolicy = answers.dmPolicy;
  config.smsEnableWebhook = answers.enableWebhook;
  config.smsBotId = botId;
  saveConfig(config);

  console.log(chalk.green('\n✅ SMS (Twilio) bağlantısı kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Account SID:'), chalk.white(answers.accountSid.slice(0, 20) + '...'));
  console.log(chalk.cyan('Numara:'), chalk.white(answers.fromNumber || '(Messaging Service)'));
  console.log(chalk.cyan('DM Politikası:'), chalk.white(answers.dmPolicy));

  if (answers.enableWebhook) {
    console.log(chalk.gray('\nTwilio Console\'da webhook URL\'si ayarlayın:'));
    if (answers.webhookUrl) {
      console.log(chalk.cyan(`  ${answers.webhookUrl}/webhooks/sms`));
    } else {
      console.log(chalk.gray('  (önce bir genel URL ayarlayın)'));
    }
  }
  console.log(chalk.gray('\nGateway ile başlatmak için: natureco gateway start\n'));
}

async function disconnectSms() {
  const config = getConfig();
  if (!config.smsBotId) {
    console.log(chalk.gray('\n⚠️  No SMS connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'SMS bağlantısını kaldırmak istediğinize emin misiniz?', default: false }
  ]);
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  delete config.smsAccountSid; delete config.smsAuthToken; delete config.smsFromNumber;
  delete config.smsMessagingServiceSid; delete config.smsPublicWebhookUrl;
  delete config.smsDmPolicy; delete config.smsEnableWebhook; delete config.smsBotId;
  saveConfig(config);
  console.log(chalk.green('\n✅ SMS disconnected\n'));
}

function statusSms() {
  const config = getConfig();
  if (!config.smsBotId) {
    console.log(chalk.gray('\n⚠️  SMS not connected\n'));
    console.log(chalk.gray('Connect with: natureco sms connect\n'));
    return;
  }
  console.log(chalk.green('\n✅ SMS (Twilio) connected\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(config.smsBotId));
  console.log(chalk.cyan('Account SID:'), chalk.white((config.smsAccountSid || '').slice(0, 20) + '...'));
  console.log(chalk.cyan('Numara:'), chalk.white(config.smsFromNumber || '(Messaging Service)'));
  console.log(chalk.cyan('DM Politikası:'), chalk.white(config.smsDmPolicy || 'allowlist'));
  console.log(chalk.cyan('Webhook:'), chalk.white(config.smsEnableWebhook !== false ? 'Aktif' : 'Devre Dışı'));
  console.log(chalk.gray('\nDisconnect with: natureco sms disconnect\n'));
}

async function probeSms() {
  const config = getConfig();
  if (!config.smsAccountSid || !config.smsAuthToken) {
    console.log(chalk.red('\n❌ SMS bağlantısı yapılmamış\n'));
    console.log(chalk.gray('Önce: natureco sms connect\n'));
    process.exit(1);
  }

  const base64Auth = Buffer.from(`${config.smsAccountSid}:${config.smsAuthToken}`).toString('base64');
  console.log(chalk.yellow('\n⏳ Twilio problanıyor...\n'));

  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + config.smsAccountSid + '.json', {
      headers: { 'Authorization': `Basic ${base64Auth}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(chalk.red(`✗ Twilio API Hatası: HTTP ${res.status}\n`));
      if (res.status === 401) console.log(chalk.gray('  Account SID veya Auth Token hatalı.\n'));
      process.exit(1);
    }

    const account = await res.json();
    console.log(chalk.green('✓ Twilio API Bağlantısı Başarılı\n'));
    console.log(chalk.cyan('Hesap Adı:'), chalk.white(account.friendly_name));
    console.log(chalk.cyan('Status:'), chalk.white(account.status));
    console.log(chalk.cyan('Type:'), chalk.white(account.type));

    // Check balance
    if (account.subresource_uris?.balance) {
      try {
        const balRes = await fetch('https://api.twilio.com' + account.subresource_uris.balance, {
          headers: { 'Authorization': `Basic ${base64Auth}` },
          signal: AbortSignal.timeout(5000),
        });
        if (balRes.ok) {
          const balance = await balRes.json();
          console.log(chalk.cyan('Bakiye:'), chalk.white(`${balance.balance} ${balance.currency}`));
        }
      } catch {}
    }

    // Check phone number
    if (config.smsFromNumber) {
      console.log(chalk.gray(`\nGönderen numara: ${config.smsFromNumber}`));
    }

    console.log('');

  } catch (err) {
    console.log(chalk.red(`\n✗ Probe hatası: ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = sms;
