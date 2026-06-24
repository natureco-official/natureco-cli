/**
 * natureco dashboard — Local web dashboard (Phase 5)
 *
 * Kullanım:
 *   natureco dashboard              Dashboard'u başlat ve tarayıcıda aç
 *   natureco dashboard start        Sadece başlat (arka plan)
 *   natureco dashboard status       Çalışıyor mu kontrol et
 *   natureco dashboard url          URL'i göster
 *   natureco dashboard stop         Durdur (PID file'dan)
 *
 * Phase 5 — Vanilla JS, framework yok, port 7421
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { exec } = require('child_process');
const dashboardServer = require('../utils/dashboard-server');

const DASHBOARD_PORT = dashboardServer.PORT;
const DASHBOARD_URL = `http://${dashboardServer.HOST}:${DASHBOARD_PORT}`;
const PID_FILE = path.join(os.homedir(), '.natureco', 'dashboard.pid');

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
    socket.connect(port, host);
  });
}

function getRunningPid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      // Process çalışıyor mu?
      try { process.kill(pid, 0); return pid; } catch { return null; }
    }
  } catch {}
  return null;
}

async function cmdStart(openBrowser = true) {
  const inUse = await isPortInUse(DASHBOARD_PORT);
  const existingPid = getRunningPid();

  if (inUse || existingPid) {
    console.log(chalk.green(`\n  ✓ Dashboard zaten çalışıyor: ${DASHBOARD_URL}`));
    console.log(chalk.gray(`    PID: ${existingPid || 'unknown'}`));
    if (openBrowser) openInBrowser(DASHBOARD_URL);
    return;
  }

  console.log(chalk.cyan(`\n  🌿 NatureCo Dashboard başlatılıyor...\n`));
  const server = dashboardServer.startServer(DASHBOARD_PORT);

  // PID kaydet
  setTimeout(() => {
    try {
      fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
    } catch {}
  }, 100);

  if (openBrowser) {
    setTimeout(() => openInBrowser(DASHBOARD_URL), 500);
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n  ⏹  Dashboard durduruluyor...'));
    try { fs.unlinkSync(PID_FILE); } catch {}
    server.close(() => process.exit(0));
  });
}

function openInBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'win32') exec(`start ${url}`);
    else if (platform === 'darwin') exec(`open ${url}`);
    else exec(`xdg-open ${url}`);
  } catch {}
}

async function cmdStatus() {
  const inUse = await isPortInUse(DASHBOARD_PORT);
  const pid = getRunningPid();

  if (inUse || pid) {
    console.log(chalk.green(`\n  ✓ Dashboard çalışıyor`));
    console.log(chalk.gray(`    URL: ${DASHBOARD_URL}`));
    if (pid) console.log(chalk.gray(`    PID: ${pid}`));
  } else {
    console.log(chalk.yellow(`\n  ⏸  Dashboard çalışmıyor`));
    console.log(chalk.gray(`    Başlatmak için: natureco dashboard`));
  }
  console.log('');
}

function cmdUrl() {
  console.log(DASHBOARD_URL);
}

function cmdStop() {
  const pid = getRunningPid();
  if (!pid) {
    console.log(chalk.yellow('\n  Dashboard zaten çalışmıyor.\n'));
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.log(chalk.green(`\n  ✓ Dashboard durduruldu (PID ${pid})\n`));
  } catch (e) {
    console.log(chalk.red(`\n  ❌ Durdurulamadı: ${e.message}\n`));
  }
}

async function dashboard(params) {
  try {
    // Hem string hem array kabul et (eski/yeni bin uyumluluğu)
    const action = Array.isArray(params) ? params[0] : params;
    const allParams = Array.isArray(params) ? params : [params];

    if (!action || action === 'open' || action === 'start') {
      await cmdStart(action !== 'start');
      return;
    }
    if (action === 'status') { await cmdStatus(); return; }
    if (action === 'url') { cmdUrl(); return; }
    if (action === 'stop') { cmdStop(); return; }

    console.log(chalk.yellow('\n  Kullanım:'));
    console.log(chalk.gray('    natureco dashboard            Başlat ve tarayıcıda aç'));
    console.log(chalk.gray('    natureco dashboard start      Sadece başlat'));
    console.log(chalk.gray('    natureco dashboard status     Çalışıyor mu?'));
    console.log(chalk.gray('    natureco dashboard stop       Durdur'));
    console.log(chalk.gray('    natureco dashboard url        URL göster'));
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n  Dashboard error: ${err.message}\n`));
  }
}

module.exports = dashboard;
