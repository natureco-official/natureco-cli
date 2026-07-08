/**
 * memory-lint — flat + tree memory health audit (Urðr-derived, LLM-free)
 *
 * Ported from the Urðr standard (natureco-official/urdr scripts/lint.mjs) into NatureCo's
 * real memory layout so users are protected from the drift that erodes recall:
 *   - DUPLICATE facts (Jaccard ≥ 0.85) — the same thing stored twice, slightly reworded.
 *   - CONFLICTING facts (Jaccard 0.5–0.85) — same subject, different value, e.g.
 *     "favori rengi kırmızı" vs "Favori rengi mavidir", or two different project code names.
 *     This is exactly why recall can return the "wrong" remembered value.
 *
 * Flat memory:  ~/.natureco/memory/<user>.json  (facts: [{value, ...}])
 * Tree memory:  ~/.natureco/memory/tree/<user>/*.md  (## branch → leaves)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');
const DUP = 0.85;
const CONFLICT = 0.5;

const STOP = new Set(['ve', 'ile', 'için', 'icin', 'bir', 'bu', 'da', 'de', 'the', 'and', 'for',
  'kullanici', 'kullanıcı', 'kullanicinin', 'kullanıcının', 'benim', 'onun', 'çok', 'cok']);

function tokens(text) {
  return new Set(
    String(text || '').toLowerCase()
      .replace(/[*_`|]/g, ' ')
      .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ')
      .split(/[^a-z0-9çğıöşü-]+/i)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Lint an array of fact objects/strings. Returns findings, most-similar first.
 * @returns {Array<{level:'duplicate'|'conflict', sim:number, a:string, b:string}>}
 */
function lintFacts(facts) {
  const vals = (facts || []).map((f) => (f && f.value != null ? f.value : f)).filter((v) => typeof v === 'string' && v.trim());
  const toks = vals.map(tokens);
  const findings = [];
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      const sim = jaccard(toks[i], toks[j]);
      if (sim >= DUP) findings.push({ level: 'duplicate', sim, a: vals[i], b: vals[j] });
      else if (sim >= CONFLICT) findings.push({ level: 'conflict', sim, a: vals[i], b: vals[j] });
    }
  }
  return findings.sort((x, y) => y.sim - x.sim);
}

/** Parse a tree root file into branches → leaves and lint for duplicates/conflicts within it. */
function lintTreeFile(file) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const leaves = [];
  let branch = '(root)';
  for (const line of content.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { branch = h[1]; continue; }
    const t = line.trim();
    if (!t || t.startsWith('<!--') || t.startsWith('#') || t === '---' || /^_no entries yet\._$/i.test(t) || t.startsWith('>')) continue;
    leaves.push({ value: t, branch });
  }
  return lintFacts(leaves).map((f) => ({ ...f, file: path.basename(file) }));
}

/** Full audit for a user: flat facts + every tree root file. */
function lintUser(user) {
  const uname = (user || 'default').toLowerCase();
  const flatFile = path.join(MEMORY_DIR, `${uname}.json`);
  let flatFindings = [], flatCount = 0;
  try {
    const facts = (JSON.parse(fs.readFileSync(flatFile, 'utf8')).facts) || [];
    flatCount = facts.length;
    flatFindings = lintFacts(facts);
  } catch {}

  const treeDir = path.join(MEMORY_DIR, 'tree', uname);
  const treeFindings = [];
  try {
    for (const f of fs.readdirSync(treeDir)) {
      if (/^(?:(?:root|kök|kok)-)?\d[-_].*\.md$/i.test(f)) treeFindings.push(...lintTreeFile(path.join(treeDir, f)));
    }
  } catch {}

  return { flatFile, flatCount, flatFindings, treeFindings };
}

/**
 * v5.45: Branch-aware fallback search over a user's memory tree (Urðr search.mjs port).
 * The hierarchical 4-step lookup is primary; this is the safety net so a wrong-root guess
 * never makes stored info read as "forgotten". LLM-free, cross-platform.
 * @returns {Array<{file, branch, text}>}
 */
function searchTree(user, query, opts = {}) {
  const max = opts.max || 25;
  const treeDir = path.join(MEMORY_DIR, 'tree', (user || 'default').toLowerCase());
  if (!query || !String(query).trim()) return [];
  let re;
  try { re = new RegExp(query, 'i'); }
  catch { re = new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
  let files;
  try { files = fs.readdirSync(treeDir).filter((f) => /^(?:(?:root|kök|kok)-)?\d[-_].*\.md$/i.test(f)); }
  catch { return []; }
  const out = [];
  for (const file of files.sort()) {
    let content;
    try { content = fs.readFileSync(path.join(treeDir, file), 'utf8'); } catch { continue; }
    let branch = '(root)';
    for (const line of content.split(/\r?\n/)) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) { branch = h[1]; continue; }
      const t = line.trim();
      if (!t || t.startsWith('<!--') || t.startsWith('#') || t === '---' || /^_no entries yet\._$/i.test(t) || t.startsWith('>')) continue;
      if (re.test(line)) { out.push({ file, branch, text: t.slice(0, 300) }); if (out.length >= max) return out; }
    }
  }
  return out;
}

module.exports = { lintFacts, lintTreeFile, lintUser, searchTree, tokens, jaccard };
