const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const memoryStore = require('../utils/memory-store');
const { loadMemory, saveMemory, clearMemory } = require('../utils/memory');
const { getConfig } = require('../utils/config');

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');

async function memoryCmd(args) {
  const [action, ...params] = (args || []);

  if (!action || action === 'status') return statusMemory();
  if (action === 'list') return listMemory();
  if (action === 'search') return searchMemory(params.join(' '));
  if (action === 'show') return showMemory(params[0]);
  if (action === 'clear') return clearMemoryCmd(params[0]);
  if (action === 'index') return indexMemory();
  if (action === 'export') return exportMemoryCmd(params[0], params[1]);
  if (action === 'import') return importMemoryCmd(params[0], params[1]);
  if (action === 'lint') return lintMemoryCmd(params[0]);
  if (action === 'semantic') return semanticSearchCmd(params.join(' '));
  // Wiki pages
  if (action === 'wiki') return wikiCmd(params[0], params.slice(1));
  if (action === 'wiki-create') return wikiCreateCmd(params[0], params.slice(1).join(' '));
  if (action === 'wiki-list') return wikiListCmd();
  if (action === 'wiki-search') return wikiSearchCmd(params.join(' '));

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco memory [status|list|search|show|clear|index|export|import|semantic|wiki|wiki-create|wiki-list|wiki-search]\n'));
  process.exit(1);
}

function statusMemory() {
  const config = getConfig();
  const w = process.stdout.columns || 120;
  const line = chalk.gray('─'.repeat(w));

  console.log('');
  console.log(line);
  console.log(chalk.bold.cyan('  Hafıza Durumu'));
  console.log(line);

  if (!fs.existsSync(MEMORY_DIR)) {
    console.log(chalk.gray('\n  Hafıza dizini bulunamadı.\n'));
    console.log(line);
    return;
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(chalk.gray('\n  Kayıtlı hafıza yok.\n'));
    console.log(line);
    return;
  }

  let totalFacts = 0;
  const activeBotName = config.botName || '';

  console.log('');
  files.forEach(file => {
    const botId = file.replace('.json', '');
    try {
      const mem = loadMemory(botId);
      const factCount = (mem.facts || []).length;
      const prefCount = (mem.preferences || []).length;
      totalFacts += factCount;
      const isActive = activeBotName && (mem.botName === activeBotName);
      const bar = isActive ? chalk.cyan('▌') : chalk.gray('▌');

      console.log(bar + ' ' + chalk.bold.white(mem.botName || botId) + (isActive ? chalk.cyan('  ← aktif') : ''));
      console.log(bar + '  ' + chalk.gray('Kullanıcı : ') + chalk.white(mem.name || '—'));
      if (mem.nickname) {
        console.log(bar + '  ' + chalk.gray('Lakap     : ') + chalk.white(mem.nickname));
      }
      console.log(bar + '  ' + chalk.gray('Bilgi      : ') + chalk.white(`${factCount} kayıt`));
      console.log(bar + '  ' + chalk.gray('Tercihler  : ') + chalk.white(`${prefCount} kayıt`));
      if (mem.lastSeen) {
        const d = new Date(mem.lastSeen);
        console.log(bar + '  ' + chalk.gray('Son görüş  : ') + chalk.white(d.toLocaleDateString('tr-TR')));
      }
      console.log('');
    } catch {}
  });

  console.log(line);
  console.log(chalk.gray(`  ${files.length} bot  ·  ${totalFacts} toplam bilgi  ·  natureco memory search <sorgu>`));
  console.log(line);
  console.log('');
}

function listMemory() {
  if (!fs.existsSync(MEMORY_DIR)) {
    console.log(chalk.gray('\n  Hafıza dizini bulunamadı.\n'));
    return;
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  console.log(chalk.cyan.bold(`\n  Hafıza Dosyaları (${files.length})\n`));
  files.forEach(f => {
    const botId = f.replace('.json', '');
    const mem = loadMemory(botId);
    console.log(chalk.white(`  ${f}`));
    console.log(chalk.gray(`    Bot: ${mem.botName || botId}  ·  ${(mem.facts || []).length} bilgi`));
  });
  console.log('');
}

function searchMemory(query) {
  if (!query) {
    console.log(chalk.red('\n  ❌ Arama sorgusu gerekli\n'));
    console.log(chalk.gray('  Kullanım: natureco memory search <sorgu>\n'));
    process.exit(1);
  }

  if (!fs.existsSync(MEMORY_DIR)) {
    console.log(chalk.gray('\n  Hafıza dizini bulunamadı.\n'));
    return;
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  const results = [];

  files.forEach(file => {
    const botId = file.replace('.json', '');
    const mem = loadMemory(botId);
    const q = query.toLowerCase();

    if (mem.name?.toLowerCase().includes(q)) {
      results.push({ bot: mem.botName || botId, field: 'İsim', value: mem.name });
    }
    if (mem.nickname?.toLowerCase().includes(q)) {
      results.push({ bot: mem.botName || botId, field: 'Lakap', value: mem.nickname });
    }
    (mem.facts || []).forEach(f => {
      const val = typeof f === 'string' ? f : f.value;
      if (val?.toLowerCase().includes(q)) {
        results.push({ bot: mem.botName || botId, field: 'Bilgi', value: val });
      }
    });
  });

  console.log(chalk.cyan.bold(`\n  "${query}" için ${results.length} sonuç (düz hafıza)\n`));
  results.forEach(r => {
    console.log(chalk.white(`  [${r.bot}] `) + chalk.gray(`${r.field}: `) + chalk.white(r.value));
  });

  // v5.45: ağaç hafızada branch-aware FALLBACK (Urðr) — düz hafızada bulunamasa bile
  // bilgi "erişilemez" kalmasın (yanlış-kök tahmini kurtarma ağı). LLM'siz.
  try {
    const { searchTree } = require('../utils/memory-lint');
    let u; try { u = require('../utils/config').getConfig().userName; } catch {}
    const treeHits = searchTree(u || 'default', query);
    if (treeHits.length) {
      console.log(chalk.cyan(`\n  Ağaç hafızada ${treeHits.length} sonuç:`));
      treeHits.slice(0, 15).forEach(h => console.log(chalk.gray(`  ${h.file} › ## ${h.branch} › `) + chalk.white(h.text)));
    } else if (results.length === 0) {
      console.log(chalk.gray('  Sonuç bulunamadı (düz + ağaç hafıza).'));
    }
  } catch { if (results.length === 0) console.log(chalk.gray('  Sonuç bulunamadı.')); }
  console.log('');
}

function showMemory(botId) {
  const config = getConfig();
  const id = botId || 'universal-provider';
  const mem = loadMemory(id);

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(`\n  Hafıza: ${mem.botName || id}\n`));

  if (mem.name) console.log(chalk.gray('  İsim    : ') + chalk.white(mem.name));
  if (mem.nickname) console.log(chalk.gray('  Lakap   : ') + chalk.white(mem.nickname));
  if (mem.botName) console.log(chalk.gray('  Bot adı : ') + chalk.cyan(mem.botName));

  const facts = mem.facts || [];
  if (facts.length > 0) {
    console.log(chalk.gray('\n  Bilgiler:\n'));
    facts.forEach((f, i) => {
      const val = typeof f === 'string' ? f : f.value;
      const score = typeof f === 'object' ? f.score : 5;
      console.log(chalk.gray(`  ${(i + 1).toString().padStart(2)}. `) + chalk.white(val) + chalk.gray(` (${score})`));
    });
  }
  console.log('');
}

function clearMemoryCmd(botId) {
  const id = botId || 'universal-provider';
  clearMemory(id);
  console.log(chalk.green(`\n  ✓ Hafıza temizlendi: ${id}\n`));
}

function indexMemory() {
  if (!fs.existsSync(MEMORY_DIR)) {
    console.log(chalk.gray('\n  Hafıza dizini bulunamadı.\n'));
    return;
  }

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  let indexed = 0;

  files.forEach(file => {
    const botId = file.replace('.json', '');
    try {
      const mem = loadMemory(botId);
      // Bozuk fact'leri temizle
      if (Array.isArray(mem.facts)) {
        mem.facts = mem.facts.filter(f => {
          const val = typeof f === 'string' ? f : f?.value;
          return val && typeof val === 'string' && val.length > 0;
        });
        saveMemory(botId, mem);
        indexed++;
      }
    } catch {}
  });

  console.log(chalk.green(`\n  ✓ ${indexed} hafıza dosyası yeniden indexlendi\n`));
}

// ── Export Memory ──────────────────────────────────────────────────────────────
function exportMemoryCmd(botId, outputFile) {
  const id = botId || 'universal-provider';
  const mem = memoryStore.loadMemory(id);
  const filePath = outputFile || path.join(process.cwd(), `memory-${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(mem, null, 2));
  console.log(chalk.green(`\n  ✓ Hafıza dışa aktarıldı: ${filePath}\n`));
}

// ── Import Memory ──────────────────────────────────────────────────────────────
function importMemoryCmd(botId, sourceFile) {
  if (!sourceFile) {
    console.log(chalk.red('\n  ❌ Kaynak dosya gerekli\n'));
    console.log(chalk.gray('  Kullanım: natureco memory import <botId> <dosya.json>\n'));
    return;
  }
  const resolvedPath = path.resolve(sourceFile.replace(/^~/, os.homedir()));
  if (!fs.existsSync(resolvedPath)) {
    console.log(chalk.red(`\n  ❌ Dosya bulunamadı: ${resolvedPath}\n`));
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
    // v5.6.16: memoryStore.saveMemory kullan
    const importId = botId || 'universal-provider';
    memoryStore.saveMemory(importId, data);
    console.log(chalk.green(`\n  ✓ Hafıza içe aktarıldı: ${importId}\n`));
  } catch (err) {
    console.log(chalk.red(`\n  ❌ Hata: ${err.message}\n`));
  }
}

// ── Semantic Search ────────────────────────────────────────────────────────────
function semanticSearchCmd(query) {
  if (!query) {
    console.log(chalk.red('\n  ❌ Arama sorgusu gerekli\n'));
    return;
  }
  const results = semanticSearchMemory(query, 10);
  console.log(chalk.cyan.bold(`\n  Semantic: "${query}" → ${results.length} sonuç\n`));
  if (results.length === 0) {
    console.log(chalk.gray('  Sonuç bulunamadı.\n'));
    return;
  }
  results.forEach((r, i) => {
    const pct = Math.round(r.score * 100);
    const bar = chalk.green('█'.repeat(Math.floor(pct / 10))) + chalk.gray('░'.repeat(10 - Math.floor(pct / 10)));
    console.log(`  ${chalk.white(`${i + 1}.`)} ${bar} ${chalk.white(r.value.slice(0, 70))}`);
    console.log(chalk.gray(`     [${r.bot}]  alaka: %${pct}`));
  });
  console.log('');
}

// ── Wiki Commands ──────────────────────────────────────────────────────────────
function wikiCmd(action, params) {
  if (!action || action === 'list') return wikiListCmd();
  if (action === 'show') {
    const slug = params?.[0];
    if (!slug) { console.log(chalk.red('\n  ❌ Sayfa adı gerekli\n')); return; }
    const page = getWikiPage(slug);
    if (!page) { console.log(chalk.yellow(`\n  ⚠ Sayfa bulunamadı: ${slug}\n`)); return; }
    console.log(chalk.cyan.bold(`\n  Wiki: ${page.slug}\n`));
    console.log(chalk.white(page.content));
    console.log(chalk.gray(`\n  Son güncelleme: ${page.updatedAt}\n`));
    return;
  }
  if (action === 'create' || action === 'edit') {
    const slug = params?.[0];
    const content = params?.slice(1).join(' ');
    if (!slug || !content) {
      console.log(chalk.red('\n  ❌ Kullanım: natureco memory wiki create <slug> <içerik>\n'));
      return;
    }
    saveWikiPage(slug, content);
    console.log(chalk.green(`\n  ✓ Wiki sayfası kaydedildi: ${slug}\n`));
    return;
  }
  if (action === 'search') {
    const query = params?.join(' ');
    if (!query) { console.log(chalk.red('\n  ❌ Arama sorgusu gerekli\n')); return; }
    const results = searchWikiPages(query);
    console.log(chalk.cyan.bold(`\n  Wiki: "${query}" → ${results.length} sonuç\n`));
    if (results.length === 0) { console.log(chalk.gray('  Sonuç bulunamadı.\n')); return; }
    results.forEach(p => {
      console.log(`  ${chalk.white(p.slug)} ${chalk.gray('—')} ${chalk.gray((p.content || '').slice(0, 60))}`);
    });
    console.log('');
    return;
  }
  console.log(chalk.red(`\n  ❌ Bilinmeyen wiki aksiyonu: ${action}\n`));
}

function wikiCreateCmd(slug, content) {
  if (!slug || !content) {
    console.log(chalk.red('\n  ❌ Kullanım: natureco memory wiki-create <slug> <içerik>\n'));
    return;
  }
  saveWikiPage(slug, content);
  console.log(chalk.green(`\n  ✓ Wiki sayfası oluşturuldu: ${slug}\n`));
}

function wikiListCmd() {
  const pages = listWikiPages();
  console.log(chalk.cyan.bold(`\n  Wiki Sayfaları (${pages.length})\n`));
  if (pages.length === 0) {
    console.log(chalk.gray('  Henüz sayfa yok.\n'));
    console.log(chalk.gray('  Oluşturmak: ') + chalk.cyan('natureco memory wiki create <slug> <içerik>\n'));
    return;
  }
  pages.forEach(p => {
    const preview = (p.content || '').slice(0, 60).replace(/\n/g, ' ');
    console.log(`  ${chalk.white(p.slug)} ${chalk.gray('—')} ${chalk.gray(preview)}`);
    console.log(chalk.gray(`    ${p.updatedAt}\n`));
  });
}

function wikiSearchCmd(query) {
  if (!query) { console.log(chalk.red('\n  ❌ Arama sorgusu gerekli\n')); return; }
  const results = searchWikiPages(query);
  console.log(chalk.cyan.bold(`\n  Wiki Ara: "${query}" → ${results.length} sonuç\n`));
  if (results.length === 0) { console.log(chalk.gray('  Sonuç bulunamadı.\n')); return; }
  results.forEach(p => {
    console.log(`  ${chalk.white(p.slug)}`);
    console.log(chalk.gray(`    ${(p.content || '').slice(0, 80)}\n`));
  });
}

// ── Wiki Page Functions (v5.6.16 inline) ─────────────────────────────
function listWikiPages() {
  const WIKI_DIR = path.join(os.homedir(), '.natureco', 'wiki');
  if (!fs.existsSync(WIKI_DIR)) {
    console.log(chalk.gray('\n  Wiki bos.\n'));
    return;
  }
  const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith('.md'));
  console.log(chalk.cyan(`\n  Wiki Sayfalari (${files.length}):\n`));
  files.forEach(f => console.log(`  ${chalk.white(f.replace('.md',''))}`));
  console.log();
}

function getWikiPage(slug) {
  if (!slug) return;
  const WIKI_DIR = path.join(os.homedir(), '.natureco', 'wiki');
  const filePath = path.join(WIKI_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`\n  ❌ Wiki sayfasi bulunamadi: ${slug}\n`));
    return;
  }
  console.log(chalk.cyan(`\n  ${slug}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(60)));
  console.log(fs.readFileSync(filePath, 'utf-8'));
}

function saveWikiPage(slug, content) {
  if (!slug) return;
  const WIKI_DIR = path.join(os.homedir(), '.natureco', 'wiki');
  if (!fs.existsSync(WIKI_DIR)) fs.mkdirSync(WIKI_DIR, { recursive: true });
  const filePath = path.join(WIKI_DIR, `${slug}.md`);
  fs.writeFileSync(filePath, content);
  console.log(chalk.green(`\n  ✓ Wiki sayfasi kaydedildi: ${slug}\n`));
}

function searchWikiPages(query) {
  if (!query) return [];
  const WIKI_DIR = path.join(os.homedir(), '.natureco', 'wiki');
  if (!fs.existsSync(WIKI_DIR)) return [];
  const lower = query.toLowerCase();
  return fs.readdirSync(WIKI_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      slug: f.replace('.md', ''),
      content: fs.readFileSync(path.join(WIKI_DIR, f), 'utf-8'),
    }))
    .filter(p => p.content.toLowerCase().includes(lower));
}

// ── Semantic Search (v5.6.16 inline - basit keyword-based) ───────────
function semanticSearchMemory(query, botId) {
  const id = botId || 'universal-provider';
  const mem = memoryStore.loadMemory(id);
  if (!query) return [];
  const lower = query.toLowerCase();
  const results = [];
  // facts icinde ara
  (mem.facts || []).forEach(f => {
    const text = (typeof f === 'string' ? f : f.value) || '';
    if (text.toLowerCase().includes(lower)) {
      results.push({ type: 'fact', value: text, score: f.score || 5 });
    }
  });
  return results;
}

// v5.45: memory lint — Urðr-derived duplicate/conflict audit (flat + tree).
// Catches "same fact stored twice" and "same subject, different value" (the drift that
// makes recall return the wrong remembered value, e.g. two different project code names).
function lintMemoryCmd(user) {
  const { lintUser } = require('../utils/memory-lint');
  let u = user;
  if (!u) { try { u = require('../utils/config').getConfig().userName; } catch {} }
  const { flatFile, flatCount, flatFindings, treeFindings } = lintUser(u || 'default');

  console.log(chalk.cyan(`\n  🧠 Memory Lint · ${u || 'default'}\n`) + chalk.gray('  ' + '─'.repeat(52)));
  console.log(chalk.gray(`  flat: ${flatCount} fact · ${path.basename(flatFile)}`));

  const all = [...flatFindings, ...treeFindings];
  const dups = all.filter((f) => f.level === 'duplicate');
  const conflicts = all.filter((f) => f.level === 'conflict');

  if (all.length === 0) {
    console.log(chalk.green('\n  ✓ Temiz — yinelenen veya çelişen kayıt yok.\n'));
    return;
  }
  // Tree bulgularında dal (branch) bağlamını da göster ki kullanıcı "hangisi nerede" bilsin.
  const br = (b) => (b ? chalk.gray(` (## ${b})`) : '');
  const printFinding = (f, sym) => {
    console.log(`     ${chalk.gray(`(%${Math.round(f.sim * 100)})`)} ${f.a}${br(f.aBranch)}`);
    console.log(`     ${chalk.gray('           ' + sym)} ${f.b}${br(f.bBranch)}${f.file ? chalk.gray(' [' + f.file + ']') : ''}`);
  };
  if (dups.length) {
    console.log(chalk.yellow(`\n  ⚠ ${dups.length} olası YİNELENEN (aynı bilgi iki kez):`));
    for (const f of dups.slice(0, 10)) printFinding(f, '≈');
  }
  if (conflicts.length) {
    console.log(chalk.red(`\n  ⚠ ${conflicts.length} olası ÇELİŞKİ (aynı konu, farklı değer):`));
    for (const f of conflicts.slice(0, 10)) printFinding(f, '↔');
  }
  console.log(chalk.gray(`\n  Öneri: eskiyen/yanlış kaydı düzeltin — "natureco memory clear" veya elle. Tek doğru kalsın.\n`));
}

module.exports = memoryCmd;
