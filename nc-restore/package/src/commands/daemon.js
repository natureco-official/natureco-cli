const chalk = require('chalk');
const { execSync, spawn } = require('child_process');
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
  console.log(chalk.gray('  Kullanım: natureco daemon [status|start|stop|restart|install|uninstall]\n'));
  process.exit(1);
}

function statusDaemon() {
  const pidFile = path.join(os.homedir(), '.natureco', 'daemon.pid');
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

function stopDaemon() {
  console.log(chalk.cyan('\n  Stopping Gateway daemon...\n'));
  try {
    execSync('taskkill /F /IM node.exe /FI "WINDOWTITLE eq natureco-gateway" 2>nul', { stdio: 'pipe' });
    console.log(chalk.gray('  🛑 Gateway daemon stopped\n'));
  } catch {
    console.log(chalk.yellow('  ⚠️  Could not stop daemon (may not be running)\n'));
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
