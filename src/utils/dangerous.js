/**
 * Dangerous Command Approval (v5.6.16)
 *
 * Hermes Agent'taki "Command required approval" mekanizmasinin
 * NatureCo CLI versiyonu. Riskli komutlari calistirmadan once
 * kullanici onayi alir.
 *
 * Kullanim:
 *   const { requireApproval, RISK } = require('../utils/dangerous');
 *   if (!await requireApproval('reset', { scope: 'full' }, RISK.CRITICAL)) return;
 */

const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');

const RISK = {
  LOW: 'low',          // Otomatik onay
  MEDIUM: 'medium',    // Basit onay mesaji
  HIGH: 'high',        // Acik onay gerekli
  CRITICAL: 'critical', // Tam yazim onay gerekli
};

const RISK_LABELS = {
  low: { color: 'gray', icon: '⚪', label: 'DUSUK RISK' },
  medium: { color: 'yellow', icon: '🟡', label: 'ORTA RISK' },
  high: { color: 'red', icon: '🔴', label: 'YUKSEK RISK' },
  critical: { color: 'magenta', icon: '⛔', label: 'KRITIK - GERI ALINAMAZ' },
};

const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Komut calistirmadan once risk seviyesi goster, onay iste
 * @param {string} command - komut adi ('reset', 'uninstall', 'memory clear', vs.)
 * @param {object} args - komutun parametreleri
 * @param {string} risk - RISK enum degeri
 * @param {string} reason - neden tehlikeli
 * @returns {Promise<boolean>} - onay verildi mi
 */
async function requireApproval(command, args = {}, risk = RISK.HIGH, reason = '') {
  // --force veya --yes flag kontrolu (CLI tarafinda eklenir)
  if (process.env.NATURECO_FORCE === '1' || args.force || args.yes) {
    return true;
  }

  const label = RISK_LABELS[risk] || RISK_LABELS.high;

  console.log();
  console.log(chalk[label.color](`  ${label.icon} ${label.label}: ${command}`));
  console.log(chalk.gray('  ' + '─'.repeat(60)));
  console.log(chalk.white(`  Komut: ${command}`));
  if (Object.keys(args).length > 0) {
    console.log(chalk.gray(`  Argumanlar: ${JSON.stringify(args)}`));
  }
  if (reason) {
    console.log(chalk[label.color](`  Neden: ${reason}`));
  }
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  // Dusuk risk - otomatik onay, sadece mesaj goster
  if (risk === RISK.LOW) {
    console.log(chalk.gray('  Otomatik onaylandi (dusuk risk)'));
    console.log();
    return true;
  }

  // Kritik risk - tam yazim gerekli
  if (risk === RISK.CRITICAL) {
    console.log(chalk.red('  Bu islem geri alinamaz!'));
    const { confirm } = await inquirer.prompt([{
      type: 'input',
      name: 'confirm',
      message: chalk.red('  Devam etmek icin "EVET SIL" yazin (veya Enter ile iptal):'),
      validate: (input) => input === 'EVET SIL' || input === ''
    }]);
    console.log();
    return confirm === 'EVET SIL';
  }

  // Yuksek ve orta risk - basit onay
  const promptType = risk === RISK.HIGH ? 'confirm' : 'confirm';
  const { ok } = await inquirer.prompt([{
    type: promptType,
    name: 'ok',
    message: chalk[label.color](`  Bu komutu calistirmak istediginize emin misiniz?`),
    default: false,
  }]);
  console.log();
  return ok;
}

/**
 * Komutun risk seviyesini goster, hizli onay al
 * (sync versiyon, sadece mesaj gosterir)
 */
function showRisk(command, args = {}, risk = RISK.MEDIUM, reason = '') {
  const label = RISK_LABELS[risk] || RISK_LABELS.medium;
  console.log();
  console.log(chalk[label.color](`  ${label.icon} ${label.label}: ${command}`));
  if (reason) console.log(chalk.gray(`  ${reason}`));
  console.log();
}

module.exports = {
  RISK,
  RISK_LABELS,
  RISK_RANK,
  requireApproval,
  showRisk,
};
