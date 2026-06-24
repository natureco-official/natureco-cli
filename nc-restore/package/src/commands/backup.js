const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const NATURECO_DIR = path.join(os.homedir(), '.natureco');

function backup(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'create') return createBackup();
  if (action === 'list') return listBackups();
  if (action === 'restore') return restoreBackup(params.join(' '));
  if (action === 'verify') return verifyBackup(params.join(' '));

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco backup [create|list|restore|verify]\n'));
  process.exit(1);
}

function createBackup() {
  const backupDir = path.join(os.homedir(), '.natureco-backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `natureco-backup-${timestamp}.tar.gz`);

  console.log(chalk.cyan('\n  💾 Creating backup...\n'));

  if (fs.existsSync(NATURECO_DIR)) {
    try {
      execSync(`tar -czf "${backupFile}" -C "${path.dirname(NATURECO_DIR)}" "${path.basename(NATURECO_DIR)}"`, {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 30000
      });
      const size = fs.statSync(backupFile).size;
      console.log(chalk.green(`  ✅ Backup created: ${backupFile}`));
      console.log(chalk.gray(`  Size: ${(size / 1024).toFixed(1)} KB`));
    } catch (err) {
      console.log(chalk.yellow('  ⚠️  tar backup failed, trying copy...'));
      const fallbackFile = backupFile.replace('.tar.gz', '.json');
      const config = require('../utils/config').getConfig();
      fs.writeFileSync(fallbackFile, JSON.stringify(config, null, 2));
      console.log(chalk.green(`  ✅ Config backup: ${fallbackFile}`));
    }
  } else {
    console.log(chalk.yellow('  ⚠️  No NatureCo directory found\n'));
  }
  console.log();
}

function listBackups() {
  const backupDir = path.join(os.homedir(), '.natureco-backups');
  console.log(chalk.cyan('\n  📋 Backups\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (!fs.existsSync(backupDir)) {
    console.log(chalk.gray('  No backups found.\n'));
    console.log(chalk.gray('  Create one: ') + chalk.cyan('natureco backup create\n'));
    return;
  }

  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('natureco-backup'));
  if (files.length === 0) {
    console.log(chalk.gray('  No backups found.\n'));
    return;
  }

  for (const f of files.sort().reverse()) {
    const stat = fs.statSync(path.join(backupDir, f));
    const size = (stat.size / 1024).toFixed(1);
    const date = stat.birthtime.toLocaleString();
    console.log(`  ${chalk.cyan('●')} ${chalk.white(f)} ${chalk.gray(`(${size} KB, ${date})`)}`);
  }
  console.log();
}

function restoreBackup(file) {
  if (!file) {
    console.log(chalk.red('\n  ❌ Backup file gerekli\n'));
    console.log(chalk.cyan('    natureco backup list'));
    console.log(chalk.cyan('    natureco backup restore <filename>\n'));
    process.exit(1);
  }

  const backupDir = path.join(os.homedir(), '.natureco-backups');
  const backupFile = path.join(backupDir, file);

  if (!fs.existsSync(backupFile)) {
    console.log(chalk.red(`\n  ❌ Backup bulunamadı: ${backupFile}\n`));
    process.exit(1);
  }

  console.log(chalk.yellow(`\n  ⚠️  Restoring ${file}...\n`));
  try {
    execSync(`tar -xzf "${backupFile}" -C "${os.homedir()}"`, { stdio: 'pipe', timeout: 15000 });
    console.log(chalk.green('  ✅ Restore complete\n'));
  } catch {
    console.log(chalk.red('  ❌ Restore failed\n'));
    process.exit(1);
  }
}

function verifyBackup(file) {
  if (!file) {
    console.log(chalk.red('\n  ❌ Backup file gerekli\n'));
    process.exit(1);
  }

  const backupDir = path.join(os.homedir(), '.natureco-backups');
  const backupFile = path.join(backupDir, file);

  if (!fs.existsSync(backupFile)) {
    console.log(chalk.red(`\n  ❌ Backup bulunamadı: ${backupFile}\n`));
    process.exit(1);
  }

  const stat = fs.statSync(backupFile);
  console.log(chalk.green(`\n  ✅ Backup verified: ${file} (${(stat.size / 1024).toFixed(1)} KB)\n`));
}

module.exports = backup;
