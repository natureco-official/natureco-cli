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
 *
 * v5.45.1: matching is Turkish-aware (tr-text foldTr) and searchTree is regex-free so a
 * natural query like "proje kod adı (v2)" is matched literally, not as a regex.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { foldTr } = require('./tr-text');

const MEMORY_DIR = path.join(os.homedir(), '.natureco', 'memory');
const DUP = 0.85;
const CONFLICT = 0.5;
// Root files: Urðr "root-N-name.md" / "kök-N-…" and NatureCo native "N-name.md".
const ROOT_RE = /^(?:(?:root|kök|kok)-)?\d[-_].*\.md$/i;

const STOP = new Set(['ve', 'ile', 'için', 'icin', 'bir', 'bu', 'da', 'de', 'the', 'and', 'for',
  'kullanici', 'kullanıcı', 'kullanicinin', 'kullanıcının', 'benim', 'onun', 'çok', 'cok']);

function tokens(text) {
  // foldTr lowercases and normalizes the four Turkish i-variants so "İstanbul" and
  // "istanbul" tokenize identically (better duplicate/conflict detection for TR facts).
  return new Set(
    foldTr(text)
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
 * Each fact may carry an optional `branch` (tree memory) which is propagated into the
 * finding as aBranch/bBranch so the caller can tell the user WHERE each side lives.
 * @returns {Array<{level:'duplicate'|'conflict', sim:number, a:string, b:string, aBranch?:string, bBranch?:string}>}
 */
function lintFacts(facts) {
  const items = (facts || [])
    .map((f) => ({ value: f && f.value != null ? f.value : f, branch: f && f.branch }))
    .filter((x) => typeof x.value === 'string' && x.value.trim());
  const toks = items.map((x) => tokens(x.value));
  const findings = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = jaccard(toks[i], toks[j]);
      if (sim < CONFLICT) continue;
      findings.push({
        level: sim >= DUP ? 'duplicate' : 'conflict',
        sim,
        a: items[i].value,
        b: items[j].value,
        aBranch: items[i].branch,
        bBranch: items[j].branch,
      });
    }
  }
  return findings.sort((x, y) => y.sim - x.sim);
}

/** Is this a real leaf line (not a heading/comment/separator/placeholder/quote)? */
function isLeaf(trimmed) {
  return !!trimmed
    && !trimmed.startsWith('<!--')
    && !trimmed.startsWith('#')
    && trimmed !== '---'
    && !/^_no entries yet\._$/i.test(trimmed)
    && !trimmed.startsWith('>');
}

/** Strip a leading list marker ("- ", "* ", "+ ") for clean display/tokenization. */
function leafText(trimmed) {
  return trimmed.replace(/^[-*+]\s+/, '');
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
    if (!isLeaf(t)) continue;
    leaves.push({ value: leafText(t), branch });
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
      if (ROOT_RE.test(f)) treeFindings.push(...lintTreeFile(path.join(treeDir, f)));
    }
  } catch {}

  return { flatFile, flatCount, flatFindings, treeFindings };
}

/**
 * v5.45: Branch-aware fallback search over a user's memory tree (Urðr search.mjs port).
 * The hierarchical 4-step lookup is primary; this is the safety net so a wrong-root guess
 * never makes stored info read as "forgotten". LLM-free, cross-platform.
 *
 * v5.45.1: Turkish-aware (foldTr) and REGEX-FREE. The query is split into whitespace terms
 * and a leaf matches only if it contains ALL terms (AND) — so multi-word queries are useful
 * and special characters like ()[]*? are matched literally instead of breaking the search.
 * @param {string} user
 * @param {string} query
 * @param {{max?:number, dir?:string}} opts  dir overrides the tree directory (testing).
 * @returns {Array<{file, branch, text}>}
 */
function searchTree(user, query, opts = {}) {
  const max = opts.max || 25;
  const treeDir = opts.dir || path.join(MEMORY_DIR, 'tree', (user || 'default').toLowerCase());
  const terms = String(query == null ? '' : query).split(/\s+/).map(foldTr).filter(Boolean);
  if (!terms.length) return [];
  let files;
  try { files = fs.readdirSync(treeDir).filter((f) => ROOT_RE.test(f)); }
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
      if (!isLeaf(t)) continue;
      const folded = foldTr(line);
      if (terms.every((term) => folded.includes(term))) {
        out.push({ file, branch, text: leafText(t).slice(0, 300) });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

module.exports = { lintFacts, lintTreeFile, lintUser, searchTree, tokens, jaccard };
