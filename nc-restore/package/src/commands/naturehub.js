/**
 * natureco naturehub — Nature Hub'a içerik yayınlama (Phase 6)
 *
 * natureco.me'nin topluluk akışına CLI'dan içerik gönder.
 * Kullanım:
 *   natureco naturehub post <text>      Yeni gönderi
 *   natureco naturehub list             Son gönderiler
 *   natureco naturehub trending         Trend olan konular
 *   natureco naturehub config           Ayarları göster
 *
 * API endpoint: api.natureco.me/naturehub/* (placeholder, gerçek API Parton sağlayacak)
 */

const chalk = require('chalk');
const https = require('https');
const { URL } = require('url');
const audit = require('../utils/audit');

const API_BASE = 'https://api.natureco.me';
const CONFIG_KEY = 'naturehub';

async function apiCall(path, options = {}) {
  // Geliştirme aşamasında placeholder — gerçek API hazır olunca kullanılacak
  // Şimdilik simüle edelim ve kullanıcıya rehberlik edelim
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'natureco-cli/3.5',
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

async function getToken() {
  const { getConfig } = require('../utils/config');
  const cfg = getConfig();
  return cfg?.naturehubToken || cfg?.apiKey || null;
}

async function cmdPost(args) {
  const text = args.join(' ').trim();
  if (!text) {
    console.log(chalk.red('\n  Kullanım: natureco naturehub post "<mesaj>"\n'));
    return;
  }
  if (text.length > 500) {
    console.log(chalk.yellow('\n  ⚠️  Mesaj 500 karakteri aşıyor. Kısaltılacak.\n'));
  }
  const shortText = text.slice(0, 500);

  console.log(chalk.cyan('\n  📤 Nature Hub\'a gönderiliyor...\n'));
  console.log(chalk.gray(`  "${shortText}"\n`));

  const token = await getToken();
  if (!token) {
    console.log(chalk.yellow('  ⚠️  Nature Hub token tanımlı değil.\n'));
    console.log(chalk.gray('  Ayarlamak için: ') + chalk.cyan('natureco config set naturehubToken <token>'));
    console.log(chalk.gray('  Veya genel API key: ') + chalk.cyan('natureco login'));
    console.log('');
    console.log(chalk.gray('  Şimdilik yerel olarak kaydedildi.\n'));
    saveLocal(shortText);
    audit.log(audit.ACTIONS.INFO, { source: 'naturehub', action: 'post', local: true });
    return;
  }

  try {
    const result = await apiCall('/naturehub/posts', {
      method: 'POST',
      token,
      body: { text: shortText, source: 'cli' },
    });
    console.log(chalk.green('  ✓ Gönderildi!\n'));
    if (result.url) console.log(chalk.cyan(`  🔗 ${result.url}\n`));
    audit.log(audit.ACTIONS.INFO, { source: 'naturehub', action: 'post', url: result.url });
  } catch (e) {
    console.log(chalk.yellow(`  ⚠️  API henüz hazır değil: ${e.message}`));
    console.log(chalk.gray('  Yerel olarak kaydedildi.\n'));
    saveLocal(shortText);
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
  console.log(chalk.cyan('\n  🌍 Nature Hub — Son Gönderiler\n'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.gray('\n  Bu özellik api.natureco.me hazır olunca tam çalışacak.\n'));
  console.log(chalk.gray('  Şimdilik tarayıcıdan ziyaret edin: ') + chalk.cyan('https://natureco.me/hub\n'));
}

async function cmdTrending() {
  console.log(chalk.cyan('\n  🔥 Trend Konular\n'));
  console.log(chalk.gray('  ' + '─'.repeat(50)));
  console.log(chalk.gray('\n  Bu özellik api.natureco.me hazır olunca tam çalışacak.\n'));
}

async function cmdConfig() {
  const { getConfig } = require('../utils/config');
  const cfg = getConfig();
  console.log(chalk.cyan('\n  ⚙️  Nature Hub Ayarları\n'));
  console.log(chalk.gray('  Token: ') + (cfg.naturehubToken ? chalk.green('✓ ayarlı') : chalk.yellow('yok')));
  console.log(chalk.gray('\n  Ayarlamak için: ') + chalk.cyan('natureco config set naturehubToken <token>'));
  console.log('');
}

async function naturehub(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow('\n  Kullanım:'));
    console.log(chalk.gray('    natureco naturehub post <text>      Yeni gönderi'));
    console.log(chalk.gray('    natureco naturehub list             Son gönderiler'));
    console.log(chalk.gray('    natureco naturehub trending         Trend konular'));
    console.log(chalk.gray('    natureco naturehub config           Ayarlar'));
    console.log('');
    return;
  }
  if (action === 'post') return cmdPost(params);
  if (action === 'list') return cmdList();
  if (action === 'trending') return cmdTrending();
  if (action === 'config') return cmdConfig();
  console.log(chalk.red(`\n  Bilinmeyen action: ${action}\n`));
}

module.exports = naturehub;
