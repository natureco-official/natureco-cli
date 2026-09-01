const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const inquirer = require('./inquirer-wrapper');
const { NatureCoError } = require('./errors');
// readJsonSafeSync BİLİNÇLİ olarak kullanılmıyor: bozuk politika dosyasında
// sessizce varsayılana düşüyordu ve o varsayılan en izinli moddu (security:full).
// loadApprovals artık hatayı görünür kılıp kısıtlayıcı tarafa düşüyor.
const { writeJsonAtomicSync } = require('./atomic-file');

const APPROVALS_FILE = path.join(os.homedir(), '.natureco', 'exec-approvals.json');
const DEFAULT_TIMEOUT_MS = 1800000; // 30 min

// 0o600 = owner read/write only. The allowlist controls which commands
// auto-execute without prompting; on a shared machine, world-read leaks
// the user's automation surface and world-write lets another local
// account inject auto-approved commands. Treat it like ssh keys.
const APPROVALS_FILE_MODE = 0o600;
const APPROVALS_DIR_MODE = 0o700;

function _emptyApprovals() {
  return { version: 1, defaults: { security: 'full', ask: 'off' }, agents: {} };
}

class ExecApprovalError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.command = options.command || null;
  }
}

// -- Data types --

/**
 * @typedef {'deny'|'allowlist'|'full'} ExecSecurity
 * @typedef {'off'|'on-miss'|'always'} ExecAsk
 * @typedef {'deny'|'allowlist'|'ask'|'auto'|'full'} ExecMode
 * @typedef {{ id?: string, pattern: string, argPattern?: string, source?: string, lastUsedAt?: string, lastUsedCommand?: string }} AllowlistEntry
 * @typedef {{ version: 1, defaults?: { security?: ExecSecurity, ask?: ExecAsk }, agents?: Record<string, { security?: ExecSecurity, ask?: ExecAsk, allowlist?: AllowlistEntry[] }> }} ApprovalsFile
 * @typedef {'allow-once'|'allow-always'|'deny'} ApprovalDecision
 */

function getApprovalsPath() {
  return APPROVALS_FILE;
}

/**
 * Politika dosyasını yükler.
 *
 * BOZUK DOSYA SESSİZCE EN İZİNLİ MODA DÜŞMEZ. Eskiden readJsonSafeSync
 * ayrıştırma hatasını yutup `_emptyApprovals()` döndürüyordu; onun varsayılanı
 * `security: 'full'`, yani "hiçbir komutu sorma". Sonuç: bozulmuş bir politika
 * dosyası, hiç uyarı vermeden tüm komut onayını devre dışı bırakıyordu.
 * (Gerçek bir makinede tam olarak bu görüldü: dosya iki aydır `{not json`
 * içeriyordu ve kullanıcı politikası olduğunu sanıyordu.)
 *
 * Artık: dosya varsa ama okunamıyorsa yüksek sesle uyarılır ve `ask`'e düşülür.
 * Bir güvenlik politikası bozulduğunda kapalı tarafa düşmelidir.
 */
function loadApprovals() {
  const fs = require('fs');
  if (!fs.existsSync(APPROVALS_FILE)) return _emptyApprovals();

  const bozuk = { version: 1, defaults: { security: 'allowlist', ask: 'always' }, agents: {}, _bozuk: true };
  let ham;
  try {
    ham = fs.readFileSync(APPROVALS_FILE, 'utf8');
  } catch (e) {
    console.error(`⚠️  Onay politikası okunamadı (${APPROVALS_FILE}): ${e.message}`);
    console.error('    Güvenli tarafa düşülüyor: her komut için onay istenecek.');
    return bozuk;
  }
  try {
    const veri = JSON.parse(ham);
    if (!veri || typeof veri !== 'object') throw new Error('nesne değil');
    return veri;
  } catch (e) {
    console.error(`⚠️  Onay politikası bozuk (${APPROVALS_FILE}): ${e.message}`);
    console.error('    Güvenli tarafa düşülüyor: her komut için onay istenecek.');
    console.error('    Düzeltmek için: natureco approvals status');
    return bozuk;
  }
}

function saveApprovals(data) {
  const dir = path.dirname(APPROVALS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: APPROVALS_DIR_MODE });
  } else {
    // Tighten the dir even if it pre-existed with looser bits.
    try { fs.chmodSync(dir, APPROVALS_DIR_MODE); } catch { /* best-effort */ }
  }
  writeJsonAtomicSync(APPROVALS_FILE, data, { mode: APPROVALS_FILE_MODE });
  // Tighten the file even if it pre-existed with looser bits (the rename
  // in writeJsonAtomicSync preserves the temp's mode, but only when we
  // pass it through — defensively chmod again in case of older installs).
  try { fs.chmodSync(APPROVALS_FILE, APPROVALS_FILE_MODE); } catch { /* best-effort */ }
}

function resolveEffectivePolicy(agentId) {
  const file = loadApprovals();
  const defaults = file.defaults || { security: 'full', ask: 'off' };
  if (!agentId || !file.agents?.[agentId]) {
    return { security: defaults.security || 'full', ask: defaults.ask || 'off', allowlist: [] };
  }
  const agent = file.agents[agentId];
  return {
    security: agent.security || defaults.security || 'full',
    ask: agent.ask || defaults.ask || 'off',
    allowlist: agent.allowlist || [],
  };
}

/**
 * security + ask → etkin mod.
 *
 * TANINMAYAN DEĞER ARTIK `full`'E DÜŞMEZ. Eski son satır `return 'full'` idi;
 * yani bir yazım hatası ("ful", "auto"), boş dizge ya da tanımsız değer sessizce
 * "hiçbir komutu sorma"ya dönüşüyordu. Bir güvenlik ayarının en izinli moda
 * kaza eseri düşmesi, ayarın kendisini anlamsız kılar.
 *
 * `full` yalnızca AÇIKÇA yazıldığında geçerlidir. Tanınmayan değer `ask`'e
 * düşer ve bir kez uyarılır (uyarı komut başına değil, süreç başına).
 */
const _uyarilanModlar = new Set();
function resolveMode(security, ask) {
  if (security === 'deny') return 'deny';
  if (security === 'allowlist' && ask === 'always') return 'ask';
  if (security === 'allowlist') return 'allowlist';
  if (security === 'full') return 'full';

  const etiket = String(security ?? '(tanımsız)');
  if (!_uyarilanModlar.has(etiket)) {
    _uyarilanModlar.add(etiket);
    console.error(`⚠️  Bilinmeyen güvenlik politikası: ${etiket}. Geçerli değerler: deny, allowlist, full.`);
    console.error('    Güvenli tarafa düşülüyor: her komut için onay istenecek.');
  }
  return 'ask';
}

function matchAllowlist(entries, command) {
  if (!entries || !command) return null;
  for (const entry of entries) {
    try {
      const pattern = new RegExp(entry.pattern, 'i');
      if (pattern.test(command)) {
        if (entry.argPattern) {
          const argRe = new RegExp(entry.argPattern, 'i');
          const args = command.split(/\s+/).slice(1).join(' ');
          if (!argRe.test(args)) continue;
        }
        return entry;
      }
    } catch {}
  }
  return null;
}

function requiresApproval({ command, agentId, security, ask }) {
  const policy = resolveEffectivePolicy(agentId);
  const mode = resolveMode(security || policy.security, ask || policy.ask);

  if (mode === 'deny') return { required: true, reason: 'deny' };
  if (mode === 'full') return { required: false, reason: 'full' };

  // Check allowlist
  const match = matchAllowlist(policy.allowlist, command);
  if (match) return { required: false, reason: 'allowlist', entry: match };

  if (mode === 'allowlist') return { required: true, reason: 'not-in-allowlist' };
  if (mode === 'ask') return { required: true, reason: 'ask' };

  return { required: true, reason: 'unknown' };
}

// Built-in safe commands that never need approval.
// v5.43 GÜVENLİK: 'node -e' KALDIRILDI — inline eval (`node -e "require('fs').rmSync..."`)
// keyfi kod çalıştırır, asla "safe" olamaz. Sadece salt-okunur/versiyon komutları kalır.
const SAFE_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'date', 'whoami',
  'node -v', 'npm -v', 'git status', 'git diff', 'git log',
]);

// Shell metakarakterleri: komut zincirleme / substitution / yönlendirme.
// Bunlardan biri varsa komut ASLA "safe" sayılmaz (ör. "echo hi; rm -rf ~").
const SHELL_METACHARS = /[;&|`$(){}<>\n\r]|\|\||&&/;

function isSafeCommand(command) {
  const trimmed = (command || '').trim();
  if (!trimmed) return false;
  // v5.43 GÜVENLİK: metakarakter içeren hiçbir komut safe değil — prefix bypass'ı kapatır.
  if (SHELL_METACHARS.test(trimmed)) return false;
  if (SAFE_COMMANDS.has(trimmed)) return true;
  // Prefix eşleşmesi ama SADECE kelime sınırında: "echo" → "echo hi" evet, "echoevil" hayır.
  for (const safe of SAFE_COMMANDS) {
    if (trimmed === safe || trimmed.startsWith(safe + ' ')) return true;
  }
  return false;
}

// Known dangerous patterns that should always warn.
//
// Eski liste `^` ile sabitlenmiş ve neredeyse birebir eşleşme arıyordu; ölçümde
// en yaygın yıkıcı varyantların hepsi kaçıyordu:
//   rm -rf /                    -> yakalanıyordu
//   sudo rm -rf /               -> KAÇIYORDU (önek `^`'ı bozuyor)
//   rm -rf / --no-preserve-root -> KAÇIYORDU (sondaki `$` tutmuyor)
//   rm -rf ~  /  rm -rf .  /  rm -rf /*  -> KAÇIYORDU
//   :(){ :|:& };:               -> KAÇIYORDU (desen yanlış yazılmıştı)
// Bu, aracın son savunma hattı: mod `full` olduğunda onay katmanı hiç
// sormadığı için bu liste tek engel oluyor.
//
// Yaklaşım: `^` yerine önek toleranslı eşleşme (sudo/env/zaman ölçer sarmalayıcı
// geçilebilsin) ve varyant toleranslı hedef ifadeleri.
const DANGEROUS_PATTERNS = [
  // rm -rf <kök | ev | kök glob | mevcut dizin | üst dizin>, sıra bağımsız bayraklar
  /(^|[;&|]\s*)(?:sudo\s+|doas\s+|env\s+\S+=\S+\s+)*rm\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(?:-[a-zA-Z-]+\s+)*(?:\/|~|\$HOME|\/\*|\.|\.\.)(\s|$|\/\*)/,
  // biçimlendirme ve ham disk yazımı
  /(^|[;&|]\s*)(?:sudo\s+|doas\s+)*mkfs/,
  /(^|[;&|]\s*)(?:sudo\s+|doas\s+)*dd\s+.*\bof=\/dev\//,
  /(^|[;&|]\s*)>\s*\/dev\/(?:sd|nvme|hd|vd)/,
  // fork bombası — gerçek biçim: :(){ :|:& };:
  /:\s*\(\s*\)\s*\{.*\|.*&\s*\}\s*;\s*:/,
  // geniş izin/sahiplik değişikliği
  /(^|[;&|]\s*)(?:sudo\s+|doas\s+)*chmod\s+(?:-[a-zA-Z]+\s+)*777\s+(?:\/|~|\$HOME)(\s|$)/,
  /(^|[;&|]\s*)(?:sudo\s+|doas\s+)*chown\s+-[a-zA-Z]*R/,
  // indir-ve-çalıştır
  /(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|k|fi)?sh\b/,
  // Windows karşılıkları
  /(^|[;&|]\s*)format\s+[a-zA-Z]:/i,
  /\bRemove-Item\b[^\n]*-Recurse[^\n]*-Force[^\n]*(?:[A-Za-z]:\\?$|[A-Za-z]:\\\*|\$HOME|~)/i,
  /(^|[;&|]\s*)rd\s+\/s\s+\/q\s+[a-zA-Z]:\\?(\s|$)/i,
  // disk bölümleme / önyükleme kaydı
  /(^|[;&|]\s*)(?:sudo\s+|doas\s+)*(?:fdisk|parted|diskpart)\b/i,
];

function isDangerousCommand(command) {
  const d = String(command || '').trim();
  if (!d) return false;
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(d)) return true;
  }
  return false;
}

async function requestUserApproval(command, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, agentId } = options;

  console.log('');
  console.log(chalk.yellow('  ⚠️  Command requires approval'));
  console.log(chalk.gray('  ─'.repeat(30)));
  console.log(chalk.white('  ') + command);
  console.log(chalk.gray('  ─'.repeat(30)));

  const choices = [
    { value: 'allow-once', name: 'Allow once' },
    { value: 'allow-always', name: 'Always allow this command' },
    { value: 'deny', name: 'Deny' },
  ];

  // Add edit option if command is dangerous
  if (options.isDangerous) {
    choices.push({ value: 'edit', name: 'Edit command' });
  }

  process.stdin.resume();
  const { decision } = await inquirer.prompt([{
    type: 'list',
    name: 'decision',
    message: 'What would you like to do?',
    choices,
  }]);

  if (decision === 'edit') {
    const { edited } = await inquirer.prompt([{
      type: 'input',
      name: 'edited',
      message: 'Edit command:',
      default: command,
    }]);
    return { decision: 'allow-once', command: edited };
  }

  if (decision === 'allow-always') {
    addAllowlistEntry(agentId, command);
  }

  return { decision, command };
}

function addAllowlistEntry(agentId, command) {
  const file = loadApprovals();
  if (!file.agents) file.agents = {};
  if (!file.agents[agentId]) file.agents[agentId] = { allowlist: [] };

  // Escape special regex chars in the command for pattern matching
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = {
    id: `auto-${Date.now()}`,
    pattern: `^${escaped}$`,
    source: 'allow-always',
    lastUsedAt: new Date().toISOString(),
    lastUsedCommand: command,
  };

  file.agents[agentId].allowlist.push(entry);
  saveApprovals(file);
}

function setSecurityPolicy(agentId, options = {}) {
  const file = loadApprovals();
  if (!file.agents) file.agents = {};
  if (!file.agents[agentId]) file.agents[agentId] = {};

  if (options.security) file.agents[agentId].security = options.security;
  if (options.ask !== undefined) file.agents[agentId].ask = options.ask;

  saveApprovals(file);
}

async function checkCommand(command, options = {}) {
  const { agentId = 'default' } = options;

  // Empty command
  if (!command || !command.trim()) {
    return { allowed: false, reason: 'empty' };
  }

  // Check if safe
  if (isSafeCommand(command)) {
    return { allowed: true, reason: 'safe-command' };
  }

  // Check if dangerous
  const dangerous = isDangerousCommand(command);
  const policy = resolveEffectivePolicy(agentId);
  const mode = resolveMode(policy.security, policy.ask);

  if (mode === 'deny') {
    return { allowed: false, reason: 'denied-by-policy', policy };
  }

  // Check allowlist
  const match = matchAllowlist(policy.allowlist, command);
  if (match) {
    return { allowed: true, reason: 'allowlist', entry: match };
  }

  if (mode === 'allowlist') {
    return { allowed: false, reason: 'not-in-allowlist', policy };
  }

  if (mode === 'ask') {
    const result = await requestUserApproval(command, { ...options, isDangerous: dangerous });
    return {
      allowed: result.decision === 'allow-once' || result.decision === 'allow-always',
      reason: result.decision,
      editedCommand: result.command,
    };
  }

  // Full mode - always allow
  return { allowed: true, reason: 'full-mode' };
}

function listAllowlist(agentId) {
  const policy = resolveEffectivePolicy(agentId);
  return policy.allowlist || [];
}

function removeAllowlistEntry(agentId, entryId) {
  const file = loadApprovals();
  if (!file.agents?.[agentId]?.allowlist) return false;
  const before = file.agents[agentId].allowlist.length;
  file.agents[agentId].allowlist = file.agents[agentId].allowlist.filter(e => e.id !== entryId);
  saveApprovals(file);
  return file.agents[agentId].allowlist.length < before;
}

module.exports = {
  ExecApprovalError,
  loadApprovals,
  saveApprovals,
  resolveEffectivePolicy,
  resolveMode,
  matchAllowlist,
  requiresApproval,
  isSafeCommand,
  isDangerousCommand,
  requestUserApproval,
  addAllowlistEntry,
  setSecurityPolicy,
  checkCommand,
  listAllowlist,
  removeAllowlistEntry,
  getApprovalsPath,
  DANGEROUS_PATTERNS,
  SAFE_COMMANDS,
  APPROVALS_FILE,
  APPROVALS_FILE_MODE,
  APPROVALS_DIR_MODE,
};
