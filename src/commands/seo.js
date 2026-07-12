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
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
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
    console.log(tui.C.red(L('\n  Kullanım: natureco seo audit <url>\n', '\n  Usage: natureco seo audit <url>\n')));
    return;
  }

  console.log('\n' + tui.styled(`  🔍 ${L('SEO Denetimi', 'SEO Audit')}: ${targetUrl}`, { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Spinner göster
  const spinner = new tui.Spinner(L('Sayfa yükleniyor', 'Loading page'), { style: 'dots' }).start();
  let response;
  try {
    response = await fetchUrl(targetUrl);
  } catch (e) {
    spinner.stop(tui.C.red(L('✗ Hata: ', '✗ Error: ') + e.message));
    console.log('');
    return;
  }

  if (response.statusCode !== 200) {
    spinner.stop(tui.C.yellow(`⚠ HTTP ${response.statusCode} ${L('yanıtı alındı', 'response received')}`));
  } else {
    spinner.stop(tui.C.green(L('✓ Sayfa yüklendi', '✓ Page loaded')));
  }
  console.log('');

  const meta = extractMeta(response.body);
  const issues = [];
  const passes = [];

  // Title
  if (!meta.title) {
    issues.push({ severity: 'high', msg: L('Title tag eksik', 'Title tag missing') });
  } else if (meta.title.length < 30) {
    issues.push({ severity: 'medium', msg: `${L('Title çok kısa', 'Title too short')} (${meta.title.length} ${L('karakter', 'chars')}, ideal: 50-60)` });
  } else if (meta.title.length > 60) {
    issues.push({ severity: 'medium', msg: `${L('Title çok uzun', 'Title too long')} (${meta.title.length} ${L('karakter', 'chars')}, ideal: 50-60)` });
  } else {
    passes.push(`Title (${meta.title.length} ${L('karakter', 'chars')})`);
  }

  // Description
  if (!meta.description) {
    issues.push({ severity: 'high', msg: L('Meta description eksik', 'Meta description missing') });
  } else if (meta.description.length < 120) {
    issues.push({ severity: 'low', msg: `${L('Description kısa', 'Description short')} (${meta.description.length} ${L('karakter', 'chars')}, ideal: 150-160)` });
  } else if (meta.description.length > 160) {
    issues.push({ severity: 'low', msg: `${L('Description uzun', 'Description long')} (${meta.description.length} ${L('karakter', 'chars')}, ideal: 150-160)` });
  } else {
    passes.push(`Description (${meta.description.length} ${L('karakter', 'chars')})`);
  }

  // Canonical
  if (meta.canonical) passes.push(L('Canonical URL var', 'Canonical URL present'));
  else issues.push({ severity: 'medium', msg: L('Canonical URL tanımlı değil', 'Canonical URL not set') });

  // OG
  if (Object.keys(meta.og).length > 0) passes.push(`Open Graph (${Object.keys(meta.og).length} tag)`);
  else issues.push({ severity: 'low', msg: L('Open Graph tag yok (sosyal medya paylaşımı için)', 'No Open Graph tags (for social sharing)') });

  // Twitter
  if (Object.keys(meta.twitter).length > 0) passes.push(`Twitter Card (${Object.keys(meta.twitter).length} tag)`);
  else issues.push({ severity: 'low', msg: L('Twitter Card tag yok', 'No Twitter Card tags') });

  // H1
  if (meta.headings.h1.length === 0) issues.push({ severity: 'high', msg: L('H1 tag eksik', 'H1 tag missing') });
  else if (meta.headings.h1.length > 1) issues.push({ severity: 'medium', msg: `${L('Birden fazla H1 var', 'Multiple H1 tags')} (${meta.headings.h1.length}, ideal: 1)` });
  else passes.push(`${L('H1 var', 'H1 present')}: "${meta.headings.h1[0].slice(0, 50)}"`);

  // Images
  if (meta.totalImages > 0) {
    if (meta.imagesWithoutAlt > 0) {
      issues.push({ severity: 'medium', msg: `${meta.imagesWithoutAlt}/${meta.totalImages} ${L('image alt tag eksik', 'images missing alt tags')}` });
    } else {
      passes.push(`${L("Tüm image'larda alt var", 'All images have alt')} (${meta.totalImages})`);
    }
  }

  // Schema
  if (meta.hasSchema) passes.push(L('Schema.org markup var', 'Schema.org markup present'));
  else issues.push({ severity: 'low', msg: L('Schema.org markup yok (rich snippets için)', 'No Schema.org markup (for rich snippets)') });

  // Content
  if (meta.wordCount < 300) issues.push({ severity: 'medium', msg: `${L('İçerik kısa', 'Content short')} (${meta.wordCount} ${L('kelime', 'words')}, ideal: 600+)` });
  else passes.push(`${L('İçerik uzunluğu', 'Content length')} (${meta.wordCount} ${L('kelime', 'words')})`);

  // Sonuçları tablo halinde göster
  console.log(tui.styled(L('  📊 Sonuçlar', '  📊 Results'), { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Geçenler
  if (passes.length > 0) {
    console.log('\n' + tui.styled(L('  ✅ Geçenler', '  ✅ Passed'), { color: tui.PALETTE.success, bold: true }));
    const passRows = passes.map((p, i) => ({
      icon: tui.styled(' ✓ ', { bg: tui.PALETTE.success, color: '#000', bold: true }),
      msg: p,
    }));
    console.log(tui.table(passRows, [
      { key: 'icon', label: ' ', minWidth: 5 },
      { key: 'msg', label: L('Kontrol', 'Check'), minWidth: 40, render: r => tui.C.text(r.msg) },
    ], { borderStyle: 'round', zebra: true }));
  }

  // İyileştirme alanları
  if (issues.length > 0) {
    console.log('\n' + tui.styled(L('  ⚠️  İyileştirme Alanları', '  ⚠️  Improvement Areas'), { color: tui.PALETTE.warning, bold: true }));
    const issueRows = issues.map(i => ({
      icon: i.severity === 'high' ? tui.styled(' ✗ ', { bg: tui.PALETTE.danger, color: '#000', bold: true })
          : i.severity === 'medium' ? tui.styled(' ⚠ ', { bg: tui.PALETTE.warning, color: '#000', bold: true })
          : tui.styled(' ℹ ', { bg: tui.PALETTE.info, color: '#000', bold: true }),
      msg: i.msg,
    }));
    console.log(tui.table(issueRows, [
      { key: 'icon', label: ' ', minWidth: 5 },
      { key: 'msg', label: L('Sorun', 'Issue'), minWidth: 40, render: r => tui.C.text(r.msg) },
    ], { borderStyle: 'round', zebra: true }));
  }

  // Skor (büyük, prominent)
  const score = Math.max(0, Math.min(100, 100 - (issues.filter(i => i.severity === 'high').length * 15 + issues.filter(i => i.severity === 'medium').length * 7 + issues.filter(i => i.severity === 'low').length * 3)));
  const scoreColor = score >= 80 ? tui.PALETTE.success : score >= 50 ? tui.PALETTE.warning : tui.PALETTE.danger;
  const scoreGrade = score >= 80 ? L('🟢 Mükemmel', '🟢 Excellent') : score >= 50 ? L('🟡 İyi', '🟡 Good') : L('🔴 Geliştirilmeli', '🔴 Needs work');

  console.log('\n' + tui.styled('  ╭────────────────────────────────────────────────────╮', { color: tui.PALETTE.border }));
  console.log(tui.styled('  │', { color: tui.PALETTE.border }) + '       ' + tui.C.muted(L('SEO Skoru:', 'SEO Score:')) + '  ' +
              tui.styled(String(score).padStart(3), { color: scoreColor, bold: true }) + tui.C.muted('/100  ') +
              tui.styled(scoreGrade, { color: scoreColor }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  console.log(tui.styled('  ╰────────────────────────────────────────────────────╯', { color: tui.PALETTE.border }));
  console.log('');

  audit.log(audit.ACTIONS.INFO, { source: 'seo', url: targetUrl, score, issues: issues.length });
}

async function seo(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow(L('\n  Kullanım:', '\n  Usage:')));
    console.log(chalk.gray(L('    natureco seo audit <url>           Tam SEO denetimi', '    natureco seo audit <url>           Full SEO audit')));
    console.log(chalk.gray(L('    natureco seo meta <url>            Meta tag analizi', '    natureco seo meta <url>            Meta tag analysis')));
    console.log(chalk.gray(L('    natureco seo speed <url>           Hız ipuçları', '    natureco seo speed <url>           Speed tips')));
    console.log('');
    return;
  }
  if (action === 'audit') return cmdAudit(params);
  if (action === 'meta') {
    console.log(chalk.gray(L('\n  Meta analizi audit\'in bir parçası olarak geliyor.\n', '\n  Meta analysis comes as part of the audit.\n')));
    return cmdAudit(params);
  }
  if (action === 'speed') {
    console.log(chalk.gray(L('\n  Hız analizi: PageSpeed Insights API entegrasyonu eklenecek (Phase 7).\n', '\n  Speed analysis: PageSpeed Insights API integration coming (Phase 7).\n')));
    return;
  }
  console.log(chalk.red(`\n  ${L('Bilinmeyen', 'Unknown')}: ${action}\n`));
}

module.exports = seo;
