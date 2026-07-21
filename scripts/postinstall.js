#!/usr/bin/env node
/**
 * NatureCo CLI - Post-install script (v5.6.0)
 * 
 * Bu script npm install sirasinda otomatik calisir.
 * Hatalari onceden duzeltir:
 *   - chalk v5 (ESM) yerine chalk@4 (CJS) kur
 *   - Doctor calistir
 *   - Soul dosyalarini generic yap (Personal yoksa)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const log = (msg, color = '\x1b[36m') => {
  console.log(color + msg + '\x1b[0m');
};

const success = (msg) => log('  \u2713 ' + msg, '\x1b[32m');
const warn = (msg) => log('  \u26a0  ' + msg, '\x1b[33m');
const error = (msg) => log('  \u2717 ' + msg, '\x1b[31m');

function run(cmd, args = []) {
  try {
    return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    return null;
  }
}

function fixChalk() {
  log('\n[1/4] chalk kontrol...');
  try {
    const chalkPkg = require('chalk/package.json');
    const major = parseInt(chalkPkg.version.split('.')[0]);
    if (major >= 5) {
      warn('chalk v' + chalkPkg.version + ' ESM (CJS uyumsuz)');
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const result = run(npmCmd, ['install', 'chalk@4', '--no-save']);
      if (result !== null) {
        success('chalk v4 kuruldu');
      } else {
        warn('chalk@4 kurulamadi - manual: npm install -g chalk@4');
      }
    } else {
      success('chalk v' + chalkPkg.version + ' (OK)');
    }
  } catch (e) {
    warn('chalk kontrol edilemedi: ' + e.message);
  }
}

function ensureHomeNatureco() {
  log('\n[2/4] NatureCo dizinleri...');
  const home = os.homedir();
  const dirs = [
    path.join(home, '.natureco'),
    path.join(home, '.natureco', 'memory'),
    path.join(home, '.natureco', 'soul'),
    path.join(home, '.natureco', 'sessions'),
    path.join(home, '.natureco', 'personal'),
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
      success('Olusturuldu: ' + d);
    } else {
      success('Mevcut: ' + d);
    }
  }
}

function checkHomebrewConflict() {
  log('\n[3/4] Binary kontrol...');
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    success('Mac degil, Homebrew sorunu yok');
    return;
  }
  
  const homebrewCli = '/opt/homebrew/lib/node_modules/natureco-cli';
  const usrLocalCli = '/usr/local/lib/node_modules/natureco-cli';
  
  if (fs.existsSync(homebrewCli) && fs.existsSync(usrLocalCli)) {
    warn('Hem /opt/homebrew hem /usr/local var!');
    warn('Cakisma var. Manuel: rm -rf ' + homebrewCli);
  } else {
    success('Binary cakismasi yok');
  }
}

function runDoctor() {
  log('\n[4/4] Sistem kontrolu...');
  const result = run(process.execPath, [path.join(__dirname, '..', 'bin', 'natureco.js'), 'doctor']);
  if (result !== null) {
    const ok = result.includes('saglikli') || result.includes('geçti');
    if (ok) {
      success('Tum kontroller gecti');
    } else {
      warn('Bazi kontroller basarisiz. Detay: natureco doctor');
    }
  } else {
    warn('Doctor calistirilamadi');
  }
}

function main() {
  // CI'da atla \u2014 hiz + log gurultusu (kurulumun kendisi zaten test ediliyor)
  if (process.env.CI || process.env.NATURECO_SKIP_POSTINSTALL) return;
  log('\n\u{1F33F} NatureCo CLI - Post-install\n', '\x1b[35m');
  fixChalk();
  ensureHomeNatureco();
  checkHomebrewConflict();
  runDoctor();
  log('\n\u2705 Tamamlandi!\n  Simdi: natureco setup\n', '\x1b[32m');
}

// Post-install KURULUMU ASLA KIRMAMALI \u2014 eski `|| true` cmd.exe'de calismiyordu
try {
  main();
} catch (e) {
  warn('Post-install tamamlanamadi: ' + e.message);
  warn('Kurulum yine de basarili. Sonra `natureco doctor` calistirin.');
}
process.exit(0);
