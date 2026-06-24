/**
 * NatureCo CLI — Self-Evolving Skill Detector (Phase 3)
 *
 * Kullanıcının tool çağrı dizilerini izler, tekrar eden pattern'leri tespit eder
 * ve otomatik olarak yeni bir SKILL.md oluşturmayı önerir.
 *
 * Bu, Hermes Agent'ın "self-evolving skills" özelliğinin NatureCo uyarlamasıdır.
 * OpenClaw'da böyle bir özellik yoktur — kullanıcılar her şeyi manuel tanımlar.
 *
 * Algoritma:
 *   1. Her tool çağrısı normalized olarak loglanır (argümanlar generic hale getirilir)
 *   2. Sliding window ile son N çağrıdan pattern çıkarılır
 *   3. Aynı pattern 3+ kez tekrarlandığında → skill önerisi tetiklenir
 *   4. Kullanıcı kabul ederse SKILL.md template oluşturulur
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PATTERNS_FILE = path.join(os.homedir(), '.natureco', 'patterns.json');
const PROPOSALS_FILE = path.join(os.homedir(), '.natureco', 'skill-proposals.json');
const MIN_REPETITIONS = 3;        // 3 kez tekrar etmeli
const WINDOW_SIZE = 5;            // Son N tool çağrısına bak
const COOLDOWN_MS = 24 * 3600 * 1000; // Aynı pattern'i 24 saat içinde tekrar önerme

// Hassas argümanları normalize et (gerçek değer yerine tür)
const NORMALIZE_RULES = [
  // URL'ler
  [/(https?:\/\/)[^\s/$.?#].[^\s]*/g, '$1<url>'],
  // Dosya yolları (uzatmalar korunur)
  [/\/[\w./-]+\.(js|ts|tsx|jsx|json|md|py|go|rs|java|cpp|c|h)\b/g, '<path>'],
  // Sayılar (ID'ler, fiyatlar, vs)
  [/\b\d{3,}\b/g, '<num>'],
  // UUID'ler
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>'],
  // ISO tarihler
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '<iso-date>'],
  // Email
  [/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<email>'],
  // Hex string (40+ karakter)
  [/[0-9a-f]{40,}/gi, '<hex>'],
];

/**
 * Bir tool çağrısını normalize et — aynı tipteki çağrılar eşleşsin.
 */
function normalizeCall(call) {
  if (!call || typeof call !== 'object') return null;
  let argsStr = '';
  if (call.args && typeof call.args === 'object') {
    argsStr = JSON.stringify(call.args);
  } else if (typeof call.args === 'string') {
    argsStr = call.args;
  }
  for (const [pattern, replacement] of NORMALIZE_RULES) {
    argsStr = argsStr.replace(pattern, replacement);
  }
  return `${call.tool || call.name || 'unknown'}|${argsStr}`;
}

/**
 * Son N tool çağrısından pattern fingerprint çıkar.
 * Sequence elemanları zaten normalize edilmiş string'ler.
 */
function fingerprint(sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) return '';
  return sequence.join('→');
}

function fingerprintHash(fp) {
  return crypto.createHash('sha256').update(fp).digest('hex').slice(0, 16);
}

function loadPatterns() {
  if (!fs.existsSync(PATTERNS_FILE)) {
    return { sequences: [], lastProposalAt: {}, stats: { totalCalls: 0, patternsFound: 0 } };
  }
  try { return JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf8')); }
  catch { return { sequences: [], lastProposalAt: {}, stats: { totalCalls: 0, patternsFound: 0 } }; }
}

function savePatterns(data) {
  const dir = path.dirname(PATTERNS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PATTERNS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadProposals() {
  if (!fs.existsSync(PROPOSALS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf8')); }
  catch { return []; }
}

function saveProposals(list) {
  fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

/**
 * Yeni bir tool çağrısı kaydet.
 * Returns: { detected: bool, pattern: object|null, proposal: object|null }
 */
function recordCall(call) {
  const data = loadPatterns();
  const norm = normalizeCall(call);
  if (!norm) return { detected: false };

  // Sequence'den fingerprint
  data.sequences.push({ ts: Date.now(), call, normalized: norm });
  // Maksimum 1000 son çağrı tut
  if (data.sequences.length > 1000) {
    data.sequences = data.sequences.slice(-1000);
  }
  data.stats.totalCalls++;

  // Tüm sequence'leri grupla
  const fpCounts = {};
  for (let i = 0; i < data.sequences.length; i++) {
    // Her pencere boyutu için fingerprint
    for (let win = 1; win <= Math.min(WINDOW_SIZE, i + 1); win++) {
      const seq = data.sequences.slice(i - win + 1, i + 1).map(s => s.normalized);
      const fp = fingerprint(seq);
      const hash = fingerprintHash(fp);
      if (!fpCounts[hash]) fpCounts[hash] = { fp, count: 0, first: data.sequences[i - win + 1].ts, last: data.sequences[i].ts };
      fpCounts[hash].count++;
      fpCounts[hash].last = data.sequences[i].ts;
    }
  }

  // MIN_REPETITIONS kez tekrar eden ve son 24 saat içinde pattern var mı?
  const now = Date.now();
  let detected = null;
  for (const [hash, info] of Object.entries(fpCounts)) {
    if (info.count >= MIN_REPETITIONS && (now - info.last) < 7 * 86400000) {
      // Cooldown kontrolü
      if (data.lastProposalAt[hash] && (now - data.lastProposalAt[hash]) < COOLDOWN_MS) continue;
      // Çok genel pattern'leri atla (tek bir tool çağrısı yetmez)
      if (info.fp.split('→').length < 2) continue;
      detected = { hash, ...info };
      data.lastProposalAt[hash] = now;
      data.stats.patternsFound = (data.stats.patternsFound || 0) + 1;
      break;
    }
  }

  savePatterns(data);

  if (detected) {
    const proposal = createProposal(detected);
    return { detected: true, pattern: detected, proposal };
  }

  return { detected: false };
}

/**
 * Pattern'den skill önerisi oluştur.
 */
function createProposal(pattern) {
  const steps = pattern.fp.split('→');
  const tools = steps.map((s, i) => {
    const [name, args] = s.split('|');
    return { step: i + 1, tool: name, argsTemplate: tryParseArgs(args) };
  });
  // İlk tool'un adını skill adı olarak kullanmak mantıklı
  const skillName = suggestSkillName(tools);
  const proposals = loadProposals();
  const proposal = {
    id: `prop-${Date.now().toString(36)}`,
    hash: pattern.hash,
    suggestedName: skillName,
    pattern: pattern.fp,
    count: pattern.count,
    firstSeen: new Date(pattern.first).toISOString(),
    lastSeen: new Date(pattern.last).toISOString(),
    tools,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  proposals.unshift(proposal);
  // Maksimum 50 proposal tut
  saveProposals(proposals.slice(0, 50));
  return proposal;
}

function tryParseArgs(argsStr) {
  try {
    const obj = JSON.parse(argsStr);
    // Hassas alanları placeholder yap
    return obj;
  } catch {
    return argsStr;
  }
}

function suggestSkillName(tools) {
  // İlk 2 tool'u birleştir
  const parts = tools.slice(0, 2).map(t => t.tool.replace(/_/g, '-'));
  return parts.join('-to-').slice(0, 40);
}

/**
 * Bir proposal'dan gerçek SKILL.md oluştur.
 */
function generateSkillMd(proposal) {
  const toolList = proposal.tools.map(t => `- \`${t.tool}\` (step ${t.step})`).join('\n');
  const name = proposal.suggestedName;
  const created = new Date().toISOString().slice(0, 10);

  return `---
name: ${name}
description: Auto-generated skill from repeated tool pattern
metadata: {"natureco": {"auto_generated": true, "created": "${created}", "uses": ${proposal.count}}, "os": ["darwin", "linux", "win32"]}
---

# ${name} (auto-generated)

Bu skill **${proposal.count} kez** tekrar eden bir tool pattern'inden otomatik oluşturuldu.

**Tespit edilen adımlar:**
${toolList}

**Pattern:**
\`\`\`
${proposal.pattern}
\`\`\`

## Kullanım

Bu skill çağrıldığında, yukarıdaki tool dizisi otomatik olarak sırayla çalıştırılır.

\`\`\`
natureco skills run ${name}
\`\`\`

## Detaylar

- İlk tespit: ${proposal.firstSeen}
- Son tespit: ${proposal.lastSeen}
- Pattern hash: \`${proposal.hash}\`

## İyileştirme

Bu skill otomatik oluşturuldu. Daha iyi çalışması için:
1. SKILL.md içeriğini düzenle (description, kullanım notları)
2. Skill'in artık gerekmediğine karar verirsen: \`natureco skills remove ${name}\`
3. Yeniden oluşturmak için: \`natureco skills forget ${proposal.hash}\`
`;
}

/**
 * Proposal'ı kabul et ve SKILL.md olarak kaydet.
 */
function acceptProposal(proposalId) {
  const proposals = loadProposals();
  const idx = proposals.findIndex(p => p.id === proposalId);
  if (idx === -1) return { success: false, reason: 'Proposal bulunamadı' };

  const proposal = proposals[idx];
  const userSkillsDir = path.join(os.homedir(), '.natureco', 'skills');
  if (!fs.existsSync(userSkillsDir)) fs.mkdirSync(userSkillsDir, { recursive: true });

  const skillDir = path.join(userSkillsDir, proposal.suggestedName);
  if (fs.existsSync(skillDir)) {
    return { success: false, reason: `Skill zaten var: ${proposal.suggestedName}` };
  }
  fs.mkdirSync(skillDir, { recursive: true });

  const skillMd = generateSkillMd(proposal);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf8');

  proposals[idx].status = 'accepted';
  proposals[idx].acceptedAt = new Date().toISOString();
  saveProposals(proposals);

  return { success: true, path: path.join(skillDir, 'SKILL.md'), skillName: proposal.suggestedName };
}

/**
 * Proposal'ı reddet.
 */
function rejectProposal(proposalId, reason = '') {
  const proposals = loadProposals();
  const idx = proposals.findIndex(p => p.id === proposalId);
  if (idx === -1) return { success: false };
  proposals[idx].status = 'rejected';
  proposals[idx].rejectedAt = new Date().toISOString();
  proposals[idx].rejectionReason = reason;
  saveProposals(proposals);
  return { success: true };
}

/**
 * Pattern izlemeyi sıfırla.
 */
function reset() {
  if (fs.existsSync(PATTERNS_FILE)) fs.unlinkSync(PATTERNS_FILE);
  if (fs.existsSync(PROPOSALS_FILE)) fs.unlinkSync(PROPOSALS_FILE);
}

module.exports = {
  normalizeCall,
  fingerprint,
  recordCall,
  loadProposals,
  saveProposals,
  acceptProposal,
  rejectProposal,
  generateSkillMd,
  reset,
  MIN_REPETITIONS,
  WINDOW_SIZE,
};
