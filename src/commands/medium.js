/**
 * natureco medium — Medium makale yayınlama (Phase 6)
 *
 * Medium entegrasyonu — makale yayinlama.
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
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
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
  if (!token) throw new Error(L('Medium integration token tanımlı değil', 'Medium integration token not set'));
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
  return { title: title || L('Başlıksız', 'Untitled'), content: body.join('\n').trim() };
}

async function cmdDraft(args) {
  const filePath = args[0];
  if (!filePath) {
    console.log(chalk.red(L('\n  Kullanım: natureco medium draft <dosya.md>\n', '\n  Usage: natureco medium draft <file.md>\n')));
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`\n  ${L('Dosya bulunamadı', 'File not found')}: ${filePath}\n`));
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { title, content: body } = parseMarkdown(content);

  console.log(chalk.cyan(L('\n  📝 Taslak hazırlanıyor...\n', '\n  📝 Preparing draft...\n')));
  console.log(chalk.gray(`  ${L('Başlık', 'Title')}: ${title}`));
  console.log(chalk.gray(`  ${L('Uzunluk', 'Length')}: ${body.length} ${L('karakter', 'chars')}, ${body.split(/\s+/).length} ${L('kelime', 'words')}`));

  const token = getToken();
  if (!token) {
    console.log(chalk.yellow(L('\n  ⚠️  Medium token tanımlı değil.', '\n  ⚠️  Medium token not set.')));
    console.log(chalk.gray(L('  Ayarlamak için: ', '  To set: ')) + chalk.cyan('natureco config set mediumIntegrationToken <token>'));
    console.log(chalk.gray(L('\n  Token almak için: ', '\n  To get a token: ')) + chalk.cyan('https://medium.com/me/settings/tokens'));
    console.log('');
    // Yerel taslak kaydet
    const draftDir = path.join(os.homedir(), '.natureco', 'medium-drafts');
    if (!fs.existsSync(draftDir)) fs.mkdirSync(draftDir, { recursive: true });
    const draftFile = path.join(draftDir, `${Date.now()}-${path.basename(filePath, '.md')}.json`);
    fs.writeFileSync(draftFile, JSON.stringify({ title, body, source: filePath, createdAt: new Date().toISOString() }, null, 2));
    console.log(chalk.green(`  ✓ ${L('Taslak yerel olarak kaydedildi', 'Draft saved locally')}: ${draftFile}\n`));
    return;
  }

  try {
    const user = await apiCall('/me');
    const userId = user.data?.id;
    if (!userId) throw new Error(L('User ID alınamadı', 'Could not get User ID'));

    const result = await apiCall(`/users/${userId}/posts`, {
      method: 'POST',
      body: { title, contentFormat: 'markdown', content: body, publishStatus: 'draft' },
    });
    console.log(chalk.green(L('\n  ✓ Medium\'a taslak yüklendi!', '\n  ✓ Draft uploaded to Medium!')));
    if (result.data?.url) console.log(chalk.cyan(`  🔗 ${result.data.url}\n`));
    audit.log(audit.ACTIONS.INFO, { source: 'medium', action: 'draft', url: result.data?.url });
  } catch (e) {
    console.log(chalk.yellow(`\n  ⚠️  ${L('API hatası', 'API error')}: ${e.message}`));
    console.log(chalk.gray(L('  Token\'ı kontrol et veya mediumIntegrationToken ayarla.\n', '  Check the token or set mediumIntegrationToken.\n')));
  }
}

async function cmdPublish(args) {
  const filePath = args[0];
  if (!filePath) {
    console.log(chalk.red(L('\n  Kullanım: natureco medium publish <dosya.md>\n', '\n  Usage: natureco medium publish <file.md>\n')));
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`\n  ${L('Dosya bulunamadı', 'File not found')}: ${filePath}\n`));
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { title, content: body } = parseMarkdown(content);

  const token = getToken();
  if (!token) {
    console.log(chalk.red(L('\n  ❌ Medium token tanımlı değil.\n', '\n  ❌ Medium token not set.\n')));
    console.log(chalk.gray(L('  Yayınlamak için mediumIntegrationToken gerekli.\n', '  mediumIntegrationToken required to publish.\n')));
    return;
  }

  console.log(chalk.yellow(`\n  ⚠️  "${title}" ${L("Medium'da YAYINLANACAK.", 'WILL BE PUBLISHED on Medium.')}\n`));

  try {
    const user = await apiCall('/me');
    const userId = user.data?.id;
    const result = await apiCall(`/users/${userId}/posts`, {
      method: 'POST',
      body: { title, contentFormat: 'markdown', content: body, publishStatus: 'public' },
    });
    console.log(chalk.green(L('\n  ✓ Yayınlandı!', '\n  ✓ Published!')));
    if (result.data?.url) console.log(chalk.cyan(`  🔗 ${result.data.url}\n`));
    audit.log(audit.ACTIONS.INFO, { source: 'medium', action: 'publish', url: result.data?.url });
  } catch (e) {
    console.log(chalk.red(`\n  ❌ ${L('Yayınlama başarısız', 'Publish failed')}: ${e.message}\n`));
  }
}

function cmdList() {
  const draftDir = path.join(os.homedir(), '.natureco', 'medium-drafts');
  if (!fs.existsSync(draftDir)) {
    console.log(chalk.gray(L('\n  Henüz taslak yok.\n', '\n  No drafts yet.\n')));
    return;
  }
  const files = fs.readdirSync(draftDir).sort().reverse();
  console.log(chalk.cyan(L('\n  📚 Medium Taslakları\n', '\n  📚 Medium Drafts\n')));
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
    console.log(chalk.yellow(L('\n  Kullanım:', '\n  Usage:')));
    console.log(chalk.gray(L('    natureco medium draft <file.md>      Taslak oluştur', '    natureco medium draft <file.md>      Create draft')));
    console.log(chalk.gray(L('    natureco medium publish <file.md>    Doğrudan yayınla', '    natureco medium publish <file.md>    Publish directly')));
    console.log(chalk.gray(L('    natureco medium list                 Taslaklar', '    natureco medium list                 Drafts')));
    console.log(chalk.gray(L('\n  Token ayarla: ', '\n  Set token: ')) + chalk.cyan('natureco config set mediumIntegrationToken <token>'));
    console.log('');
    return;
  }
  if (action === 'draft') return cmdDraft(params);
  if (action === 'publish') return cmdPublish(params);
  if (action === 'list') return cmdList();
  console.log(chalk.red(`\n  ${L('Bilinmeyen', 'Unknown')}: ${action}\n`));
}

module.exports = medium;
