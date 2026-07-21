const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig, CONFIG_FILE, CONFIG_DIR } = require('../utils/config');
const { listSecretRefs, resolveSecretRef, coerceSecretRef } = require('../utils/secrets');
const { NatureCoError, handleError } = require('../utils/errors');

async function security(args) {
  args = args || [];
  const [action, ...params] = args;

  if (!action || action === 'audit') return audit(args);

  if (action === 'allowlist') return allowlistAction(args);

  if (action === 'policy') return policyAction(args);

  if (action === 'secrets') return scanSecrets(args);

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco security [audit|allowlist|policy|secrets]\n', '  Usage: natureco security [audit|allowlist|policy|secrets]\n')));
  process.exit(1);
}

async function allowlistAction(args) {
  const { loadApprovals, addAllowlistEntry, listAllowlist, removeAllowlistEntry } = require('../utils/approvals');
  const sub = args[1];

  if (!sub || sub === 'list') {
    const entries = listAllowlist('default');
    console.log('');
    console.log(chalk.cyan.bold('\n  Exec Allowlist\n'));
    if (entries.length === 0) {
      console.log(chalk.gray('  No entries. Add with: natureco security allowlist add "<command>"'));
    } else {
      entries.forEach((e, i) => {
        console.log(chalk.gray(`  ${i + 1}. `) + chalk.white(e.lastUsedCommand || e.pattern));
        console.log(chalk.gray(`     id: ${e.id} · source: ${e.source || 'manual'}`));
      });
    }
    console.log('');
    return;
  }

  if (sub === 'add' && args[2]) {
    addAllowlistEntry('default', args.slice(2).join(' '));
    console.log(chalk.green('\n  ✓ Command added to allowlist\n'));
    return;
  }

  if (sub === 'remove' && args[2]) {
    const removed = removeAllowlistEntry('default', args[2]);
    if (removed) {
      console.log(chalk.green('\n  ✓ Entry removed from allowlist\n'));
    } else {
      console.log(chalk.yellow('\n  ⚠️  Entry not found\n'));
    }
    return;
  }

  console.log(chalk.gray(L('\n  Kullanım:', '\n  Usage:')));
  console.log(chalk.gray('    natureco security allowlist list'));
  console.log(chalk.gray('    natureco security allowlist add "<command>"'));
  console.log(chalk.gray('    natureco security allowlist remove <id>\n'));
}

async function policyAction(args) {
  const { setSecurityPolicy } = require('../utils/approvals');
  const sub = args[1];

  if (sub === 'set' && args[2]) {
    const value = args[2];
    if (['deny', 'allowlist', 'full'].includes(value)) {
      setSecurityPolicy('default', { security: value });
      console.log(chalk.green(`\n  ✓ Security policy set to: ${value}\n`));
    } else {
      console.log(chalk.red(`\n  ❌ Invalid policy: ${value}. Use: deny, allowlist, full\n`));
    }
    return;
  }

  console.log(chalk.gray(L('\n  Kullanım:', '\n  Usage:')));
  console.log(chalk.gray('    natureco security policy set deny|allowlist|full'));
  console.log(chalk.gray('\n  Policy levels:'));
  console.log(chalk.gray('    deny       - Block all command execution'));
  console.log(chalk.gray('    allowlist  - Only allowlisted commands'));
  console.log(chalk.gray('    full       - Allow all commands (default)\n'));
}

async function scanSecrets(args) {
  const config = getConfig();
  const refs = listSecretRefs(config);
  const fix = args.includes('--fix');

  console.log('');
  console.log(chalk.cyan.bold('\n  Secret Reference Scan\n'));

  if (refs.length === 0) {
    console.log(chalk.green('  ✓ No secret references found in config\n'));
    return;
  }

  let resolved = 0;
  let unresolved = 0;

  for (const ref of refs) {
    try {
      const value = resolveSecretRef(ref.ref, { throwOnMissing: true });
      console.log(chalk.green(`  ✓ ${ref.path} → resolved (${ref.ref.source}:${ref.ref.id})`));
      resolved++;
    } catch {
      console.log(chalk.yellow(`  ⚠️  ${ref.path} → ${ref.ref.source}:${ref.ref.id} (unresolved)`));
      unresolved++;
    }
  }

  console.log('');
  console.log(chalk.gray(`  ${resolved} resolved · ${unresolved} unresolved`));

  if (unresolved > 0) {
    console.log(chalk.gray('\n  Set environment variables or use .env file to resolve secrets.\n'));
  }
  console.log('');
}

async function audit(args) {
  const { DANGEROUS_PATTERNS, loadApprovals } = require('../utils/approvals');
  const fix = args.includes('--fix');
  const json = args.includes('--json');

  const issues = [];
  const warnings = [];
  const ok = [];

  // 1. Config dosyası izinleri
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const stat = fs.statSync(CONFIG_FILE);
      const mode = (stat.mode & 0o777).toString(8);
      if (process.platform !== 'win32' && mode !== '600' && mode !== '644') {
        issues.push({
          id: 'config-permissions',
          msg: `${L('Config dosyası izinleri geniş', 'Config file permissions too broad')}: ${mode} ${L('(önerilen: 600)', '(recommended: 600)')}`,
          fix: () => fs.chmodSync(CONFIG_FILE, 0o600),
        });
      } else {
        ok.push(L('Config dosyası izinleri', 'Config file permissions'));
      }
    } catch {}
  }

  // 2. API key formatı
  const config = getConfig();
  if (config.providerApiKey) {
    if (config.providerApiKey.length < 10) {
      issues.push({ id: 'weak-api-key', msg: L('API key çok kısa görünüyor', 'API key looks too short') });
    } else {
      ok.push('API key formatı');
    }
  }

  // 3. Debug mode
  if (config.debug === true) {
    warnings.push({ id: 'debug-mode', msg: L('Debug modu açık — API key\'ler loglara yazılabilir', 'Debug mode on — API keys may be written to logs') });
  } else {
    ok.push(L('Debug modu kapalı', 'Debug mode off'));
  }

  // 4. WhatsApp session dosyaları
  const waDir = path.join(CONFIG_DIR, 'whatsapp-sessions');
  if (fs.existsSync(waDir)) {
    const sessions = fs.readdirSync(waDir);
    if (sessions.length > 3) {
      warnings.push({ id: 'old-wa-sessions', msg: `${sessions.length} WhatsApp ${L('session var — eskiler temizlenebilir', 'sessions — old ones can be cleaned')}` });
    } else {
      ok.push(L('WhatsApp session sayısı', 'WhatsApp session count'));
    }
  }

  // 5. Gateway log boyutu
  const logFile = path.join(CONFIG_DIR, 'gateway.log');
  if (fs.existsSync(logFile)) {
    const stat = fs.statSync(logFile);
    const sizeMB = stat.size / (1024 * 1024);
    if (sizeMB > 50) {
      warnings.push({ id: 'large-log', msg: `${L('Gateway log dosyası büyük', 'Gateway log file large')}: ${sizeMB.toFixed(1)}MB` });
    } else {
      ok.push(L('Gateway log boyutu', 'Gateway log size'));
    }
  }

  // 6. Eski conversation dosyaları
  const convDir = path.join(CONFIG_DIR, 'conversations');
  if (fs.existsSync(convDir)) {
    const convFiles = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
    if (convFiles.length > 20) {
      warnings.push({ id: 'old-conversations', msg: `${convFiles.length} ${L('konuşma dosyası var — eskiler temizlenebilir', 'conversation files — old ones can be cleaned')}` });
    } else {
      ok.push(L('Konuşma dosyası sayısı', 'Conversation file count'));
    }
  }

  // 7. Secret refs in config
  const secretRefs = listSecretRefs(config);
  if (secretRefs.length > 0) {
    let unresolvedCount = 0;
    for (const ref of secretRefs) {
      try {
        resolveSecretRef(ref.ref, { throwOnMissing: true });
      } catch {
        unresolvedCount++;
      }
    }
    if (unresolvedCount > 0) {
      warnings.push({ id: 'unresolved-secrets', msg: `${unresolvedCount}/${secretRefs.length} secret reference(s) unresolved` });
    } else {
      ok.push('Secret references resolvable');
    }
  }

  // 8. Exec approvals policy
  const approvals = loadApprovals();
  if (approvals.defaults?.security === 'deny') {
    warnings.push({ id: 'deny-policy', msg: 'Exec approvals: all commands denied' });
  } else if (approvals.defaults?.security === 'allowlist') {
    const entries = Object.values(approvals.agents || {}).reduce((a, ag) => a + (ag.allowlist?.length || 0), 0);
    ok.push(`Exec approvals: allowlist mode (${entries} entries)`);
  } else {
    ok.push('Exec approvals: full mode');
  }

  // 9. Config backup status
  const { listBackups } = require('../utils/config');
  const backups = listBackups();
  if (backups.length > 0) {
    ok.push(`Config backups: ${backups.length} available`);
  } else {
    warnings.push({ id: 'no-backups', msg: 'No config backups found. Backups are created automatically on config changes.' });
  }

  if (json) {
    console.log(JSON.stringify({ ok, warnings: warnings.map(w => w.msg), issues: issues.map(i => i.msg) }, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(L('\n  Güvenlik Denetimi\n', '\n  Security Audit\n')));

  ok.forEach(msg => console.log(chalk.green('  ✓ ') + chalk.gray(msg)));

  if (warnings.length > 0) {
    console.log('');
    warnings.forEach(w => console.log(chalk.yellow('  ⚠ ') + chalk.yellow(w.msg)));
  }

  if (issues.length > 0) {
    console.log('');
    issues.forEach(i => console.log(chalk.red('  ❌ ') + chalk.red(i.msg)));
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (issues.length === 0 && warnings.length === 0) {
    console.log(chalk.green(L('  ✓ Güvenlik sorunu bulunamadı\n', '  ✓ No security issues found\n')));
    return;
  }

  console.log(chalk.gray(`  ${ok.length} ${L('geçti', 'passed')} · ${warnings.length} ${L('uyarı', 'warnings')} · ${issues.length} ${L('sorun', 'issues')}`));

  if (fix && issues.length > 0) {
    console.log('');
    issues.forEach(i => {
      if (i.fix) {
        try {
          i.fix();
          console.log(chalk.green(`  ✓ ${L('Düzeltildi', 'Fixed')}: ${i.id}`));
        } catch (e) {
          console.log(chalk.red(`  ❌ ${L('Düzeltilemedi', 'Could not fix')}: ${i.id} — ${e.message}`));
        }
      }
    });
  } else if (issues.length > 0) {
    console.log(chalk.gray(L('\n  Otomatik düzeltmek için: ', '\n  To auto-fix: ')) + chalk.cyan('natureco security audit --fix'));
  }
  console.log('');
}

module.exports = security;
