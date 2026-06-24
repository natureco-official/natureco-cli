/**
 * NatureCo CLI — Audit Log (Phase 2)
 *
 * Tüm kullanıcı işlemlerini (komut, onay, tool call, hata) JSONL olarak kaydeder.
 * Bu log güvenlik denetimi, hata ayıklama ve compliance için kullanılır.
 *
 * Format: Her satır bir JSON objesi. Sıralı append, async-non-blocking.
 *
 * Varsayılan: ~/.natureco/audit/audit-YYYY-MM-DD.jsonl
 * 30 günden eski loglar otomatik temizlenir.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIT_DIR = path.join(os.homedir(), '.natureco', 'audit');
const RETENTION_DAYS = 30;

// Action tipleri
const ACTIONS = {
  COMMAND_RUN:    'command.run',     // Bir CLI komutu çalıştırıldı
  COMMAND_FAIL:   'command.fail',    // Komut hata verdi
  APPROVAL_ASK:   'approval.ask',    // Onay istendi
  APPROVAL_GRANT: 'approval.grant',  // Kullanıcı onayladı
  APPROVAL_DENY:  'approval.deny',   // Kullanıcı reddetti
  TOOL_CALL:      'tool.call',       // Agent bir tool çağırdı
  TOOL_BLOCK:     'tool.block',      // Tehlikeli tool çağrısı engellendi
  AUTH_LOGIN:     'auth.login',      // Login
  AUTH_LOGOUT:    'auth.logout',     // Logout
  SECRET_READ:    'secret.read',     // Secret çözüldü
  SECRET_LEAK:    'secret.leak',     // Potansiyel secret sızıntısı tespit
  CONFIG_CHANGE:  'config.change',   // Config değişti
  CRON_RUN:       'cron.run',        // Cron job çalıştı
  SKILL_INSTALL:  'skill.install',   // Skill yüklendi
  SKILL_AUTO:     'skill.auto',      // Self-evolving skill oluştu
  ERROR:          'error',           // Genel hata
  INFO:           'info',            // Bilgi mesajı
};

let _stream = null;
let _streamPath = null;
let _writeQueue = Promise.resolve();

function ensureDir() {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

function todayFile() {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(AUDIT_DIR, `audit-${d}.jsonl`);
}

function getStream() {
  const target = todayFile();
  if (_stream && target === _streamPath) return _stream;
  if (_stream) {
    try { _stream.end(); } catch {}
  }
  ensureDir();
  _stream = fs.createWriteStream(target, { flags: 'a' });
  _streamPath = target;
  return _stream;
}

/**
 * Ana audit kayıt fonksiyonu. Non-blocking — queue'ya ekler ve döner.
 *
 * @param {string} action - ACTIONS enum'undan
 * @param {object} data - Ek bağlam
 * @returns {Promise<void>}
 */
function log(action, data = {}) {
  ensureDir();
  const entry = {
    ts: new Date().toISOString(),
    pid: process.pid,
    ppid: process.ppid,
    user: os.userInfo().username,
    cwd: process.cwd(),
    argv: process.argv.slice(2).slice(0, 5), // ilk 5 argüman
    action,
    ...data,
  };

  _writeQueue = _writeQueue.then(() => new Promise((resolve) => {
    try {
      const stream = getStream();
      stream.write(JSON.stringify(entry) + '\n', () => resolve());
    } catch (e) {
      // Audit log hatası uygulamayı kıramamalı
      resolve();
    }
  })).catch(() => {});

  return _writeQueue;
}

/**
 * Senkron versiyon — kritik olaylarda çağrılabilir (örn: approval deny).
 * Hata durumunda null döner, exception fırlatmaz.
 */
function logSync(action, data = {}) {
  try {
    ensureDir();
    const entry = {
      ts: new Date().toISOString(),
      pid: process.pid,
      user: os.userInfo().username,
      cwd: process.cwd(),
      action,
      ...data,
    };
    fs.appendFileSync(todayFile(), JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Tüm log dosyalarını döner — gün ismine göre sıralı.
 */
function listLogFiles() {
  ensureDir();
  return fs.readdirSync(AUDIT_DIR)
    .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'))
    .sort()
    .reverse();
}

/**
 * Belirli bir günün loglarını parse eder.
 */
function readLog(dateStr) {
  const file = path.join(AUDIT_DIR, `audit-${dateStr}.jsonl`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Retention temizliği — RETENTION_DAYS günden eski dosyaları siler.
 */
function cleanup() {
  ensureDir();
  const cutoff = Date.now() - RETENTION_DAYS * 86400 * 1000;
  let removed = 0;
  for (const file of fs.readdirSync(AUDIT_DIR)) {
    if (!file.startsWith('audit-') || !file.endsWith('.jsonl')) continue;
    const filePath = path.join(AUDIT_DIR, file);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) {
      try { fs.unlinkSync(filePath); removed++; } catch {}
    }
  }
  return removed;
}

/**
 * Basit istatistik — son 24 saatte hangi actionlar kaç kez?
 */
function stats24h() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const entries = [...readLog(today), ...readLog(yesterday)];
  const counts = {};
  for (const e of entries) {
    counts[e.action] = (counts[e.action] || 0) + 1;
  }
  return { total: entries.length, byAction: counts, period: `${yesterday} → ${today}` };
}

/**
 * Flush — bekleyen yazma işlemlerini tamamla. Çıkışta çağrılır.
 */
async function flush() {
  await _writeQueue;
  if (_stream) {
    return new Promise((resolve) => _stream.end(resolve));
  }
}

module.exports = {
  ACTIONS,
  log,
  logSync,
  listLogFiles,
  readLog,
  cleanup,
  stats24h,
  flush,
  AUDIT_DIR,
};
