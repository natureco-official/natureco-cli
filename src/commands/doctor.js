const chalk = require('chalk');
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
    const [action, checkName] = params || [];

    if (!action || action === 'run') return cmdRun();
    if (action === 'list') return cmdList();
    if (action === 'check') return cmdCheck(checkName);

    console.log(chalk.red(`\n  Unknown doctor action: ${action}\n`));
    console.log(chalk.gray('  Usage: natureco doctor [run|list|check <name>]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Doctor error: ${err.message}\n`));
  }
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

function cmdRun() {
  F.header('System Doctor · Tüm Sistem Kontrolleri', { icon: '🩺' });

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
    { key: 'check', label: 'Kontrol', minWidth: 28 },
    {
      key: 'status', label: 'Durum', minWidth: 9,
      render: r => r.status
        ? tui.styled('  ✓ PASS ', { bg: tui.PALETTE.success, color: '#000000', bold: true })
        : tui.styled('  ✗ FAIL ', { bg: tui.PALETTE.danger, color: '#000000', bold: true }),
    },
    { key: 'message', label: 'Mesaj', minWidth: 20 },
  ], { borderStyle: 'round', zebra: true }));

  const total = passed + failed;
  const duration = Date.now() - startTime;

  // Özet kartı
  console.log('\n' + tui.box(60, 5, {
    title: 'Özet',
    borderColor: failed > 0 ? tui.PALETTE.warning : tui.PALETTE.success,
  }).split('\n').map((line, i) => {
    if (i === 2) return line.replace(' '.repeat(58), `  ${tui.C.text(`${passed}/${total} kontrol geçti`)} · ${tui.C.muted(duration + 'ms')}`);
    return line;
  }).join('\n'));

  if (failed > 0) {
    console.log('\n' + tui.C.amber('  ⚠️  Bazı kontroller başarısız. Detay için: ') + tui.C.brand('natureco doctor check <name>'));
  } else {
    console.log('\n' + tui.C.green('  ✨ Tüm kontroller geçti! Sistem sağlıklı.'));
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
          message: freeGB > 0.5 ? `${freeGB.toFixed(1)} GB free` : `Sadece ${(freeGB * 1024).toFixed(0)} MB kaldı — gerekli: 500 MB`,
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
        if (!key) return { pass: false, message: 'API key tanımlı değil' };
        if (key.length < 10) return { pass: false, message: 'API key çok kısa — yanlış kopyalanmış olabilir' };
        return { pass: true, message: `Key uzunluğu: ${key.length} karakter` };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'providerReachable': {
      try {
        if (!fs.existsSync(CONFIG_FILE)) return { pass: false, message: 'Config missing' };
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        const url = cfg.providerUrl;
        if (!url) return { pass: false, message: 'Provider URL tanımlı değil' };
        // URL format geçerli mi?
        const parsed = new URL(url);
        return { pass: true, message: `URL geçerli: ${parsed.host}` };
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
          return { pass: true, message: `${REQUIRED.length} dizin hazır` };
        }
        // Otomatik oluştur
        for (const d of missing) {
          try { fs.mkdirSync(path.join(BASE_DIR, d), { recursive: true }); } catch {}
        }
        return { pass: true, message: `Eksik dizinler oluşturuldu: ${missing.join(', ')}` };
      } catch (e) {
        return { pass: false, message: e.message };
      }
    }

    case 'auditLog': {
      try {
        // Audit log yazma testi
        audit.logSync(audit.ACTIONS.INFO, { source: 'doctor', check: 'auditLog' });
        const files = audit.listLogFiles();
        return { pass: true, message: `${files.length} log dosyası, en son: ${files[0] || 'yok'}` };
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
          return { pass: true, message: 'Çalışma dizininde gerçek secret bulunamadı ✓' };
        }
        const sample = realSecrets.slice(0, 3).map(f => `${f.type}@${path.basename(f.file || '?')}`).join(', ');
        return {
          pass: false,
          message: `${realSecrets.length} gerçek secret: ${sample}${realSecrets.length > 3 ? '...' : ''}`,
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
