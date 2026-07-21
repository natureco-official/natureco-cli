/**
 * memory_tree — Ağaç-hafıza (kök → dal → yaprak). Kullanıcının OpenCode için tasarladığı
 * tree-memory mimarisinden uyarlandı (opencode-hafiza-mimarisi.md).
 *
 * Felsefe: "bilgi saklama" değil "hızlı bilgi bulma". Düz liste zamanla çöplüğe döner;
 * ağaç logaritmik arama sağlar (kök seç → dal seç → yaprak oku, <300 token).
 *
 * Yapı: ~/.natureco/memory/tree/<user>/
 *   0-index.md   — yönlendirme (hangi konu hangi kökte)
 *   1-kisisel.md — Kişisel & Tercihler (## dallar altında yapraklar)
 *   2-teknik.md  — Teknik & Projeler
 *   3-kararlar.md— Kararlar, Kurallar & Dersler
 *
 * Kurallar (mimariden): tek primary + "bkz:" çapraz referans; yeni bilgi ilgili dalın
 * altına (dosya sonuna değil); credential/secret ASLA düz metin ("bkz: secrets vault").
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { foldTr } = require('../utils/tr-text');
const { tokens, jaccard } = require('../utils/memory-lint');
const { urdrAppendLeaf, urdrSearch } = require('../utils/urdr-engine');

const ROOTS = [
  { id: '1-kisisel', title: 'Kişisel & Tercihler', branches: ['Kimlik', 'Tercihler', 'İletişim Kalıpları'] },
  { id: '2-teknik', title: 'Teknik & Projeler', branches: ['Projeler', 'Kurulum & Sistem', 'Teknik Referans'] },
  { id: '3-kararlar', title: 'Kararlar, Kurallar & Dersler', branches: ['Bekleyen İşler', 'Kararlar', 'Kurallar & Kısıtlar', 'Öğrenilen Dersler', 'Tarihli Olaylar'] },
];

function treeDir(username) {
  return path.join(os.homedir(), '.natureco', 'memory', 'tree', foldTr(username || 'default'));
}
function rootPath(username, id) { return path.join(treeDir(username), id + '.md'); }
function readSafe(username, id) { try { return fs.readFileSync(rootPath(username, id), 'utf8'); } catch { return ''; } }
function resolveRoot(root) {
  if (!root) return ROOTS[0];
  const r = foldTr(root);
  return ROOTS.find((x) => x.id === r || x.id.endsWith(r.replace(/^\d+-/, '')) || x.id.includes(r) || foldTr(x.title).includes(r)) || ROOTS[0];
}

function ensureTree(username) {
  const dir = treeDir(username);
  fs.mkdirSync(dir, { recursive: true });
  for (const r of ROOTS) {
    const p = rootPath(username, r.id);
    if (!fs.existsSync(p)) fs.writeFileSync(p, `# ${r.title}\n\n` + r.branches.map((b) => `## ${b}\n`).join('\n'), 'utf8');
  }
  const idx = path.join(dir, '0-index.md');
  if (!fs.existsSync(idx)) fs.writeFileSync(idx, '# Hafıza İndeksi (kök → dal)\n\n' + ROOTS.map((r) => `- **${r.id}** — ${r.title}: ${r.branches.join(', ')}`).join('\n') + '\n', 'utf8');
}

// Modele enjekte edilen kompakt indeks (dal başlıkları + yaprak sayısı).
function buildIndex(username) {
  ensureTree(username);
  const lines = [];
  for (const r of ROOTS) {
    const txt = readSafe(username, r.id);
    const branches = (txt.match(/^##\s+(.+)$/gm) || []).map((s) => s.replace(/^##\s+/, '').trim());
    const leaves = (txt.match(/^\s*-\s+\S/gm) || []).length;
    lines.push(`- ${r.id} (${r.title}) — dallar: ${branches.join(' · ') || '(boş)'}${leaves ? ` [${leaves} kayıt]` : ''}`);
  }
  return lines.join('\n');
}

function readRoot(username, id) {
  ensureTree(username);
  try { return fs.readFileSync(rootPath(username, resolveRoot(id).id), 'utf8'); } catch { return ''; }
}

// Theseus deseni: oturum BAŞINDA hafızayı proaktif yükle. Tüm kökler-dallar-yapraklardan
// (boş dallar hariç) kompakt bir özet çıkar → sistem prompt'una gömülür ki ajan
// on-demand aramaya güvenmeden bilgiyi ZATEN bilsin. maxChars aşılırsa kırpılır.
function buildDigest(username, maxChars = 2600) {
  ensureTree(username);
  const parts = [];
  for (const r of ROOTS) {
    const txt = readSafe(username, r.id);
    let branch = '';
    const byBranch = {};
    for (const line of txt.split('\n')) {
      if (line.startsWith('## ')) branch = line.slice(3).trim();
      else if (/^\s*-\s+\S/.test(line)) (byBranch[branch] = byBranch[branch] || []).push(line.trim().replace(/^-\s*/, ''));
    }
    const nonEmpty = Object.entries(byBranch).filter(([, l]) => l.length);
    if (nonEmpty.length) {
      parts.push(`[${r.title}]`);
      for (const [b, l] of nonEmpty) parts.push(`  ${b}: ${l.join('; ')}`);
    }
  }
  let out = parts.join('\n');
  if (out.length > maxChars) out = out.slice(0, maxChars) + '\n…(fazlası için memory_tree ile oku)';
  return out;
}

function legacySearch(username, query) {
  ensureTree(username);
  // v5.45.1: Türkçe-güvenli eşleşme (foldTr). Eski `line.toLowerCase().includes(q)` locale
  // duyarsızdı → "İstanbul" .toLowerCase() = "i̇stanbul" olur ve "istanbul" sorgusuyla EŞLEŞMEZDİ;
  // her büyük-harfli Türkçe kelime (İzmir, İş, İletişim…) canlı recall'da sessizce kaçıyordu.
  const q = foldTr(query).trim();
  if (!q) return [];
  const hits = [];
  for (const r of ROOTS) {
    const txt = readSafe(username, r.id);
    let branch = '';
    for (const line of txt.split('\n')) {
      if (line.startsWith('## ')) branch = line.slice(3).trim();
      else if (line.trim() && !line.startsWith('#') && foldTr(line).includes(q)) hits.push(`${r.id}/${branch}: ${line.trim()}`);
    }
  }
  return hits;
}

async function search(username, query) {
  ensureTree(username);
  try {
    const result = await urdrSearch(treeDir(username), query, { maxResults: Number.MAX_SAFE_INTEGER });
    if (result && !result.error && !result.timeout) {
      return result.results.map(({ file, branch, text }) => `${file.replace(/\.md$/i, '')}/${branch}: ${text}`);
    }
  } catch {}
  return legacySearch(username, query);
}

// Oturum basinda proaktif hatirlatma icin: 3-kararlar / "Bekleyen İşler" dalindaki yapraklar.
function getPending(username) {
  const txt = readSafe(username, '3-kararlar');
  const out = [];
  let inBranch = false;
  for (const line of txt.split('\n')) {
    if (line.startsWith('## ')) inBranch = /bekleyen/i.test(line);
    else if (inBranch && /^\s*-\s+\S/.test(line)) out.push(line.trim().replace(/^-\s*/, ''));
  }
  return out;
}

// Bir yapragi (tamamlanan bekleyen is gibi) kaldir — query iceren "- ..." satirlarini siler.
function remove(username, root, query) {
  ensureTree(username);
  const r = resolveRoot(root || '3-kararlar');
  const q = foldTr(query).trim(); // v5.45.1: Türkçe-güvenli (bkz: search)
  if (!q) return { success: false, error: 'query gerekli' };
  const txt = readSafe(username, r.id);
  const kept = [];
  let removed = 0;
  for (const line of txt.split('\n')) {
    if (/^\s*-\s+/.test(line) && foldTr(line).includes(q)) {
      if (/^\s*<!--\s*urdr:id:[^>]+-->\s*$/.test(kept[kept.length - 1] || '')) kept.pop();
      removed++;
      continue;
    }
    kept.push(line);
  }
  if (removed) fs.writeFileSync(rootPath(username, r.id), kept.join('\n'), 'utf8');
  return { success: true, removed, root: r.id };
}

// Belirli bir daldaki mevcut yaprakları döndür (yazma-anı hijyen kontrolü için). Türkçe-güvenli dal eşleşmesi.
function leavesInBranch(txt, branchName) {
  const target = foldTr(branchName).trim();
  const out = [];
  let cur = null;
  for (const line of txt.split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { cur = foldTr(h[1]).trim(); continue; }
    if (cur === target && /^\s*-\s+\S/.test(line)) out.push(line.trim().replace(/^-\s*/, ''));
  }
  return out;
}

async function append(username, root, branch, content) {
  ensureTree(username);
  const r = resolveRoot(root);
  const p = rootPath(username, r.id);
  const br = String(branch || 'Genel').trim();
  const cleaned = String(content).replace(/\s+/g, ' ').trim();
  const leaf = '- ' + cleaned;
  let txt = fs.readFileSync(p, 'utf8');

  // v5.46: yazma-anı hijyen (Urðr lint mantığı, LLM'siz). Aynı dala eklenen yaprağı mevcutlarla
  // Jaccard ile karşılaştır: (a) çok-benzer (≥0.85) → TEKRAR EKLEME (bloat önle, veri kaybı yok
  // çünkü zaten var); (b) aynı konu farklı değer (0.5–0.85) → EKLE ama UYAR (çelişki; hangi
  // değerin doğru olduğuna karar veremeyiz, veriyi kaybetmeyiz → ajan/kullanıcı uzlaştırır).
  let best = { sim: 0, leaf: null };
  try {
    const nt = tokens(cleaned);
    for (const ex of leavesInBranch(txt, br)) {
      const s = jaccard(nt, tokens(ex));
      if (s > best.sim) best = { sim: s, leaf: ex };
    }
  } catch {}
  if (best.sim >= 0.85) {
    return { success: true, deduped: true, root: r.id, branch: br,
      note: `Zaten çok benzer bir kayıt var (%${Math.round(best.sim * 100)}: "${best.leaf}") — tekrar eklenmedi.` };
  }

  const bRe = new RegExp(`^##[ \\t]+${br.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'mi');
  const m = txt.match(bRe);
  let urdrFallbackReason;
  if (m) {
    try {
      const urdrResult = await urdrAppendLeaf(treeDir(username), path.basename(p), br, leaf);
      if (urdrResult) {
        const result = { success: true, root: r.id, branch: br, saved: leaf, engine: 'urdr' };
        if (best.sim >= 0.5) {
          result.warning = `Aynı konuda farklı bir kayıt var (%${Math.round(best.sim * 100)}): "${best.leaf}". İkisi de saklandı; doğru olan kalsın, gerekirse memory_tree remove ile eskisini sil.`;
        }
        return result;
      }
    } catch (error) {
      urdrFallbackReason = error.message;
    }
  }

  if (m) {
    const idx = txt.indexOf(m[0]) + m[0].length;
    txt = txt.slice(0, idx) + '\n' + leaf + txt.slice(idx);
  } else {
    txt = txt.trimEnd() + `\n\n## ${br}\n${leaf}\n`;
  }
  fs.writeFileSync(p, txt, 'utf8');
  const result = { success: true, root: r.id, branch: br, saved: leaf, engine: 'legacy' };
  if (urdrFallbackReason) result._urdrFallbackReason = urdrFallbackReason;
  if (best.sim >= 0.5) {
    result.warning = `Aynı konuda farklı bir kayıt var (%${Math.round(best.sim * 100)}): "${best.leaf}". İkisi de saklandı; doğru olan kalsın, gerekirse memory_tree remove ile eskisini sil.`;
  }
  return result;
}

module.exports = {
  name: 'memory_tree',
  description: 'Ağaç-hafıza (kök→dal→yaprak): kalıcı bilgiyi kategorize SAKLA/OKU/ARA. Yeni oturumda hatırlanır. action: index|read|search|append',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'index | read | search | append' },
      username: { type: 'string', description: 'kullanıcı adı' },
      root: { type: 'string', description: '1-kisisel | 2-teknik | 3-kararlar' },
      branch: { type: 'string', description: 'dal başlığı (append için)' },
      content: { type: 'string', description: 'yaprak metni (append için)' },
      query: { type: 'string', description: 'arama (search için)' },
    },
    required: ['action'],
  },
  async execute(p) {
    const u = p.username || 'default';
    try {
      if (p.action === 'index') return { success: true, index: buildIndex(u) };
      if (p.action === 'read') return { success: true, content: readRoot(u, p.root || '1-kisisel') };
      if (p.action === 'search') return { success: true, results: await search(u, p.query || p.content || '') };
      if (p.action === 'append') {
        if (!p.content) return { success: false, error: 'content (yaprak metni) gerekli' };
        return append(u, p.root || '1-kisisel', p.branch || 'Genel', p.content);
      }
      if (p.action === 'remove' || p.action === 'done') {
        return remove(u, p.root || '3-kararlar', p.query || p.content);
      }
      return { success: false, error: 'bilinmeyen action: ' + p.action + ' (index|read|search|append|remove)' };
    } catch (e) { return { success: false, error: e.message }; }
  },
  _internal: { ensureTree, buildIndex, buildDigest, readRoot, search, append, getPending, remove, leavesInBranch, treeDir, rootPath, ROOTS },
};
