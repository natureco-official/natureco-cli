const chalk = require('chalk');
const { execFileSync, spawn } = require('child_process');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const path = require('path');
const fs = require('fs');
const os = require('os');

const GATEWAY_SCRIPT = path.join(__dirname, 'gateway-server.js');

function daemon(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusDaemon();
  if (action === 'start') return startDaemon();
  if (action === 'stop') return stopDaemon();
  if (action === 'restart') return restartDaemon();
  if (action === 'install') return installDaemon();
  if (action === 'uninstall') return uninstallDaemon();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco daemon [status|start|stop|restart|install|uninstall]\n', '  Usage: natureco daemon [status|start|stop|restart|install|uninstall]\n')));
  process.exit(1);
}

function statusDaemon() {
  const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
  let running = false;
  let pid = null;

  if (fs.existsSync(pidFile)) {
    try {
      pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      process.kill(pid, 0);
      running = true;
    } catch {
      running = false;
    }
  }

  console.log(chalk.cyan('\n  ⚙️  Gateway Daemon\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  if (running) {
    console.log(`  ${chalk.white('Status:')} ${chalk.green('running')}`);
    console.log(`  ${chalk.white('PID:')}    ${pid}`);
  } else {
    console.log(`  ${chalk.white('Status:')} ${chalk.yellow('not running')}`);
    console.log(`  ${chalk.white('PID:')}    ${chalk.gray('N/A')}`);
  }
  console.log(chalk.gray('\n  Manage with:') + chalk.cyan(' natureco gateway start|stop|status'));
  console.log();
}

function startDaemon() {
  console.log(chalk.cyan('\n  Starting Gateway daemon...\n'));
  try {
    const child = spawn(process.execPath, [GATEWAY_SCRIPT, 'start'], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(__dirname, '..', '..')
    });
    child.unref();
    console.log(chalk.green('  ✅ Gateway daemon started\n'));
  } catch (err) {
    console.log(chalk.red(`  ❌ ${err.message}\n`));
  }
}

function stopDaemon(platform = process.platform, kill = process.kill.bind(process), execFile = execFileSync) {
  console.log(chalk.cyan('\n  Stopping Gateway daemon...\n'));
  try {
    const pidFile = path.join(os.homedir(), '.natureco', 'gateway.pid');
    if (!fs.existsSync(pidFile)) throw new Error('daemon PID file not found');
    const rawPid = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = Number.parseInt(rawPid, 10);
    if (!/^\d+$/.test(rawPid) || !Number.isSafeInteger(pid) || pid <= 0) throw new Error('invalid daemon PID');
    kill(pid, 0);
    if (platform === 'win32') {
      execFile('taskkill', ['/F', '/PID', String(pid)], { stdio: 'pipe' });
    } else {
      kill(pid, 'SIGTERM');
    }
    fs.unlinkSync(pidFile);
    console.log(chalk.gray('  🛑 Gateway daemon stopped\n'));
    return { success: true, pid };
  } catch {
    console.log(chalk.yellow('  ⚠️  Could not stop daemon (may not be running)\n'));
    return { success: false };
  }
}

function restartDaemon() {
  stopDaemon();
  setTimeout(() => startDaemon(), 1000);
}

function installDaemon() {
  console.log(chalk.yellow('\n  daemon install would register as a system service\n'));
}

function uninstallDaemon() {
  console.log(chalk.yellow('\n  daemon uninstall would remove system service registration\n'));
}

module.exports = daemon;
module.exports.stopDaemon = stopDaemon;
