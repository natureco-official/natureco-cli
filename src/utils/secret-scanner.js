/**
 * NatureCo CLI — Secret Scanner (Phase 2)
 *
 * Kod metinlerinde veya dosya içeriklerinde hardcoded API key,
 * token, password gibi hassas verilerin sızmasını önceden tespit eder.
 *
 * OpenClaw'ın en büyük güvenlik açıklarından biri buydu —
 * kullanıcı farkında olmadan key'ini GitHub'a push'luyordu.
 *
 * Bu modül:
 * - Statik metin tarama (regex)
 * - Entropy analizi (rastgele yüksek entropi = muhtemelen secret)
 * - Dosya tarama (skip: .git, node_modules, .natureco, lock dosyaları)
 * - Pre-commit hook entegrasyonu için tasarlandı
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Bilinen secret pattern'leri — provider/format eşleşmesi
const SECRET_PATTERNS = [
  { name: 'OpenAI', regex: /\bsk-[A-Za-z0-9]{20,}(?:T3BlbkFJ[A-Za-z0-9]{20,})?/g, severity: 'critical' },
  { name: 'Anthropic', regex: /\bsk-ant-[A-Za-z0-9-]{20,}/g, severity: 'critical' },
  { name: 'Groq', regex: /\bgsk_[A-Za-z0-20]{20,}/g, severity: 'critical' },
  { name: 'Google API', regex: /\bAIza[A-Za-z0-9_-]{35}/g, severity: 'critical' },
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { name: 'AWS Secret Key', regex: /\b[A-Za-z0-9/+=]{40}\b/g, severity: 'high' }, // false positive riski yüksek
  { name: 'GitHub Token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,}/g, severity: 'critical' },
  { name: 'GitHub Fine-grained', regex: /\bgithub_pat_[A-Za-z0-9_]{82}/g, severity: 'critical' },
  { name: 'Slack Token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, severity: 'critical' },
  { name: 'Stripe Live', regex: /\bsk_live_[A-Za-z0-9]{24,}/g, severity: 'critical' },
  { name: 'Stripe Test', regex: /\bsk_test_[A-Za-z0-9]{24,}/g, severity: 'medium' },
  { name: 'Tavily', regex: /\btvly-[A-Za-z0-9_-]{20,}/g, severity: 'critical' },
  { name: 'OpenAI Project', regex: /\bsk-proj-[A-Za-z0-9_-]{20,}/g, severity: 'critical' },
  { name: 'HuggingFace', regex: /\bhf_[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'Replicate', regex: /\br8_[A-Za-z0-9]{40,}/g, severity: 'critical' },
  { name: 'Firecrawl', regex: /\bfc-[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'NatureCo', regex: /\bnc_[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'NatureCo Legacy', regex: /\bnco_[A-Za-z0-9]{20,}/g, severity: 'critical' },
  { name: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, severity: 'high' },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, severity: 'critical' },
  { name: 'Generic Password Assignment', regex: /(?:password|passwd|pwd|secret)\s*[=:]\s*['"]([^'"]{8,})['"]/gi, severity: 'medium' },
  { name: 'Bearer Token', regex: /\bBearer\s+[A-Za-z0-9_-]{20,}/g, severity: 'high' },
];

// Tarama dışı dosyalar
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.natureco', 'dist', 'build',
  'coverage', '.next', '.cache', '.venv', 'venv',
]);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.tar', '.gz',
  '.mp4', '.mp3', '.mov', '.ico', '.woff', '.woff2', '.ttf',
  '.lock', '.bin', '.exe', '.dmg', '.dylib', '.so',
]);

// Entropy hesaplama (Shannon)
function shannonEntropy(str) {
  if (!str || str.length < 16) return 0;
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  let entropy = 0;
  const len = str.length;
  for (const c in freq) {
    const p = freq[c] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Bir metin parçasını tarar, bulunan secret'ları döner.
 */
function scanText(text, options = {}) {
  const { minEntropy = 4.0 } = options;
  const findings = [];

  for (const { name, regex, severity } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      findings.push({
        type: name,
        severity,
        match: redactSecret(m[0]),
        index: m.index,
      });
      if (!regex.global) break;
    }
  }

  // Entropy tabanlı genel tarama (bilinmeyen format)
  // Yüksek entropili 32+ karakterlik ardışık dizileri yakala
  const highEntropyRe = /[A-Za-z0-9_\-+/=]{32,}/g;
  let m;
  while ((m = highEntropyRe.exec(text)) !== null) {
    const candidate = m[0];
    if (shannonEntropy(candidate) >= minEntropy) {
      // Zaten bilinen bir pattern tarafından yakalanmadıysa ekle
      if (!findings.some(f => Math.abs(f.index - m.index) < 10)) {
        findings.push({
          type: 'HighEntropyString',
          severity: 'low',
          match: redactSecret(candidate),
          entropy: shannonEntropy(candidate).toFixed(2),
          index: m.index,
        });
      }
    }
  }

  return findings;
}

/**
 * Secret'ı güvenli şekilde maskele (ilk 4 + son 4 karakter, ortası ***).
 */
function redactSecret(secret) {
  if (!secret || secret.length < 12) return '***';
  return secret.slice(0, 4) + '***' + secret.slice(-4);
}

/**
 * Bir dosyayı tara.
 */
function scanFile(filePath, options = {}) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 5 * 1024 * 1024) return []; // 5 MB'dan büyük dosyaları atla
    const content = fs.readFileSync(filePath, 'utf8');
    const findings = scanText(content, options);
    return findings.map(f => ({ ...f, file: filePath, line: lineFromIndex(content, f.index) }));
  } catch {
    return [];
  }
}

function lineFromIndex(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

/**
 * Bir dizini recursive olarak tara.
 */
function scanDir(dirPath, options = {}) {
  const { maxFiles = 10000 } = options;
  const findings = [];
  let count = 0;

  function walk(dir) {
    if (count >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (count >= maxFiles) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SKIP_EXT.has(ext)) continue;
        findings.push(...scanFile(p));
        count++;
      }
    }
  }
  walk(dirPath);
  return findings;
}

/**
 * Tarama sonuçlarını kritik/yüksek/orta/düşük olarak özetler.
 */
function summarize(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}

/**
 * Hızlı tahlil — verilen bir dizinde tarama yapar ve özet döner.
 */
function quickScan(dirPath) {
  const findings = scanDir(dirPath);
  return {
    dir: dirPath,
    timestamp: new Date().toISOString(),
    findings,
    summary: summarize(findings),
  };
}

module.exports = {
  scanText,
  scanFile,
  scanDir,
  summarize,
  quickScan,
  shannonEntropy,
  redactSecret,
  SECRET_PATTERNS,
};
