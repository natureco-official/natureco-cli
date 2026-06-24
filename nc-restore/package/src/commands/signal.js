const chalk = require('chalk');
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

const SIGNAL_DIR = path.join(os.homedir(), '.natureco', 'signal');
const SIGNAL_PID_FILE = path.join(SIGNAL_DIR, 'daemon.pid');
const SIGNAL_LOG_FILE = path.join(SIGNAL_DIR, 'daemon.log');
const SIGNAL_CLI_VERSION = '0.13.6';

const { checkExistingToken } = require('./channel-helper');

async function signal(action, subAction) {
  if (!action || action === 'connect') return connectSignal();
  if (action === 'disconnect') return disconnectSignal();
  if (action === 'status') return statusSignal();
  if (action === 'install') return installSignalCli();
  if (action === 'daemon') return manageDaemon(subAction);
  if (action === 'probe') return probeSignalCli();
  console.log(chalk.red('\n❌ Unknown action\n'));
  console.log(chalk.gray('Available actions: connect, disconnect, status, install, daemon, probe\n'));
  process.exit(1);
}

async function connectSignal() {
  const config = getConfig();
  if (!config.providerUrl) {
    console.log(chalk.red('\n❌ Setup yapılmamış. Önce "natureco setup" çalıştırın.\n'));
    process.exit(1);
  }
  console.log(chalk.yellow('\n⏳ Signal bağlantısı hazırlanıyor...\n'));
  console.log(chalk.gray('Signal, signal-cli REST API üzerinden bağlanır.\n'));

  const existing = config.signalHttpUrl || '';
  const existingAccount = config.signalAccount || '';
  const existingDm = config.signalDmPolicy || 'pairing';
  const existingMode = config.signalApiMode || 'auto';

  const answers = await inquirer.prompt([
    { type: 'input', name: 'httpUrl', message: 'signal-cli REST API URL:', default: existing || 'http://localhost:8080', validate: v => v.trim() ? true : 'URL boş olamaz' },
    { type: 'input', name: 'account', message: 'Signal hesap numarası (+905551234567):', default: existingAccount, validate: v => v.trim() ? true : 'Numara boş olamaz' },
    {
      type: 'list', name: 'apiMode', message: 'API modu:', default: existingMode,
      choices: [
        { name: 'Auto-detect (önerilen)', value: 'auto' },
        { name: 'Native (signal-cli JSON-RPC)', value: 'native' },
        { name: 'Container (bbernhard/signal-cli-rest-api)', value: 'container' },
      ]
    },
    { type: 'confirm', name: 'autoStart', message: 'Gateway ile signal-cli daemon\'ı otomatik başlatılsın mı?', default: config.signalAutoStart !== undefined ? config.signalAutoStart : true },
    {
      type: 'list', name: 'receiveMode', message: 'Mesaj alma modu:', default: config.signalReceiveMode || 'on-start',
      choices: [
        { name: 'Gateway başlangıcında dinlemeye başla (önerilen)', value: 'on-start' },
        { name: 'Manuel (sadece status kontrol)', value: 'manual' },
      ]
    },
    { type: 'list', name: 'dmPolicy', message: 'DM politikası:', default: existingDm, choices: [
      { name: 'Pairing (önerilen) — eşleşme onayı ile', value: 'pairing' },
      { name: 'Allowlist — sadece izin listesi', value: 'allowlist' },
      { name: 'Open — herkese açık', value: 'open' },
      { name: 'Disabled — devre dışı', value: 'disabled' },
    ]},
  ]);

  const botId = `signal_${Date.now()}`;
  config.signalHttpUrl = answers.httpUrl.trim().replace(/\/+$/, '');
  config.signalAccount = answers.account.trim();
  config.signalApiMode = answers.apiMode;
  config.signalAutoStart = answers.autoStart;
  config.signalReceiveMode = answers.receiveMode;
  config.signalDmPolicy = answers.dmPolicy;
  config.signalBotId = botId;
  saveConfig(config);

  console.log(chalk.green('\n✅ Signal bağlantısı kaydedildi!\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(botId));
  console.log(chalk.cyan('REST API URL:'), chalk.white(config.signalHttpUrl));
  console.log(chalk.cyan('Hesap:'), chalk.white(config.signalAccount));
  console.log(chalk.cyan('API Modu:'), chalk.white(answers.apiMode));
  console.log(chalk.cyan('DM Politikası:'), chalk.white(answers.dmPolicy));

  if (answers.autoStart) {
    const signalCliPath = findSignalCli();
    if (signalCliPath) {
      console.log(chalk.gray(`\nsignal-cli bulundu: ${signalCliPath}`));
    } else {
      console.log(chalk.yellow('\n⚠️  signal-cli bulunamadı. İndirmek için:'));
      console.log(chalk.cyan('  natureco signal install'));
    }
  }
  console.log(chalk.gray('\nGateway ile başlatmak için: natureco gateway start\n'));
}

async function disconnectSignal() {
  const config = getConfig();
  if (!config.signalBotId) {
    console.log(chalk.gray('\n⚠️  No Signal connection found\n'));
    return;
  }
  const { confirm } = await inquirer.prompt([
    { type: 'confirm', name: 'confirm', message: 'Signal bağlantısını kaldırmak istediğinize emin misiniz?', default: false }
  ]);
  if (!confirm) {
    console.log(chalk.gray('\nCancelled\n'));
    return;
  }
  // Stop daemon if running
  stopDaemonProcess();

  delete config.signalHttpUrl;
  delete config.signalAccount;
  delete config.signalApiMode;
  delete config.signalAutoStart;
  delete config.signalReceiveMode;
  delete config.signalDmPolicy;
  delete config.signalBotId;
  saveConfig(config);
  console.log(chalk.green('\n✅ Signal disconnected\n'));
}

function statusSignal() {
  const config = getConfig();
  if (!config.signalBotId) {
    console.log(chalk.gray('\n⚠️  Signal not connected\n'));
    console.log(chalk.gray('Connect with: natureco signal connect\n'));
    return;
  }

  const daemonRunning = isDaemonRunning();
  const apiReachable = probeSync(config);

  console.log(chalk.green('\n✅ Signal connected\n'));
  console.log(chalk.cyan('Bot ID:'), chalk.white(config.signalBotId));
  console.log(chalk.cyan('REST API URL:'), chalk.white(config.signalHttpUrl));
  console.log(chalk.cyan('Hesap:'), chalk.white(config.signalAccount));
  console.log(chalk.cyan('API Modu:'), chalk.white(config.signalApiMode || 'auto'));
  console.log(chalk.cyan('DM Politikası:'), chalk.white(config.signalDmPolicy || 'pairing'));

  console.log('');
  console.log(chalk.cyan('Daemon Durumu:'), daemonRunning ? chalk.green('✓ Çalışıyor') : chalk.gray('✗ Durduruldu'));
  console.log(chalk.cyan('API Erişilebilirlik:'), apiReachable ? chalk.green('✓ Ulaşılabilir') : chalk.red('✗ Ulaşılamıyor'));

  if (config.signalCliPath) {
    console.log(chalk.gray(`\nsignal-cli: ${config.signalCliPath}`));
  }
  const cliPath = findSignalCli();
  if (cliPath) {
    console.log(chalk.gray(`signal-cli binary: ${cliPath}`));
  }
  console.log(chalk.gray('\nActions: connect, disconnect, install, daemon start/stop/status, probe\n'));
}

async function installSignalCli() {
  console.log(chalk.yellow('\n⏳ signal-cli indiriliyor...\n'));

  if (!fs.existsSync(SIGNAL_DIR)) {
    fs.mkdirSync(SIGNAL_DIR, { recursive: true });
  }

  const platform = process.platform;
  let downloadUrl;
  let archiveName;

  if (platform === 'win32') {
    archiveName = `signal-cli-${SIGNAL_CLI_VERSION}-Windows.tar.gz`;
    downloadUrl = `https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/${archiveName}`;
  } else if (platform === 'linux') {
    archiveName = `signal-cli-${SIGNAL_CLI_VERSION}-Linux.tar.gz`;
    downloadUrl = `https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/${archiveName}`;
  } else if (platform === 'darwin') {
    archiveName = `signal-cli-${SIGNAL_CLI_VERSION}-macOS.tar.gz`;
    downloadUrl = `https://github.com/AsamK/signal-cli/releases/download/v${SIGNAL_CLI_VERSION}/${archiveName}`;
  } else {
    console.log(chalk.red(`\n❌ Platform desteklenmiyor: ${platform}\n`));
    console.log(chalk.gray('Manual kurulum: https://github.com/AsamK/signal-cli#installation\n'));
    process.exit(1);
  }

  const archivePath = path.join(SIGNAL_DIR, archiveName);
  const extractDir = path.join(SIGNAL_DIR, `signal-cli-${SIGNAL_CLI_VERSION}`);

  if (fs.existsSync(extractDir)) {
    console.log(chalk.gray(`signal-cli ${SIGNAL_CLI_VERSION} zaten indirilmiş: ${extractDir}`));
    const config = getConfig();
    config.signalCliPath = path.join(extractDir, 'bin', 'signal-cli' + (platform === 'win32' ? '.bat' : ''));
    saveConfig(config);
    console.log(chalk.green('✅ Hazır\n'));
    return;
  }

  try {
    console.log(chalk.cyan(`İndiriliyor: ${downloadUrl}`));
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(archivePath, buffer);
    console.log(chalk.green(`✓ İndirildi (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`));

    // Extract
    console.log(chalk.cyan('Ayıklanıyor...'));
    const tar = require('tar');
    fs.mkdirSync(extractDir, { recursive: true });
    await tar.x({ file: archivePath, cwd: SIGNAL_DIR });
    console.log(chalk.green('✓ Ayıklandı'));

    // Clean up archive
    fs.unlinkSync(archivePath);

    // Make executable on Unix
    if (platform !== 'win32') {
      const binaryPath = path.join(extractDir, 'bin', 'signal-cli');
      if (fs.existsSync(binaryPath)) {
        fs.chmodSync(binaryPath, 0o755);
      }
    }

    // Save path to config
    const config = getConfig();
    config.signalCliPath = path.join(extractDir, 'bin', 'signal-cli' + (platform === 'win32' ? '.bat' : ''));
    saveConfig(config);

    console.log(chalk.green(`\n✅ signal-cli ${SIGNAL_CLI_VERSION} kuruldu!\n`));
    console.log(chalk.cyan('Binary:'), chalk.white(config.signalCliPath));
    console.log(chalk.gray('\nDaemon\'ı başlatmak için: natureco signal daemon start\n'));

  } catch (err) {
    console.log(chalk.red(`\n❌ Kurulum hatası: ${err.message}\n`));
    console.log(chalk.gray('Manuel kurulum: https://github.com/AsamK/signal-cli#installation\n'));
    process.exit(1);
  }
}

async function manageDaemon(subAction) {
  const config = getConfig();
  if (!config.signalBotId) {
    console.log(chalk.red('\n❌ Signal bağlı değil\n'));
    process.exit(1);
  }

  if (subAction === 'start') {
    return startDaemon(config);
  } else if (subAction === 'stop') {
    return stopDaemon();
  } else if (subAction === 'status') {
    return daemonStatus();
  } else {
    console.log(chalk.red('\n❌ Unknown daemon action\n'));
    console.log(chalk.gray('Usage: natureco signal daemon <start|stop|status>\n'));
    process.exit(1);
  }
}

async function startDaemon(config) {
  if (isDaemonRunning()) {
    console.log(chalk.yellow('\n⚠️  Daemon already running\n'));
    console.log(chalk.cyan('PID:'), chalk.white(fs.readFileSync(SIGNAL_PID_FILE, 'utf-8').trim()));
    return;
  }

  const cliPath = config.signalCliPath || findSignalCli();
  if (!cliPath) {
    console.log(chalk.red('\n❌ signal-cli bulunamadı\n'));
    console.log(chalk.yellow('Önce indirin:'), chalk.cyan('natureco signal install\n'));
    process.exit(1);
  }

  if (!fs.existsSync(cliPath)) {
    console.log(chalk.red(`\n❌ signal-cli binary bulunamadı: ${cliPath}\n`));
    process.exit(1);
  }

  if (!fs.existsSync(SIGNAL_DIR)) {
    fs.mkdirSync(SIGNAL_DIR, { recursive: true });
  }

  const httpUrl = config.signalHttpUrl || 'http://localhost:8080';
  const urlObj = new URL(httpUrl);
  const host = urlObj.hostname || '127.0.0.1';
  const port = urlObj.port || '8080';
  const account = config.signalAccount;

  console.log(chalk.yellow(`\n⏳ signal-cli daemon başlatılıyor...\n`));
  console.log(chalk.gray(`HTTP: ${host}:${port}`));
  console.log(chalk.gray(`Hesap: ${account}`));

  const args = [
    'daemon',
    '--http', `${host}:${port}`,
    '--no-receive-stdout',
  ];
  if (account) {
    args.push('-a', account);
  }

  const logFd = fs.openSync(SIGNAL_LOG_FILE, 'a');
  const child = spawn(cliPath, args, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });

  child.unref();
  fs.writeFileSync(SIGNAL_PID_FILE, String(child.pid), 'utf-8');

  console.log(chalk.green('✅ Daemon başlatıldı'));
  console.log(chalk.cyan('PID:'), chalk.white(child.pid));
  console.log(chalk.cyan('Log:'), chalk.white(SIGNAL_LOG_FILE));

  // Wait for API to be ready
  console.log(chalk.gray('\nAPI hazır olana kadar bekleniyor...'));
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (probeSync(config)) {
      console.log(chalk.green('✓ API hazır\n'));
      return;
    }
    process.stdout.write('.');
  }
  console.log(chalk.yellow('\n⚠️  API yanıt vermedi, logları kontrol edin\n'));
}

function stopDaemon() {
  if (!isDaemonRunning()) {
    console.log(chalk.gray('\n⚠️  Daemon not running\n'));
    return;
  }

  const pid = parseInt(fs.readFileSync(SIGNAL_PID_FILE, 'utf-8').trim());
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
      setTimeout(() => {
        try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch {}
      }, 3000);
    }
    if (fs.existsSync(SIGNAL_PID_FILE)) {
      fs.unlinkSync(SIGNAL_PID_FILE);
    }
    console.log(chalk.green('\n✅ Daemon durduruldu\n'));
  } catch (err) {
    console.log(chalk.red(`\n❌ Hata: ${err.message}\n`));
  }
}

function stopDaemonProcess() {
  if (isDaemonRunning()) {
    const pid = parseInt(fs.readFileSync(SIGNAL_PID_FILE, 'utf-8').trim());
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch {}
    if (fs.existsSync(SIGNAL_PID_FILE)) {
      fs.unlinkSync(SIGNAL_PID_FILE);
    }
  }
}

function daemonStatus() {
  const running = isDaemonRunning();
  console.log(running
    ? chalk.green(`\n✅ Daemon is running (PID: ${fs.readFileSync(SIGNAL_PID_FILE, 'utf-8').trim()})\n`)
    : chalk.gray('\n⚠️  Daemon is not running\n'));
}

function isDaemonRunning() {
  if (!fs.existsSync(SIGNAL_PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(SIGNAL_PID_FILE, 'utf-8').trim());
    process.kill(pid, 0);
    return true;
  } catch {
    if (fs.existsSync(SIGNAL_PID_FILE)) {
      fs.unlinkSync(SIGNAL_PID_FILE);
    }
    return false;
  }
}

async function probeSignalCli() {
  const config = getConfig();
  if (!config.signalHttpUrl) {
    console.log(chalk.red('\n❌ Signal bağlantısı yapılmamış\n'));
    console.log(chalk.gray('Önce: natureco signal connect\n'));
    process.exit(1);
  }

  const baseUrl = config.signalHttpUrl;
  const mode = config.signalApiMode || 'auto';
  console.log(chalk.yellow(`\n⏳ Problanıyor: ${baseUrl}\n`));

  let nativeOk = false;
  let containerOk = false;

  // Try native mode
  try {
    const res = await fetch(`${baseUrl}/api/v1/check`, { signal: AbortSignal.timeout(5000) });
    nativeOk = res.ok;
    if (nativeOk) {
      const text = await res.text();
      console.log(chalk.green('✓ Native JSON-RPC API:'), chalk.white(res.status, text.slice(0, 100)));
    }
  } catch (err) {
    console.log(chalk.gray(`✗ Native JSON-RPC API: ${err.message}`));
  }

  // Try container mode
  try {
    const res = await fetch(`${baseUrl}/v1/about`, { signal: AbortSignal.timeout(5000) });
    containerOk = res.ok;
    if (containerOk) {
      const data = await res.json();
      console.log(chalk.green('✓ Container REST API:'), chalk.white(JSON.stringify(data).slice(0, 100)));
    }
  } catch (err) {
    console.log(chalk.gray(`✗ Container REST API: ${err.message}`));
  }

  if (mode === 'auto') {
    const detected = nativeOk ? 'native' : containerOk ? 'container' : 'none';
    console.log(chalk.cyan(`\nAuto-detect sonucu: ${detected}`));
  }

  const cliPath = findSignalCli();
  if (cliPath) {
    console.log(chalk.gray(`\nsignal-cli binary: ${cliPath}`));
    try {
      const versionOut = execSync(`"${cliPath}" --version`, { encoding: 'utf-8', timeout: 10000 });
      console.log(chalk.gray(`Version: ${versionOut.trim()}`));
    } catch {
      console.log(chalk.gray('Version sorgulanamadı'));
    }
  }

  console.log('');
}

function probeSync(config) {
  if (!config.signalHttpUrl) return false;
  const baseUrl = config.signalHttpUrl;
  try {
    const res = execSync(
      `powershell -Command "try { $r = Invoke-WebRequest -Uri '${baseUrl}/api/v1/check' -TimeoutSec 3 -UseBasicParsing; exit 0 } catch { exit 1 }"`,
      { timeout: 10000, stdio: 'pipe' }
    );
    return true;
  } catch {
    // Also check container mode
    try {
      execSync(
        `powershell -Command "try { $r = Invoke-WebRequest -Uri '${baseUrl}/v1/about' -TimeoutSec 3 -UseBasicParsing; exit 0 } catch { exit 1 }"`,
        { timeout: 10000, stdio: 'pipe' }
      );
      return true;
    } catch {
      return false;
    }
  }
}

function findSignalCli() {
  const config = getConfig();
  if (config.signalCliPath && fs.existsSync(config.signalCliPath)) {
    return config.signalCliPath;
  }

  // Check installed locations
  const candidates = [
    path.join(SIGNAL_DIR, `signal-cli-${SIGNAL_CLI_VERSION}`, 'bin', 'signal-cli' + (process.platform === 'win32' ? '.bat' : '')),
    path.join(SIGNAL_DIR, `signal-cli-${SIGNAL_CLI_VERSION}`, 'bin', 'signal-cli'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // Check PATH
  try {
    const which = execSync(process.platform === 'win32' ? 'where signal-cli' : 'which signal-cli', { encoding: 'utf-8', timeout: 5000 });
    const p = which.trim().split('\n')[0];
    if (p && fs.existsSync(p)) return p;
  } catch {}

  return null;
}

module.exports = signal;
