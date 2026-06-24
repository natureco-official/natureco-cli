/**
 * natureco reset - Her seyi sifirla (v5.6.0)
 *
 * Options:
 *   --all       Config, memory, sessions, soul hepsini sil
 *   --config    Sadece config.json
 *   --memory    Sadece memory
 *   --sessions  Sadece sessions
 *   --soul      Sadece soul
 *   --personal  Personal klasoru (sadece v5.6.0+)
 *
 * Confirmation gerekli (y/n)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { requireApproval, RISK } = require('../utils/dangerous');

async function reset() {
  const args = process.argv.slice(3);
  const home = os.homedir();
  const baseDir = path.join(home, '.natureco');

  // v5.6.16: Dangerous command approval
  const isFullReset = args.includes('--all') || args.includes('--personal');
  const risk = isFullReset ? RISK.CRITICAL : RISK.HIGH;
  const reason = isFullReset
    ? 'Tum kisisel veriler ve ayarlar silinecek (geri alinamaz)'
    : 'Secili kapsamdaki veriler silinecek';

  // --yes/-y bypass (eski davranis)
  const skipApproval = args.includes('--yes') || args.includes('-y');

  if (!skipApproval) {
    const argsObj = {
      flags: args.filter(a => a.startsWith('--') || a.startsWith('-'))
    };
    const approved = await requireApproval('natureco reset', argsObj, risk, reason);
    if (!approved) {
      console.log(chalk.gray('\nIptal edildi.\n'));
      return;
    }
  }

  console.log(chalk.yellow('\n\u26a0  RESET - Tum veriler silinecek!\n'));

  const whatToReset = {
    config: args.includes('--all') || args.includes('--config'),
    memory: args.includes('--all') || args.includes('--memory'),
    sessions: args.includes('--all') || args.includes('--sessions'),
    soul: args.includes('--all') || args.includes('--soul'),
    personal: args.includes('--all') || args.includes('--personal'),
  };

  // Eger hicbir flag yoksa hepsini sifirla
  if (!args.some(a => a.startsWith('--'))) {
    whatToReset.config = true;
    whatToReset.memory = true;
    whatToReset.sessions = true;
    whatToReset.soul = true;
  }

  console.log('Silinecek:');
  if (whatToReset.config) console.log('  - config.json');
  if (whatToReset.memory) console.log('  - memory/');
  if (whatToReset.sessions) console.log('  - sessions/');
  if (whatToReset.soul) console.log('  - soul/ (generic default doner)');
  if (whatToReset.personal) console.log('  - personal/');



  // Sil
  if (whatToReset.config) {
    const f = path.join(baseDir, 'config.json');
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(chalk.green('  \u2713 config.json silindi'));
    }
  }

  if (whatToReset.memory) {
    const d = path.join(baseDir, 'memory');
    if (fs.existsSync(d)) {
      fs.rmSync(d, { recursive: true });
      console.log(chalk.green('  \u2713 memory/ silindi'));
    }
  }

  if (whatToReset.sessions) {
    const d = path.join(baseDir, 'sessions');
    if (fs.existsSync(d)) {
      fs.rmSync(d, { recursive: true });
      console.log(chalk.green('  \u2713 sessions/ silindi'));
    }
  }

  if (whatToReset.soul) {
    const d = path.join(baseDir, 'soul');
    if (fs.existsSync(d)) {
      fs.rmSync(d, { recursive: true });
      console.log(chalk.green('  \u2713 soul/ silindi (generic doner)'));
    }
  }

  if (whatToReset.personal) {
    const d = path.join(baseDir, 'personal');
    if (fs.existsSync(d)) {
      fs.rmSync(d, { recursive: true });
      console.log(chalk.green('  \u2713 personal/ silindi'));
    }
  }

  console.log(chalk.cyan('\n\u2705 Reset tamamlandi!'));
  console.log(chalk.gray('  Yeniden kurmak icin: natureco setup\n'));
}

module.exports = { reset };
