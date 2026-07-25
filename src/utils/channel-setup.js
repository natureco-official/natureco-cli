/**
 * Generic connect / disconnect / status / probe for a messaging channel.
 *
 * The ten existing channels each carry their own ~150-line copy of the same
 * four functions, differing only in which config keys they read and which
 * endpoint they probe. Rather than add four more copies, new channels declare a
 * descriptor and get the behaviour from here.
 *
 * A descriptor looks like:
 *   {
 *     id: 'matrix',                       // config key prefix + channel name
 *     label: 'Matrix',
 *     instructions: () => [ '…', '…' ],   // how to obtain credentials
 *     fields: [                           // prompted in order, saved as <id><Key>
 *       { key: 'homeserver', message: () => '…', required: true, normalize: v => … },
 *       { key: 'token', message: () => 'Access token:', required: true, secret: true },
 *     ],
 *     dmPolicy: true,                     // include the standard DM policy question
 *     probe: async (values) => ({ ok, lines: [[label, value], …], hint? }),
 *     inbound: 'webhook' | 'poll',        // shown in status so the user knows what to expect
 *     webhookPath: '/webhooks/matrix',    // when inbound === 'webhook'
 *   }
 */

const chalk = require('chalk');
const inquirer = require('./inquirer-wrapper');
const { getConfig, saveConfig } = require('./config');
const { getLang: _gl } = require('./i18n');

const L = (tr, en) => (_gl() === 'en' ? en : tr);

function maskSecret(value) {
  const token = String(value || '');
  return token.length > 8 ? `${token.slice(0, 3)}****${token.slice(-3)}` : '****';
}

function configKey(id, field) {
  return id + field.charAt(0).toUpperCase() + field.slice(1);
}

function botIdKey(id) {
  return `${id}BotId`;
}

/** Every config key this channel owns — used by disconnect and `channels logout`. */
function ownedKeys(descriptor) {
  const keys = descriptor.fields.map(f => configKey(descriptor.id, f.key));
  keys.push(botIdKey(descriptor.id));
  if (descriptor.dmPolicy) keys.push(`${descriptor.id}DmPolicy`);
  keys.push(`${descriptor.id}AllowedUsers`);
  return keys;
}

const DM_POLICY_CHOICES = () => [
  { name: L('Pairing (önerilen)', 'Pairing (recommended)'), value: 'pairing' },
  { name: 'Allowlist', value: 'allowlist' },
  { name: 'Open', value: 'open' },
  { name: 'Disabled', value: 'disabled' },
];

async function connect(descriptor) {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red(L(
      '\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n',
      '\n❌ Setup not done. Run "natureco setup" first.\n',
    )));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.yellow(`\n⏳ ${L(`${descriptor.label} bağlantısı hazırlanıyor...`, `Preparing the ${descriptor.label} connection...`)}\n`));
  for (const line of descriptor.instructions()) console.log(chalk.gray(line));
  console.log('');

  const questions = descriptor.fields.map(field => ({
    type: field.secret ? 'password' : 'input',
    name: field.key,
    message: field.message(),
    default: field.secret ? undefined : (config[configKey(descriptor.id, field.key)] || field.default || ''),
    validate: value => (field.required && !String(value || '').trim() ? L('Gerekli', 'Required') : true),
  }));

  if (descriptor.dmPolicy) {
    questions.push({
      type: 'list',
      name: '__dmPolicy',
      message: L('DM politikası:', 'DM policy:'),
      default: config[`${descriptor.id}DmPolicy`] || 'pairing',
      choices: DM_POLICY_CHOICES(),
    });
  }

  const answers = await inquirer.prompt(questions);

  const values = {};
  for (const field of descriptor.fields) {
    let value = String(answers[field.key] ?? '').trim();
    // A blank answer on a secret field keeps whatever was already stored, so
    // re-running connect to change one setting does not wipe the token.
    if (!value && field.secret) value = config[configKey(descriptor.id, field.key)] || '';
    if (field.normalize) value = field.normalize(value);
    values[field.key] = value;
    config[configKey(descriptor.id, field.key)] = value;
  }
  if (descriptor.dmPolicy) config[`${descriptor.id}DmPolicy`] = answers.__dmPolicy;

  const botId = config[botIdKey(descriptor.id)] || `${descriptor.id}_${Date.now()}`;
  config[botIdKey(descriptor.id)] = botId;
  saveConfig(config);

  console.log(chalk.green(`\n✅ ${L(`${descriptor.label} bağlantısı kaydedildi!`, `${descriptor.label} connection saved!`)}\n`));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  for (const field of descriptor.fields) {
    const shown = field.secret ? maskSecret(values[field.key]) : values[field.key];
    console.log(chalk.cyan(field.label ? field.label() + ':' : field.key + ':'), chalk.white(shown || '—'));
  }

  if (descriptor.inbound === 'webhook') {
    console.log(chalk.yellow(`\n⚠ ${L('Gelen mesajlar için webhook gerekir', 'Inbound messages need a webhook')}:`));
    console.log(chalk.gray(`  ${L('Gateway yolu', 'Gateway path')}: POST ${descriptor.webhookPath}`));
    console.log(chalk.gray(L(
      `  Bu yolu herkese açık HTTPS bir adres üzerinden ${descriptor.label} tarafına tanıtın.`,
      `  Expose this path over a public HTTPS address and register it with ${descriptor.label}.`,
    )));
  }

  console.log(chalk.gray(`\n${L('Doğrulamak için', 'To verify')}: natureco ${descriptor.id} probe`));
  console.log(chalk.gray(`${L('Başlatmak için', 'To start')}: natureco gateway start\n`));
}

async function disconnect(descriptor) {
  const config = getConfig();
  if (!config[botIdKey(descriptor.id)]) {
    console.log(chalk.gray(`\n⚠️  ${L(`${descriptor.label} bağlantısı bulunamadı`, `No ${descriptor.label} connection found`)}\n`));
    return;
  }
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: L(
      `${descriptor.label} bağlantısını kaldırmak istediğinize emin misiniz?`,
      `Are you sure you want to remove the ${descriptor.label} connection?`,
    ),
    default: false,
  }]);
  if (!confirm) {
    console.log(chalk.gray(`\n${L('İptal edildi', 'Cancelled')}\n`));
    return;
  }
  for (const key of ownedKeys(descriptor)) delete config[key];
  saveConfig(config);
  console.log(chalk.green(`\n✅ ${descriptor.label} disconnected\n`));
}

function status(descriptor) {
  const config = getConfig();
  if (!config[botIdKey(descriptor.id)]) {
    console.log(chalk.gray(`\n⚠️  ${L(`${descriptor.label} bağlı değil`, `${descriptor.label} not connected`)}\n`));
    console.log(chalk.gray(`${L('Bağlanmak için', 'Connect with')}: natureco ${descriptor.id} connect\n`));
    return;
  }
  console.log(chalk.green(`\n✅ ${L(`${descriptor.label} bağlı`, `${descriptor.label} connected`)}\n`));
  console.log(chalk.cyan('Bot ID:'), chalk.white(config[botIdKey(descriptor.id)]));
  for (const field of descriptor.fields) {
    const value = config[configKey(descriptor.id, field.key)];
    const shown = field.secret ? maskSecret(value) : (value || '—');
    console.log(chalk.cyan((field.label ? field.label() : field.key) + ':'), chalk.white(shown));
  }
  if (descriptor.dmPolicy) {
    console.log(chalk.cyan(L('DM Politikası:', 'DM Policy:')), chalk.white(config[`${descriptor.id}DmPolicy`] || 'pairing'));
  }
  console.log(chalk.cyan(L('Gelen mesaj:', 'Inbound:')), chalk.white(
    descriptor.inbound === 'webhook'
      ? `webhook (POST ${descriptor.webhookPath})`
      : L('sunucu yoklaması', 'server polling'),
  ));
  console.log(chalk.gray(`\n${L('Doğrulamak için', 'To verify')}: natureco ${descriptor.id} probe`));
  console.log(chalk.gray(`${L('Kaldırmak için', 'Disconnect with')}: natureco ${descriptor.id} disconnect\n`));
}

async function probe(descriptor) {
  const config = getConfig();
  const missing = descriptor.fields
    .filter(f => f.required && !config[configKey(descriptor.id, f.key)])
    .map(f => (f.label ? f.label() : f.key));
  if (missing.length) {
    console.log(chalk.red(`\n❌ ${L(`${descriptor.label} bağlantısı eksik`, `${descriptor.label} connection incomplete`)}: ${missing.join(', ')}\n`));
    console.log(chalk.gray(`${L('Önce', 'First')}: natureco ${descriptor.id} connect\n`));
    process.exitCode = 1;
    return;
  }

  const values = {};
  for (const field of descriptor.fields) values[field.key] = config[configKey(descriptor.id, field.key)];

  console.log(chalk.yellow(`\n⏳ ${L('Problanıyor', 'Probing')}: ${descriptor.label}\n`));
  let result;
  try {
    result = await descriptor.probe(values, config);
  } catch (error) {
    console.log(chalk.red(`✗ ${L('Probe hatası', 'Probe error')}: ${error.message}\n`));
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(error.message)) {
      console.log(chalk.gray(L('Sunucuya erişilemiyor. Adresi kontrol edin.\n', 'Cannot reach the server. Check the address.\n')));
    }
    process.exitCode = 1;
    return;
  }

  if (!result.ok) {
    console.log(chalk.red(`✗ ${result.error || L('Doğrulama başarısız', 'Verification failed')}`));
    if (result.hint) console.log(chalk.gray(`  ${result.hint}`));
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log(chalk.green(`✓ ${L('Bağlantı doğrulandı', 'Connection verified')}\n`));
  for (const [label, value] of result.lines || []) {
    console.log(chalk.cyan(label + ':'), chalk.white(String(value)));
  }
  if (result.hint) console.log(chalk.gray(`\n${result.hint}`));
  console.log('');
}

/**
 * Turn a descriptor into the `natureco <id> <action>` command function.
 */
function createChannelCommand(descriptor) {
  return async function channelCommand(action) {
    if (!action || action === 'connect') return connect(descriptor);
    if (action === 'disconnect') return disconnect(descriptor);
    if (action === 'status') return status(descriptor);
    if (action === 'probe') return probe(descriptor);
    console.log(chalk.red(`\n❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
    console.log(chalk.gray(`Usage: natureco ${descriptor.id} [connect|disconnect|status|probe]\n`));
    process.exitCode = 1;
  };
}

module.exports = {
  createChannelCommand,
  ownedKeys,
  configKey,
  botIdKey,
  maskSecret,
  _actions: { connect, disconnect, status, probe },
};
