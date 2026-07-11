const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
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
    console.log(chalk.red(L('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n', '\n❌ Setup not done. Run "natureco setup" first.\n')));
    process.exit(1);
  }
  console.log(chalk.yellow(L('\n⏳ SMS (Twilio) bağlantısı hazırlanıyor...\n', '\n⏳ Preparing SMS (Twilio) connection...\n')));
  console.log(chalk.gray(L('Twilio hesabı gereklidir: https://twilio.com\n', 'A Twilio account is required: https://twilio.com\n')));

  const defaults = {
    accountSid: config.smsAccountSid || '',
    authToken: config.smsAuthToken || '',
    fromNumber: config.smsFromNumber || '',
    webhookUrl: config.smsPublicWebhookUrl || '',
    dmPolicy: config.smsDmPolicy || 'allowlist',
    messagingServiceSid: config.smsMessagingServiceSid || '',
  };

  const answers = await inquirer.prompt([
    { type: 'input', name: 'accountSid', message: 'Twilio Account SID:', default: defaults.accountSid ? defaults.accountSid.slice(0, 10) + '...' : '', validate: v => v.trim() ? true : L('Gerekli', 'Required') },
    { type: 'password', name: 'authToken', message: 'Twilio Auth Token:' },
    { type: 'input', name: 'fromNumber', message: L('Gönderen numara (E.164, +15551234567):', 'Sender number (E.164, +15551234567):'), default: defaults.fromNumber, validate: v => v.trim() || defaults.messagingServiceSid ? true : L('Numara veya Messaging Service SID gerekli', 'Number or Messaging Service SID required') },
    { type: 'input', name: 'messagingServiceSid', message: L('Messaging Service SID (opsiyonel):', 'Messaging Service SID (optional):'), default: defaults.messagingServiceSid },
    { type: 'input', name: 'webhookUrl', message: L('Genel webhook URL (ngrok vb., opsiyonel):', 'Public webhook URL (ngrok etc., optional):'), default: defaults.webhookUrl },
    { type: 'list', name: 'dmPolicy', message: L('DM politikası:', 'DM policy:'), default: defaults.dmPolicy, choices: [
      { name: L('Allowlist (önerilen) — spam koruması', 'Allowlist (recommended) — spam protection'), value: 'allowlist' },
      { name: L('Pairing — eşleşme kodu ile', 'Pairing — with a match code'), value: 'pairing' },
      { name: L('Open — herkese açık', 'Open — public'), value: 'open' },
      { name: L('Disabled — devre dışı', 'Disabled — off'), value: 'disabled' },
    ]},
    { type: 'confirm', name: 'enableWebhook', message: L('Gelen SMS webhook\'u etkinleştirilsin mi?', 'Enable inbound SMS webhook?'), default: config.smsEnableWebhook !== false },
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

  console.log(chalk.green(L('\n✅ SMS (Twilio) bağlantısı kaydedildi!\n', '\n✅ SMS (Twilio) connection saved!\n')));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('Account SID:'), chalk.white(answers.accountSid.slice(0, 20) + '...'));
  console.log(chalk.cyan(L('Numara:', 'Number:')), chalk.white(answers.fromNumber || '(Messaging Service)'));
  console.log(chalk.cyan(L('DM Politikası:', 'DM Policy:')), chalk.white(answers.dmPolicy));

  if (answers.enableWebhook) {
    console.log(chalk.gray(L('\nTwilio Console\'da webhook URL\'si ayarlayın:', '\nSet the webhook URL in the Twilio Console:')));
    if (answers.webhookUrl) {
      console.log(chalk.cyan(`  ${answers.webhookUrl}/webhooks/sms`));
    } else {
      console.log(chalk.gray(L('  (önce bir genel URL ayarlayın)', '  (set a public URL first)')));
    }
  }
  console.log(chalk.gray(L('\nGateway ile başlatmak için: natureco gateway start\n', '\nTo start with the gateway: natureco gateway start\n')));
}

async function disconnectSms() {
  const config = getConfig();
  if (!config.smsBotId) {
    console.log(chalk.gray('\n⚠️  No SMS connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: L('SMS bağlantısını kaldırmak istediğinize emin misiniz?', 'Are you sure you want to remove the SMS connection?'), default: false }
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
  console.log(chalk.cyan(L('Numara:', 'Number:')), chalk.white(config.smsFromNumber || '(Messaging Service)'));
  console.log(chalk.cyan(L('DM Politikası:', 'DM Policy:')), chalk.white(config.smsDmPolicy || 'allowlist'));
  console.log(chalk.cyan('Webhook:'), chalk.white(config.smsEnableWebhook !== false ? L('Aktif', 'Active') : L('Devre Dışı', 'Disabled')));
  console.log(chalk.gray('\nDisconnect with: natureco sms disconnect\n'));
}

async function probeSms() {
  const config = getConfig();
  if (!config.smsAccountSid || !config.smsAuthToken) {
    console.log(chalk.red(L('\n❌ SMS bağlantısı yapılmamış\n', '\n❌ SMS connection not set up\n')));
    console.log(chalk.gray(L('Önce: natureco sms connect\n', 'First: natureco sms connect\n')));
    process.exit(1);
  }

  const base64Auth = Buffer.from(`${config.smsAccountSid}:${config.smsAuthToken}`).toString('base64');
  console.log(chalk.yellow(L('\n⏳ Twilio problanıyor...\n', '\n⏳ Probing Twilio...\n')));

  try {
    const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + config.smsAccountSid + '.json', {
      headers: { 'Authorization': `Basic ${base64Auth}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(chalk.red(`✗ ${L('Twilio API Hatası', 'Twilio API Error')}: HTTP ${res.status}\n`));
      if (res.status === 401) console.log(chalk.gray(L('  Account SID veya Auth Token hatalı.\n', '  Account SID or Auth Token is incorrect.\n')));
      process.exit(1);
    }

    const account = await res.json();
    console.log(chalk.green(L('✓ Twilio API Bağlantısı Başarılı\n', '✓ Twilio API Connection Successful\n')));
    console.log(chalk.cyan(L('Hesap Adı:', 'Account Name:')), chalk.white(account.friendly_name));
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
          console.log(chalk.cyan(L('Bakiye:', 'Balance:')), chalk.white(`${balance.balance} ${balance.currency}`));
        }
      } catch {}
    }

    // Check phone number
    if (config.smsFromNumber) {
      console.log(chalk.gray(`\n${L('Gönderen numara', 'Sender number')}: ${config.smsFromNumber}`));
    }

    console.log('');

  } catch (err) {
    console.log(chalk.red(`\n✗ ${L('Probe hatası', 'Probe error')}: ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = sms;
