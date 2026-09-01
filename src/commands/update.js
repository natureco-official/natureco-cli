const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const readline = require('readline');

const VERSION_FILE = path.join(os.homedir(), '.natureco', 'version.json');

function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim().toLowerCase()); });
  });
}

function loadVersion() {
  if (!fs.existsSync(VERSION_FILE)) return { installed: null, checked: null };
  try { return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); }
  catch { return { installed: null, checked: null }; }
}

function saveVersion(data) {
  const dir = path.dirname(VERSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getCurrentVersion() {
  try {
    const pkg = require('../../package.json');
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

function getLatestVersion() {
  try {
    const result = execSync('npm view natureco-cli version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return result.trim();
  } catch {
    return null;
  }
}

async function update(params) {
  try {
    const [action] = params || [];

    if (!action || action === 'status') return cmdStatus();
    if (action === 'run') return await cmdRun();
    if (action === 'wizard') return await cmdWizard();

    console.log(chalk.red(`\n  Unknown update action: ${action}\n`));
    console.log(chalk.gray('  Usage: natureco update [run|status|wizard]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Update error: ${err.message}\n`));
  }
}

function cmdStatus() {
  const current = getCurrentVersion();
  const latest = getLatestVersion();
  const ver = loadVersion();

  console.log(chalk.cyan('\n  Update Status\n'));
  console.log(chalk.white('  Installed: ') + chalk.cyan('v' + current));

  if (latest) {
    console.log(chalk.white('  Latest:    ') + chalk.cyan('v' + latest));
    if (current === latest) {
      console.log(chalk.green('  ✓ You are up to date.\n'));
    } else {
      console.log(chalk.yellow('  Update available: v' + current + ' → v' + latest + '\n'));
      // Bir sonraki adımı SÖYLE. "Güncelleme mevcut" deyip nasıl yapılacağını
      // söylememek kullanıcıyı dışarıya sormaya itiyordu; kendi güncelleyicimiz
      // var ama bu ekranda hiç geçmiyordu.
      console.log(chalk.gray('  Güncellemek için: ') + chalk.cyan('natureco update run'));
      console.log(chalk.gray('  veya: ') + chalk.cyan('npm i -g natureco-cli@latest') + '\n');
    }
  } else {
    console.log(chalk.gray('  Could not check latest version.\n'));
  }

  saveVersion({ installed: current, checked: new Date().toISOString(), latest: latest || ver.latest });
}

async function cmdRun() {
  const current = getCurrentVersion();
  const latest = getLatestVersion();

  if (!latest) {
    console.log(chalk.yellow('\n  Could not fetch latest version. Check your internet connection.\n'));
    return;
  }

  if (current === latest) {
    console.log(chalk.green('\n  Already up to date (v' + current + ').\n'));
    return;
  }

  console.log(chalk.cyan('\n  Updating: v' + current + ' → v' + latest + '\n'));

  try {
    execSync('npm update -g natureco-cli', { stdio: 'inherit' });
    saveVersion({ installed: latest, updated: new Date().toISOString(), latest });
    console.log(chalk.green('\n  ✓ Updated to v' + latest + '\n'));
  } catch (e) {
    console.log(chalk.red('\n  Update failed: ' + e.message + '\n'));
    console.log(chalk.gray('  Try: npm install -g natureco-cli@latest\n'));
  }
}

async function cmdWizard() {
  const current = getCurrentVersion();
  const latest = getLatestVersion();

  console.log(chalk.cyan('\n  Update Wizard\n'));

  if (!latest) {
    console.log(chalk.yellow('  Could not check for updates.\n'));
    return;
  }

  console.log(chalk.white('  Current: v' + current));
  console.log(chalk.white('  Latest:  v' + latest));

  if (current === latest) {
    console.log(chalk.green('\n  You are up to date!\n'));
    return;
  }

  const answer = await rlQuestion(chalk.yellow('  Update to v' + latest + '? [Y/n]: '));
  if (answer === 'n' || answer === 'no') {
    console.log(chalk.gray('\n  Skipped.\n'));
    return;
  }

  console.log(chalk.gray('\n  Installing...\n'));

  try {
    execSync('npm install -g natureco-cli@latest', { stdio: 'inherit' });
    saveVersion({ installed: latest, updated: new Date().toISOString(), latest });
    console.log(chalk.green('\n  ✓ Updated to v' + latest + '\n'));
  } catch (e) {
    console.log(chalk.red('\n  Update failed: ' + e.message + '\n'));
  }
}

module.exports = update;
