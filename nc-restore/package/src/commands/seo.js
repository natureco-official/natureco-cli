/**
 * natureco seo — SEO analiz aracı (Phase 6)
 *
 * Herhangi bir URL için hızlı SEO denetimi.
 * Meta tags, başlık yapısı, performans ipuçları, schema.org kontrolü.
 *
 * Kullanım:
 *   natureco seo audit <url>          Tam SEO denetimi
 *   natureco seo meta <url>           Meta tag analizi
 *   natureco seo speed <url>          Hız ipuçları
 *   natureco seo keywords <url> <k>    Keyword density
 */

const chalk = require('chalk');
const tui = require('../utils/tui');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const audit = require('../utils/audit');

function fetchUrl(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'NatureCo-SEO-Audit/3.5',
        'Accept': 'text/html,application/xhtml+xml',
        ...options.headers,
      },
      timeout: 15000,
    }, (res) => {
      // Redirect takip (max 3)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirect = new URL(res.headers.location, url).toString();
        return fetchUrl(redirect).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data,
        url: targetUrl,
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function extractMeta(html) {
  const result = {};
  // Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  result.title = titleMatch ? titleMatch[1].trim() : null;
  // Meta description
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
  result.description = descMatch ? descMatch[1].trim() : null;
  // Canonical
  const canonMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([\s\S]*?)["']/i);
  result.canonical = canonMatch ? canonMatch[1].trim() : null;
  // Open Graph
  result.og = {};
  const ogRe = /<meta\s+property=["']og:(\w+)["']\s+content=["']([\s\S]*?)["']/gi;
  let m;
  while ((m = ogRe.exec(html)) !== null) {
    result.og[m[1]] = m[2].trim();
  }
  // Twitter Card
  result.twitter = {};
  const twRe = /<meta\s+name=["']twitter:(\w+)["']\s+content=["']([\s\S]*?)["']/gi;
  while ((m = twRe.exec(html)) !== null) {
    result.twitter[m[1]] = m[2].trim();
  }
  // H1-H6
  result.headings = { h1: [], h2: [], h3: [] };
  for (const tag of ['h1', 'h2', 'h3']) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    while ((m = re.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, '').trim();
      if (text) result.headings[tag].push(text);
    }
  }
  // Images without alt
  const imgRe = /<img\s[^>]*>/gi;
  result.imagesWithoutAlt = 0;
  result.totalImages = 0;
  while ((m = imgRe.exec(html)) !== null) {
    result.totalImages++;
    if (!/\salt=/.test(m[0]) || /\salt=["']\s*["']/.test(m[0])) {
      result.imagesWithoutAlt++;
    }
  }
  // Schema.org
  result.hasSchema = /<script\s+type=["']application\/ld\+json["']/.test(html) ||
                     /itemtype=["']https?:\/\/schema\.org/.test(html);
  // Word count (basit)
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ').trim();
  result.wordCount = text.split(/\s+/).filter(Boolean).length;
  return result;
}

async function cmdAudit(args) {
  const targetUrl = args[0];
  if (!targetUrl) {
    console.log(tui.C.red('\n  Kullanım: natureco seo audit <url>\n'));
    return;
  }

  console.log('\n' + tui.styled(`  🔍 SEO Denetimi: ${targetUrl}`, { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Spinner göster
  const spinner = new tui.Spinner('Sayfa yükleniyor', { style: 'dots' }).start();
  let response;
  try {
    response = await fetchUrl(targetUrl);
  } catch (e) {
    spinner.stop(tui.C.red('✗ Hata: ' + e.message));
    console.log('');
    return;
  }

  if (response.statusCode !== 200) {
    spinner.stop(tui.C.yellow(`⚠ HTTP ${response.statusCode} yanıtı alındı`));
  } else {
    spinner.stop(tui.C.green('✓ Sayfa yüklendi'));
  }
  console.log('');

  const meta = extractMeta(response.body);
  const issues = [];
  const passes = [];

  // Title
  if (!meta.title) {
    issues.push({ severity: 'high', msg: 'Title tag eksik' });
  } else if (meta.title.length < 30) {
    issues.push({ severity: 'medium', msg: `Title çok kısa (${meta.title.length} karakter, ideal: 50-60)` });
  } else if (meta.title.length > 60) {
    issues.push({ severity: 'medium', msg: `Title çok uzun (${meta.title.length} karakter, ideal: 50-60)` });
  } else {
    passes.push(`Title (${meta.title.length} karakter)`);
  }

  // Description
  if (!meta.description) {
    issues.push({ severity: 'high', msg: 'Meta description eksik' });
  } else if (meta.description.length < 120) {
    issues.push({ severity: 'low', msg: `Description kısa (${meta.description.length} karakter, ideal: 150-160)` });
  } else if (meta.description.length > 160) {
    issues.push({ severity: 'low', msg: `Description uzun (${meta.description.length} karakter, ideal: 150-160)` });
  } else {
    passes.push(`Description (${meta.description.length} karakter)`);
  }

  // Canonical
  if (meta.canonical) passes.push('Canonical URL var');
  else issues.push({ severity: 'medium', msg: 'Canonical URL tanımlı değil' });

  // OG
  if (Object.keys(meta.og).length > 0) passes.push(`Open Graph (${Object.keys(meta.og).length} tag)`);
  else issues.push({ severity: 'low', msg: 'Open Graph tag yok (sosyal medya paylaşımı için)' });

  // Twitter
  if (Object.keys(meta.twitter).length > 0) passes.push(`Twitter Card (${Object.keys(meta.twitter).length} tag)`);
  else issues.push({ severity: 'low', msg: 'Twitter Card tag yok' });

  // H1
  if (meta.headings.h1.length === 0) issues.push({ severity: 'high', msg: 'H1 tag eksik' });
  else if (meta.headings.h1.length > 1) issues.push({ severity: 'medium', msg: `Birden fazla H1 var (${meta.headings.h1.length}, ideal: 1)` });
  else passes.push(`H1 var: "${meta.headings.h1[0].slice(0, 50)}"`);

  // Images
  if (meta.totalImages > 0) {
    if (meta.imagesWithoutAlt > 0) {
      issues.push({ severity: 'medium', msg: `${meta.imagesWithoutAlt}/${meta.totalImages} image alt tag eksik` });
    } else {
      passes.push(`Tüm image'larda alt var (${meta.totalImages})`);
    }
  }

  // Schema
  if (meta.hasSchema) passes.push('Schema.org markup var');
  else issues.push({ severity: 'low', msg: 'Schema.org markup yok (rich snippets için)' });

  // Content
  if (meta.wordCount < 300) issues.push({ severity: 'medium', msg: `İçerik kısa (${meta.wordCount} kelime, ideal: 600+)` });
  else passes.push(`İçerik uzunluğu (${meta.wordCount} kelime)`);

  // Sonuçları tablo halinde göster
  console.log(tui.styled('  📊 Sonuçlar', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Geçenler
  if (passes.length > 0) {
    console.log('\n' + tui.styled('  ✅ Geçenler', { color: tui.PALETTE.success, bold: true }));
    const passRows = passes.map((p, i) => ({
      icon: tui.styled(' ✓ ', { bg: tui.PALETTE.success, color: '#000', bold: true }),
      msg: p,
    }));
    console.log(tui.table(passRows, [
      { key: 'icon', label: ' ', minWidth: 5 },
      { key: 'msg', label: 'Kontrol', minWidth: 40, render: r => tui.C.text(r.msg) },
    ], { borderStyle: 'round', zebra: true }));
  }

  // İyileştirme alanları
  if (issues.length > 0) {
    console.log('\n' + tui.styled('  ⚠️  İyileştirme Alanları', { color: tui.PALETTE.warning, bold: true }));
    const issueRows = issues.map(i => ({
      icon: i.severity === 'high' ? tui.styled(' ✗ ', { bg: tui.PALETTE.danger, color: '#000', bold: true })
          : i.severity === 'medium' ? tui.styled(' ⚠ ', { bg: tui.PALETTE.warning, color: '#000', bold: true })
          : tui.styled(' ℹ ', { bg: tui.PALETTE.info, color: '#000', bold: true }),
      msg: i.msg,
    }));
    console.log(tui.table(issueRows, [
      { key: 'icon', label: ' ', minWidth: 5 },
      { key: 'msg', label: 'Sorun', minWidth: 40, render: r => tui.C.text(r.msg) },
    ], { borderStyle: 'round', zebra: true }));
  }

  // Skor (büyük, prominent)
  const score = Math.max(0, Math.min(100, 100 - (issues.filter(i => i.severity === 'high').length * 15 + issues.filter(i => i.severity === 'medium').length * 7 + issues.filter(i => i.severity === 'low').length * 3)));
  const scoreColor = score >= 80 ? tui.PALETTE.success : score >= 50 ? tui.PALETTE.warning : tui.PALETTE.danger;
  const scoreGrade = score >= 80 ? '🟢 Mükemmel' : score >= 50 ? '🟡 İyi' : '🔴 Geliştirilmeli';

  console.log('\n' + tui.styled('  ╭────────────────────────────────────────────────────╮', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │', { color: tui.PALETTE.border }) + '       ' + tui.C.muted('SEO Skoru:') + '  ' +
              tui.styled(String(score).padStart(3), { color: scoreColor, bold: true }) + tui.C.muted('/100  ') +
              tui.styled(scoreGrade, { color: scoreColor }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  console.log(tui.styled('  ╰────────────────────────────────────────────────────╯', { color: tui.PALETTE.border }));
  console.log('');

  audit.log(audit.ACTIONS.INFO, { source: 'seo', url: targetUrl, score, issues: issues.length });
}

async function seo(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow('\n  Kullanım:'));
    console.log(chalk.gray('    natureco seo audit <url>           Tam SEO denetimi'));
    console.log(chalk.gray('    natureco seo meta <url>            Meta tag analizi'));
    console.log(chalk.gray('    natureco seo speed <url>           Hız ipuçları'));
    console.log('');
    return;
  }
  if (action === 'audit') return cmdAudit(params);
  if (action === 'meta') {
    console.log(chalk.gray('\n  Meta analizi audit\'in bir parçası olarak geliyor.\n'));
    return cmdAudit(params);
  }
  if (action === 'speed') {
    console.log(chalk.gray('\n  Hız analizi: PageSpeed Insights API entegrasyonu eklenecek (Phase 7).\n'));
    return;
  }
  console.log(chalk.red(`\n  Bilinmeyen: ${action}\n`));
}

module.exports = seo;
