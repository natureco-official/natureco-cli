/**
 * natureco medium — Medium makale yayınlama (Phase 6)
 *
 * Parton'un hedefi: ayda en az 4 Medium makalesi.
 * Bu komut CLI'dan taslak yayınlamayı sağlar.
 *
 * Kullanım:
 *   natureco medium draft <file.md>     Dosyadan taslak oluştur
 *   natureco medium publish <file.md>   Doğrudan yayınla
 *   natureco medium list                Taslak/yayınlanan makaleler
 *   natureco medium stats               Performans istatistikleri
 *
 * Not: Medium API resmi değil, integration token gerektirir.
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const audit = require('../utils/audit');

const API_BASE = 'https://api.medium.com/v1';
const TOKEN_KEY = 'mediumIntegrationToken';

function getToken() {
  const { getConfig } = require('../utils/config');
  return getConfig()[TOKEN_KEY] || null;
}

async function apiCall(endpoint, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Medium integration token tanımlı değil');
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'natureco-cli/3.5',
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy());
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function parseMarkdown(content) {
  const lines = content.split('\n');
  let title = '';
  let body = [];
  let inCode = false;

  for (const line of lines) {
    if (line.startsWith('```')) { inCode = !inCode; body.push(line); continue; }
    if (inCode) { body.push(line); continue; }
    if (!title && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    body.push(line);
  }
  return { title: title || 'Başlıksız', content: body.join('\n').trim() };
}

async function cmdDraft(args) {
  const filePath = args[0];
  if (!filePath) {
    console.log(chalk.red('\n  Kullanım: natureco medium draft <dosya.md>\n'));
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`\n  Dosya bulunamadı: ${filePath}\n`));
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { title, content: body } = parseMarkdown(content);

  console.log(chalk.cyan('\n  📝 Taslak hazırlanıyor...\n'));
  console.log(chalk.gray(`  Başlık: ${title}`));
  console.log(chalk.gray(`  Uzunluk: ${body.length} karakter, ${body.split(/\s+/).length} kelime`));

  const token = getToken();
  if (!token) {
    console.log(chalk.yellow('\n  ⚠️  Medium token tanımlı değil.'));
    console.log(chalk.gray('  Ayarlamak için: ') + chalk.cyan('natureco config set mediumIntegrationToken <token>'));
    console.log(chalk.gray('\n  Token almak için: ') + chalk.cyan('https://medium.com/me/settings/tokens'));
    console.log('');
    // Yerel taslak kaydet
    const draftDir = path.join(os.homedir(), '.natureco', 'medium-drafts');
    if (!fs.existsSync(draftDir)) fs.mkdirSync(draftDir, { recursive: true });
    const draftFile = path.join(draftDir, `${Date.now()}-${path.basename(filePath, '.md')}.json`);
    fs.writeFileSync(draftFile, JSON.stringify({ title, body, source: filePath, createdAt: new Date().toISOString() }, null, 2));
    console.log(chalk.green(`  ✓ Taslak yerel olarak kaydedildi: ${draftFile}\n`));
    return;
  }

  try {
    const user = await apiCall('/me');
    const userId = user.data?.id;
    if (!userId) throw new Error('User ID alınamadı');

    const result = await apiCall(`/users/${userId}/posts`, {
      method: 'POST',
      body: { title, contentFormat: 'markdown', content: body, publishStatus: 'draft' },
    });
    console.log(chalk.green('\n  ✓ Medium\'a taslak yüklendi!'));
    if (result.data?.url) console.log(chalk.cyan(`  🔗 ${result.data.url}\n`));
    audit.log(audit.ACTIONS.INFO, { source: 'medium', action: 'draft', url: result.data?.url });
  } catch (e) {
    console.log(chalk.yellow(`\n  ⚠️  API hatası: ${e.message}`));
    console.log(chalk.gray('  Token\'ı kontrol et veya mediumIntegrationToken ayarla.\n'));
  }
}

async function cmdPublish(args) {
  const filePath = args[0];
  if (!filePath) {
    console.log(chalk.red('\n  Kullanım: natureco medium publish <dosya.md>\n'));
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`\n  Dosya bulunamadı: ${filePath}\n`));
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { title, content: body } = parseMarkdown(content);

  const token = getToken();
  if (!token) {
    console.log(chalk.red('\n  ❌ Medium token tanımlı değil.\n'));
    console.log(chalk.gray('  Yayınlamak için mediumIntegrationToken gerekli.\n'));
    return;
  }

  console.log(chalk.yellow(`\n  ⚠️  "${title}" Medium'da YAYINLANACAK.\n`));

  try {
    const user = await apiCall('/me');
    const userId = user.data?.id;
    const result = await apiCall(`/users/${userId}/posts`, {
      method: 'POST',
      body: { title, contentFormat: 'markdown', content: body, publishStatus: 'public' },
    });
    console.log(chalk.green('\n  ✓ Yayınlandı!'));
    if (result.data?.url) console.log(chalk.cyan(`  🔗 ${result.data.url}\n`));
    audit.log(audit.ACTIONS.INFO, { source: 'medium', action: 'publish', url: result.data?.url });
  } catch (e) {
    console.log(chalk.red(`\n  ❌ Yayınlama başarısız: ${e.message}\n`));
  }
}

function cmdList() {
  const draftDir = path.join(os.homedir(), '.natureco', 'medium-drafts');
  if (!fs.existsSync(draftDir)) {
    console.log(chalk.gray('\n  Henüz taslak yok.\n'));
    return;
  }
  const files = fs.readdirSync(draftDir).sort().reverse();
  console.log(chalk.cyan('\n  📚 Medium Taslakları\n'));
  for (const f of files) {
    const filePath = path.join(draftDir, f);
    try {
      const draft = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      console.log(`  ${chalk.gray(f)}`);
      console.log(`    ${chalk.bold(draft.title)}`);
      console.log(`    ${chalk.gray(new Date(draft.createdAt).toLocaleString())}`);
    } catch {}
  }
  console.log('');
}

async function medium(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow('\n  Kullanım:'));
    console.log(chalk.gray('    natureco medium draft <file.md>      Taslak oluştur'));
    console.log(chalk.gray('    natureco medium publish <file.md>    Doğrudan yayınla'));
    console.log(chalk.gray('    natureco medium list                 Taslaklar'));
    console.log(chalk.gray('\n  Token ayarla: ') + chalk.cyan('natureco config set mediumIntegrationToken <token>'));
    console.log('');
    return;
  }
  if (action === 'draft') return cmdDraft(params);
  if (action === 'publish') return cmdPublish(params);
  if (action === 'list') return cmdList();
  console.log(chalk.red(`\n  Bilinmeyen: ${action}\n`));
}

module.exports = medium;
