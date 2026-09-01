/**
 * permissions — Granular tool-level allow/deny rules (Claude Code style)
 *
 * Config format (~/.natureco/config.json or .natureco/config.json):
 *   "permissions": {
 *     "Read(~/.ssh/**)": { "action": "deny", "reason": "SSH keys are sensitive" },
 *     "Read(~/.aws/**)": "deny",
 *     "Edit(.env*)": { "action": "ask", "reason": "Review env changes" },
 *     "Bash(npm *)": "ask",
 *     "Bash(rm *rf *)": "deny"
 *   }
 *
 * Resolution order (first match wins):
 *   1. Config permissions (deny > ask > allow)
 *   2. Built-in high-risk patterns (assessRisk in code_v5)
 *   3. Default: allow
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { matchGlob, flattenArgs } = require('./tool-hooks');

/**
 * Dokümante edilen kısa adlar → gerçek araç adları.
 *
 * Docblock'taki örnekler (`Read(~/.ssh/**)`, `Bash(npm *)`) HİÇ ÇALIŞMIYORDU:
 * karşılaştırma `rule.toolName !== toolName` ile birebir ve büyük-küçük harf
 * duyarlıydı, gerçek araç adları ise `read_file` / `bash` / `edit_file`.
 * Yani kullanıcı SSH anahtarlarını koruduğunu sanıyor, kural hiçbir zaman
 * eşleşmiyordu. Kısa adlar artık gerçek araçlara açıkça bağlanıyor.
 */
const ARAC_TAKMA_ADLARI = {
  read: ['read_file', 'list_dir', 'grep', 'glob'],
  edit: ['edit_file', 'write_file', 'multi_edit'],
  write: ['write_file', 'edit_file'],
  bash: ['bash', 'shell_command', 'code_execution'],
  shell: ['bash', 'shell_command'],
  webfetch: ['web_fetch', 'http_request'],
  websearch: ['web_search', 'duckduckgo_search'],
};

/** Kural adı bu araç çağrısını kapsıyor mu (takma ad ve harf duyarsızlık dahil). */
function aracEslesir(kuralAdi, toolName) {
  if (kuralAdi === '*') return true;
  if (kuralAdi === toolName) return true;
  const k = String(kuralAdi).toLowerCase();
  if (k === String(toolName).toLowerCase()) return true;
  const hedefler = ARAC_TAKMA_ADLARI[k];
  return Array.isArray(hedefler) && hedefler.includes(toolName);
}

function loadPermissionRules() {
  const rules = [];
  const sources = [
    path.join(os.homedir(), '.natureco', 'config.json'),
    path.join(process.cwd(), '.natureco', 'config.json'),
  ];
  for (const cfgPath of sources) {
    try {
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg.permissions) {
          for (const [pattern, value] of Object.entries(cfg.permissions)) {
            const parsed = parsePermissionRule(pattern, value);
            if (parsed) {
              rules.push(parsed);
            } else {
              // SESSİZCE DÜŞÜRME. Ayrıştırılamayan bir kural, checkPermission'ın
              // varsayılanı 'allow' olduğu için sessizce "izin ver"e dönüşüyordu:
              // yani hatalı yazılmış bir "deny" kuralı korumayı kaldırıyordu.
              console.error(`⚠️  Geçersiz izin kuralı yok sayıldı: ${JSON.stringify(pattern)}`);
              console.error('    Beklenen biçim: Arac(desen)  ör. Read(~/.ssh/**), Bash(npm *), *');
            }
          }
        }
      }
    } catch (e) {
      console.error(`⚠️  İzin kuralları okunamadı (${cfgPath}): ${e.message}`);
    }
  }
  return rules;
}

function parsePermissionRule(pattern, value) {
  // Araç adında TİRE ve RAKAM da geçerlidir. Eski desen [a-zA-Z_]+ idi ve
  // MCP araçları tam olarak bu yüzden düşüyordu: mcp-tools.js:24 adları
  // `mcp__<sunucu>__<arac>` biçiminde üretiyor ve tire/rakamı koruyor.
  // Yani "mcp__brave-search__web_search(*)": "deny" gibi bir kural hiç
  // yüklenmiyor, checkPermission de eşleşme bulamayınca 'allow' dönüyordu.
  const match = pattern.match(/^(\*|[A-Za-z0-9_][A-Za-z0-9_-]*)\((.+)\)$/);
  if (!match && pattern !== '*') return null;
  const toolName = match ? match[1] : '*';
  const glob = match ? match[2] : '*';

  let action, reason;
  if (typeof value === 'string') {
    action = value;
  } else if (value && typeof value === 'object') {
    action = value.action || 'ask';
    reason = value.reason;
  }
  if (!['allow', 'deny', 'ask'].includes(action)) action = 'ask';

  return { toolName, glob, action, reason, raw: pattern };
}

/**
 * Check permissions for a tool call.
 * Returns { action: 'allow'|'deny'|'ask', reason, rule }
 */
function checkPermission(toolName, args) {
  const rules = loadPermissionRules();
  const flat = flattenArgs(args);

  for (const rule of rules) {
    if (!aracEslesir(rule.toolName, toolName)) continue;

    // `~` iki biçimde de karşılanır. Argüman bazen genişletilmiş mutlak yol
    // (/home/kullanici/.ssh/id_rsa), bazen ham tilde (~/.ssh/id_rsa) olarak
    // gelir; yalnızca birini denemek kuralı sessizce etkisiz bırakır.
    const duzFlat = String(flat).replace(/\\/g, '/');
    const globlar = [rule.glob];
    if (rule.glob.startsWith('~')) {
      globlar.push(path.join(os.homedir(), rule.glob.slice(1)).replace(/\\/g, '/'));
    }

    const matchesGlob = globlar.some(g =>
      g === '*'
      || matchGlob(duzFlat, g) || matchGlob(toolName, g)
      // Argüman düzleştirmesi birden çok alanı birleştirdiği için tam eşleşme
      // çoğu zaman tutmaz; desen argümanın İÇİNDE geçiyorsa da kural işler.
      || matchGlob(duzFlat, '*' + g + '*'));
    if (!matchesGlob) continue;
    if (rule.action === 'deny') {
      return { action: 'deny', reason: rule.reason || `Engellendi: ${rule.raw}`, rule };
    }
    if (rule.action === 'ask') {
      return { action: 'ask', reason: rule.reason || `Onay gerekli: ${rule.raw}`, rule };
    }
    if (rule.action === 'allow') {
      return { action: 'allow', reason: '', rule };
    }
  }

  return { action: 'allow', reason: '', rule: null };
}

/**
 * Persistent permission approvals (session + disk cache).
 */
const _permSessionCache = new Map();

function loadPersistentApprovals() {
  try {
    const f = path.join(os.homedir(), '.natureco', 'perm-approvals.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  return {};
}

function savePersistentApproval(key) {
  try {
    const f = path.join(os.homedir(), '.natureco', 'perm-approvals.json');
    const data = loadPersistentApprovals();
    data[key] = { approved: true, at: Date.now() };
    const dir = path.dirname(f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}

function isApproved(key) {
  if (_permSessionCache.get(key) === true) return true;
  const persistent = loadPersistentApprovals();
  if (persistent[key]?.approved) {
    _permSessionCache.set(key, true);
    return true;
  }
  return false;
}

function markApproved(key, persistent = false) {
  _permSessionCache.set(key, true);
  if (persistent) savePersistentApproval(key);
}

/**
 * Format a tool call for permission display.
 */
function formatPermissionPrompt(toolName, args, reason) {
  const parts = Object.entries(args || {}).map(([k, v]) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  });
  return `${toolName}(${parts.join(', ')})`;
}

module.exports = {
  checkPermission,
  loadPermissionRules,
  isApproved,
  markApproved,
  formatPermissionPrompt,
};
