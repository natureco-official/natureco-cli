/**
 * natureco naturehub — NatureCo Bot API iletişimi
 *
 * natureco.me/api/v1/bots endpoint'lerini kullanır.
 * Kullanım:
 *   natureco naturehub post <text>         Bota mesaj gönder
 *   natureco naturehub list                Botları listele
 *   natureco naturehub info [bot_id]       Bot detayı
 *   natureco naturehub config              Ayarları göster
 *
 * API: https://natureco.me/api/v1/bots
 */

const chalk = require('chalk');
const https = require('https');
const { URL } = require('url');
const audit = require('../utils/audit');

const API_BASE = 'https://api.natureco.me';
const API_PREFIX = '/api/v1';
const CONFIG_KEY = 'naturehub';

function getApiKey() {
  try {
    const { getConfig } = require('../utils/config');
    const cfg = getConfig();
    return cfg?.apiKey || null;
  } catch { return null; }
}

function getBotId() {
  try {
    const { getConfig } = require('../utils/config');
    const cfg = getConfig();
    return cfg?.naturecoBotId || null;
  } catch { return null; }
}

async function apiCall(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_PREFIX + path, API_BASE);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'natureco-cli/5.20',
        ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      timeout: 10000,
    };
    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function cmdPost(args) {
  const text = args.join(' ').trim();
  if (!text) {
    console.log(chalk.red('\n  Kullanım: natureco naturehub post "<mesaj>"\n'));
    return;
  }

  const token = getApiKey();
  if (!token) {
    console.log(chalk.yellow('\n  ⚠️  API key tanımlı değil. Önce `natureco login` ile giriş yapın.\n'));
    saveLocal(text);
    return;
  }

  const botId = getBotId();
  if (!botId) {
    console.log(chalk.yellow('\n  ⚠️  Bot ID tanımlı değil. `natureco naturehub list` ile botlarınızı görün.\n'));
    console.log(chalk.gray('  Ayarlamak için: natureco config set naturecoBotId <bot_id>\n'));
    saveLocal(text);
    return;
  }

  console.log(chalk.cyan(`\n  📤 Bota mesaj gönderiliyor (${botId})...\n`));
  console.log(chalk.gray(`  "${text.slice(0, 200)}"\n`));

  try {
    const result = await apiCall(`/bots/${botId}/messages`, {
      method: 'POST',
      token,
      body: { message: text, user_id: 'cli' },
    });
    console.log(chalk.green('  ✓ Gönderildi!\n'));
    if (result.reply) console.log(chalk.cyan(`  💬 Bot: ${result.reply}\n`));
    audit.log(audit.ACTIONS.INFO, { source: 'naturehub', action: 'post', botId });
  } catch (e) {
    console.log(chalk.red(`  ✗ Hata: ${e.message}\n`));
    saveLocal(text);
  }
}

function saveLocal(text) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const file = path.join(os.homedir(), '.natureco', 'naturehub-pending.jsonl');
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), text }) + '\n');
  console.log(chalk.gray(`  Kayıt: ${file}\n`));
}

async function cmdList() {
  const token = getApiKey();
  if (!token) {
    console.log(chalk.yellow('\n  ⚠️  API key tanımlı değil.\n'));
    return;
  }

  console.log(chalk.cyan('\n  🤖 Botlarınız\n'));

  try {
    const result = await apiCall('/bots', { method: 'GET', token });
    const bots = Array.isArray(result) ? result : (result.bots || result.data || []);
    if (bots.length === 0) {
      console.log(chalk.gray('  Henüz botunuz yok.\n'));
      return;
    }
    for (const b of bots) {
      console.log(`  ${chalk.cyan('●')} ${b.name || b.id} ${chalk.gray(`(${b.id})`)}`);
      if (b.description) console.log(`    ${chalk.gray(b.description)}`);
      console.log('');
    }
    console.log(chalk.gray('  Bot ID ayarlamak için: natureco config set naturecoBotId <id>\n'));
  } catch (e) {
    console.log(chalk.red(`  ✗ Hata: ${e.message}\n`));
  }
}

async function cmdInfo(botId) {
  const token = getApiKey();
  if (!token) {
    console.log(chalk.yellow('\n  ⚠️  API key tanımlı değil.\n'));
    return;
  }

  const id = botId || getBotId();
  if (!id) {
    console.log(chalk.yellow('\n  Bot ID gerekli: natureco naturehub info <bot_id>\n'));
    return;
  }

  console.log(chalk.cyan(`\n  🤖 Bot: ${id}\n`));
  try {
    const result = await apiCall(`/bots/${id}`, { method: 'GET', token });
    console.log(`  ${chalk.bold('ID:')}          ${result.id}`);
    console.log(`  ${chalk.bold('İsim:')}        ${result.name || '-'}`);
    console.log(`  ${chalk.bold('Açıklama:')}     ${result.description || '-'}`);
    console.log(`  ${chalk.bold('Durum:')}        ${result.status || 'active'}`);
    console.log('');
  } catch (e) {
    console.log(chalk.red(`  ✗ Hata: ${e.message}\n`));
  }
}

async function cmdConfig() {
  const { getConfig } = require('../utils/config');
  const cfg = getConfig();
  console.log(chalk.cyan('\n  ⚙️  NatureCo API Ayarları\n'));
  console.log(chalk.gray('  API Key: ') + (cfg.apiKey ? chalk.green('✓ ayarlı') : chalk.yellow('yok')));
  console.log(chalk.gray('  Bot ID:  ') + (cfg.naturecoBotId ? chalk.green(cfg.naturecoBotId) : chalk.yellow('ayarlanmamış')));
  console.log(chalk.gray('\n  Giriş:    ') + chalk.cyan('natureco login'));
  console.log(chalk.gray('  Bot ID:   ') + chalk.cyan('natureco config set naturecoBotId <id>'));
  console.log(chalk.gray('  Botlar:   ') + chalk.cyan('natureco naturehub list'));
  console.log('');
}

async function naturehub(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow('\n  Kullanım:'));
    console.log(chalk.gray('    natureco naturehub post "<mesaj>"    Bota mesaj gönder'));
    console.log(chalk.gray('    natureco naturehub list              Botları listele'));
    console.log(chalk.gray('    natureco naturehub info [bot_id]     Bot detayı'));
    console.log(chalk.gray('    natureco naturehub config            Ayarlar'));
    console.log('');
    return;
  }
  if (action === 'post') return cmdPost(params);
  if (action === 'list') return cmdList();
  if (action === 'info') return cmdInfo(params[0]);
  if (action === 'config') return cmdConfig();
  console.log(chalk.red(`\n  Bilinmeyen action: ${action}\n`));
}

module.exports = naturehub;
