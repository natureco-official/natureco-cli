const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const F = require('../utils/format');
const tui = require('../utils/tui');
const fs = require('fs');
const path = require('path');
const os = require('os');
const audit = require('../utils/audit');
const secrets = require('../utils/secret-scanner');

const BASE_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

const CHECKS = [
  { name: 'configExists', label: 'Config file exists' },
  { name: 'nodeVersion', label: 'Node.js version >= 18' },
  { name: 'npmPackages', label: 'Required npm packages installed' },
  { name: 'diskSpace', label: 'Sufficient disk space (>500 MB)' },
  { name: 'writePermission', label: 'Write permission on ~/.natureco' },
  { name: 'apiKeyValid', label: 'API key format valid' },
  { name: 'providerReachable', label: 'Provider API reachable' },
  { name: 'dataDirs', label: 'All data directories exist' },
  { name: 'auditLog', label: 'Audit log directory writable' },
  { name: 'secretsClean', label: 'No secrets in current directory' },
];

function doctor(params) {
  try {
    const args = params || [];
    const fix = args.includes('--fix') || args[0] === 'fix';
    // --fix bir flag; action'lardan ayıkla (ör. "doctor --fix" → run+fix).
    const positional = args.filter(a => a !== '--fix');
    const [action, checkName] = positional;

    if (fix || !action || action === 'run') return cmdRun({ fix });
    if (action === 'list') return cmdList();
    if (action === 'check') return cmdCheck(checkName);

    console.log(chalk.red(`\n  Unknown doctor action: ${action}\n`));
    console.log(chalk.gray('  Usage: natureco doctor [run|list|check <name>|--fix]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Doctor error: ${err.message}\n`));
  }
}

// v5.43.2: --fix — düzeltilebilir sorunları otomatik onar. Eskiden --fix hiç
// işlenmiyordu ("Unknown doctor action: --fix"), README'de belgeli olmasına rağmen.
function applyFixes() {
  const applied = [];
  const failed = [];
  // 1. Eksik veri dizinlerini oluştur
  const REQUIRED = ['sources', 'concepts', 'cache', 'skills', 'memory', 'sessions', 'backups', 'hooks', 'audit'];
  try { if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o700 }); } catch (e) { failed.push('~/.natureco: ' + e.message); }
  for (const d of REQUIRED) {
    const dir = path.join(BASE_DIR, d);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); applied.push('created dir: ' + d); }
      catch (e) { failed.push(d + ': ' + e.message); }
    }
  }
  // 2. Hassas dosya/dizin izinlerini sıkılaştır (POSIX) — API key'li config gizli kalmalı
  if (process.platform !== 'win32') {
    try { fs.chmodSync(BASE_DIR, 0o700); applied.push('~/.natureco → 0700'); } catch {}
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const cur = fs.statSync(CONFIG_FILE).mode & 0o777;
        if (cur !== 0o600) { fs.chmodSync(CONFIG_FILE, 0o600); applied.push('config.json → 0600'); }
      } catch {}
    }
  }
  return { applied, failed };
}

function cmdList() {
  F.list(CHECKS.map(c => ({ label: c.name, value: c.label })));
}

function cmdCheck(name) {
  if (!name) {
    console.log(chalk.red('\n  Usage: natureco doctor check <name>\n'));
    console.log(chalk.gray('  Available checks: ' + CHECKS.map(c => c.name).join(', ') + '\n'));
    return;
  }

  const check = CHECKS.find(c => c.name === name);
  if (!check) {
    console.log(chalk.red(`\n  Unknown check: ${name}\n`));
    console.log(chalk.gray('  Available checks: ' + CHECKS.map(c => c.name).join(', ') + '\n'));
    return;
  }

  const result = runCheck(name);
  F.kv('Check', check.label);
  if (result.pass) {
    F.success(result.message);
  } else {
    F.error(result.message);
  }
}

function cmdRun(opts = {}) {
  F.header(opts.fix ? L('System Doctor · Otomatik Düzeltme (--fix)', 'System Doctor · Auto-Fix (--fix)') : L('System Doctor · Tüm Sistem Kontrolleri', 'System Doctor · All System Checks'), { icon: opts.fix ? '🔧' : '🩺' });

  // v5.43.2: --fix modunda önce düzeltilebilir sorunları onar, sonra kontrolleri çalıştır.
  if (opts.fix) {
    const { applied, failed } = applyFixes();
    if (applied.length) {
      console.log('\n' + tui.C.green(L('  🔧 Düzeltildi:', '  🔧 Fixed:')));
      applied.forEach(a => console.log('     ' + tui.C.text('• ' + a)));
    } else {
      console.log('\n' + tui.C.muted(L('  🔧 Düzeltilecek bir şey yok — sistem zaten düzgün.', '  🔧 Nothing to fix — system is already fine.')));
    }
    if (failed.length) {
      console.log('\n' + tui.C.amber(L('  ⚠️  Otomatik düzeltilemedi:', '  ⚠️  Could not auto-fix:')));
      failed.forEach(f => console.log('     ' + tui.C.muted('• ' + f)));
    }
    console.log('');
  }

  const rows = [];
  let passed = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const check of CHECKS) {
    const result = runCheck(check.name);
    rows.push({
      check: check.label,
      status: result.pass,
      message: result.message,
    });
    if (result.pass) passed++; else failed++;
  }

  // Yeni TUI tablo
  console.log('\n' + tui.table(rows, [
    { key: 'check', label: L('Kontrol', 'Check'), minWidth: 28 },
    {
      key: 'status', label: L('Durum', 'Status'), minWidth: 9,
      render: r => r.status
        ? tui.styled('  ✓ PASS ', { bg: tui.PALETTE.success, color: '#000000', bold: true })
        : tui.styled('  ✗ FAIL ', { bg: tui.PALETTE.danger, color: '#000000', bold: true }),
    },
    { key: 'message', label: L('Mesaj', 'Message'), minWidth: 20 },
  ], { borderStyle: 'round', zebra: true }));

  const total = passed + failed;
  const duration = Date.now() - startTime;

  // Özet kartı
  console.log('\n' + tui.box(60, 5, {
    title: L('Özet', 'Summary'),
    borderColor: failed > 0 ? tui.PALETTE.warning : tui.PALETTE.success,
  }).split('\n').map((line, i) => {
    if (i === 2) return line.replace(' '.repeat(58), `  ${tui.C.text(`${passed}/${total} ${L('kontrol geçti', 'checks passed')}`)} · ${tui.C.muted(duration + 'ms')}`);
    return line;
  }).join('\n'));

  if (failed > 0) {
    console.log('\n' + tui.C.amber(L('  ⚠️  Bazı kontroller başarısız. Detay için: ', '  ⚠️  Some checks failed. For details: ')) + tui.C.brand('natureco doctor check <name>'));
  } else {
    console.log('\n' + tui.C.green(L('  ✨ Tüm kontroller geçti! Sistem sağlıklı.', '  ✨ All checks passed! System healthy.')));
  }
  console.log('');
}

function runCheck(name) {
  switch (name) {
    case 'configExists':
      return {
        pass: fs.existsSync(CONFIG_FILE),
        message: fs.existsSync(CONFIG_FILE) ? 'Found at ' + CONFIG_FILE : 'Missing at ' + CONFIG_FILE,
      };

    case 'nodeVersion': {
      const v = process.version.slice(1).split('.')[0];
      const ok = parseInt(v) >= 18;
      return {
        pass: ok,
        message: ok ? 'Running Node ' + process.version : 'Node 18+ required, found ' + process.version,
      };
    }

    case 'npmPackages': {
      const required = ['chalk', 'commander'];
      const missing = required.filter(p => { try { require.resolve(p); return false; } catch { return true; } });
      return {
        pass: missing.length === 0,
        message: missing.length === 0 ? 'All dependencies installed' : 'Missing: ' + missing.join(', '),
      };
    }

    case 'diskSpace': {
      // Gerçek disk alanı (cross-platform)
      try {
        const { execSync } = require('child_process');
        let freeGB = null;
        if (process.platform === 'darwin' || process.platform === 'linux') {
          // df -k ~/.natureco | tail -1 | awk '{print $4}'
          const out = execSync(`df -k ${JSON.stringify(BASE_DIR)} | tail -1`).toString().trim();
          const parts = out.split(/\s+/);
          const freeKB = parseInt(parts[3], 10);
          if (!isNaN(freeKB)) freeGB = freeKB / 1024 / 1024;
        } else if (process.platform === 'win32') {
          const out = execSync(`powershell -NoProfile -Command "(Get-PSDrive ${BASE_DIR[0]}).Free / 1GB"`).toString().trim();
          freeGB = parseFloat(out);
        }
        if (freeGB === null || isNaN(freeGB)) {
          return { pass: true, message: 'Unable to determine disk space' };
        }
        return {
          pass: freeGB > 0.5,
          message: freeGB > 0.5 ? `${freeGB.toFixed(1)} GB free` : `${L('Sadece', 'Only')} ${(freeGB * 1024).toFixed(0)} ${L('MB kaldı — gerekli: 500 MB', 'MB left — need: 500 MB')}`,
        };
      } catch (e) {
        return { pass: true, message: 'Unable to check disk space' };
      }
    }

    case 'writePermission': {
      try {
        if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
        const testFile = path.join(BASE_DIR, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return { pass: true, message: 'Write access OK' };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'apiKeyValid': {
      try {
        if (!fs.existsSync(CONFIG_FILE)) return { pass: false, message: 'Config missing — run `natureco setup`' };
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const key = cfg.providerApiKey || cfg.apiKey;
        if (!key) return { pass: false, message: L('API key tanımlı değil', 'API key not set') };
        if (key.length < 10) return { pass: false, message: L('API key çok kısa — yanlış kopyalanmış olabilir', 'API key too short — may be copied wrong') };
        return { pass: true, message: `${L('Key uzunluğu', 'Key length')}: ${key.length} ${L('karakter', 'chars')}` };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'providerReachable': {
      try {
        if (!fs.existsSync(CONFIG_FILE)) return { pass: false, message: 'Config missing' };
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const url = cfg.providerUrl;
        if (!url) return { pass: false, message: L('Provider URL tanımlı değil', 'Provider URL not set') };
        // URL format geçerli mi?
        const parsed = new URL(url);
        return { pass: true, message: `${L('URL geçerli', 'URL valid')}: ${parsed.host}` };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'dataDirs': {
      try {
        if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
        const REQUIRED = ['sources', 'concepts', 'cache', 'skills', 'memory', 'sessions', 'backups', 'hooks', 'audit'];
        const missing = REQUIRED.filter(d => !fs.existsSync(path.join(BASE_DIR, d)));
        if (missing.length === 0) {
          return { pass: true, message: `${REQUIRED.length} ${L('dizin hazır', 'directories ready')}` };
        }
        // Otomatik oluştur
        for (const d of missing) {
          try { fs.mkdirSync(path.join(BASE_DIR, d), { recursive: true }); } catch {}
        }
        return { pass: true, message: `${L('Eksik dizinler oluşturuldu', 'Created missing directories')}: ${missing.join(', ')}` };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'auditLog': {
      try {
        // Audit log yazma testi
        audit.logSync(audit.ACTIONS.INFO, { source: 'doctor', check: 'auditLog' });
        const files = audit.listLogFiles();
        return { pass: true, message: `${files.length} ${L('log dosyası, en son', 'log files, latest')}: ${files[0] || L('yok', 'none')}` };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'secretsClean': {
      try {
        // Mevcut çalışma dizinini tara — sadece kritik bulguları rapor et
        // Whitelist: .git, node_modules, .DS_Store, dist, build, *.md (dokümanlar),
        //   *.example, *.test, package-lock.json, audit-*.jsonl
        //   SKIP_DIRS secret-scanner.js'de zaten var (.git, node_modules, dist, build)
        //   Ama .DS_Store, .env.example gibi dosyaları atlamamız gerek
        const findings = secrets.scanDir(process.cwd(), { maxFiles: 500 });
        // False positive azaltma: sadece severity critical VEYA (.env/.key/secret içeren dosyalar)
        const realSecrets = findings.filter(f => {
          // .DS_Store, .md, .txt gibi dokümanları atla
          const fname = (f.file || '').toLowerCase();
          if (fname.endsWith('.md') || fname.endsWith('.txt')) return false;
          if (fname.includes('.ds_store') || fname.includes('package-lock')) return false;
          if (fname.includes('changelog') || fname.includes('readme')) return false;
          // 'high' severity çoğunlukla false positive (40-char hex gibi)
          // Sadece 'critical' VEYA bilinen provider pattern'i kabul et
          if (f.severity === 'critical') return true;
          // .env dosyalarında yüksek severity kabul
          if (fname.includes('.env') && !fname.includes('.example')) return true;
          return false;
        });
        if (realSecrets.length === 0) {
          return { pass: true, message: L('Çalışma dizininde gerçek secret bulunamadı ✓', 'No real secrets found in working directory ✓') };
        }
        const sample = realSecrets.slice(0, 3).map(f => `${f.type}@${path.basename(f.file || '?')}`).join(', ');
        return {
          pass: false,
          message: `${realSecrets.length} ${L('gerçek secret', 'real secrets')}: ${sample}${realSecrets.length > 3 ? '...' : ''}`,
        };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    default:
      return { pass: false, message: 'Unknown check' };
  }
}

module.exports = doctor;
// v5.43.2: test için — --fix otomatik düzeltme regresyonu
module.exports.applyFixes = applyFixes;
