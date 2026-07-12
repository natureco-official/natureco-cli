const chalk = require('chalk');
const fs = require('fs');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getConfig, saveConfig } = require('../utils/config');

const PAIRING_FILE = path.join(os.homedir(), '.natureco', 'data', 'pairings.json');

function loadPairings() {
  try {
    if (fs.existsSync(PAIRING_FILE)) return JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
  } catch {}
  return { pairedDevices: [], pendingRequests: [] };
}

function savePairings(data) {
  const dir = path.dirname(PAIRING_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PAIRING_FILE, JSON.stringify(data, null, 2));
}

function generatePairingCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function devicePair(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listDevices();
  if (action === 'request') return requestPairing(params[0], params[1]);
  if (action === 'approve') return approvePairing(params[0]);
  if (action === 'reject') return rejectPairing(params[0]);
  if (action === 'remove') return removeDevice(params[0]);
  if (action === 'pairing-code') return showPairingCode();
  if (action === 'verify') return verifyPairing(params[0], params[1]);

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco device-pair [list|request|approve|reject|remove|pairing-code|verify]\n', '  Usage: natureco device-pair [list|request|approve|reject|remove|pairing-code|verify]\n')));
  process.exit(1);
}

function listDevices() {
  const data = loadPairings();

  console.log(chalk.cyan('\n  📱 Paired Devices\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const devices = data.pairedDevices || [];
  if (devices.length === 0) {
    console.log(chalk.gray(L('  Eşleştirilmiş cihaz yok.\n', '  No paired devices.\n')));
  } else {
    for (const d of devices) {
      console.log(`  ${chalk.green('●')} ${chalk.white(d.name || d.id)} ${chalk.gray(`(${d.type || 'unknown'})`)}`);
      console.log(`    ${chalk.gray('ID:')}    ${d.id}`);
      console.log(`    ${chalk.gray('Since:')} ${d.pairedAt ? new Date(d.pairedAt).toLocaleString() : '-'}`);
      console.log(`    ${chalk.gray('Token:')} ${d.token ? d.token.substring(0, 8) + '…' : '-'}`);
    }
  }

  const pending = data.pendingRequests || [];
  if (pending.length > 0) {
    console.log(chalk.yellow(`\n  ⏳ ${L('Bekleyen İstekler', 'Pending Requests')} (${pending.length})\n`));
    for (const p of pending) {
      console.log(`  ${chalk.yellow('◐')} ${chalk.white(p.name || p.id)} ${chalk.gray(`(${p.type || 'unknown'})`)}`);
      console.log(`    ${chalk.gray('Code:')}  ${chalk.cyan(p.code)}`);
      console.log(`    ${chalk.gray('Since:')} ${p.requestedAt ? new Date(p.requestedAt).toLocaleString() : '-'}`);
    }
    console.log(chalk.gray(L('\n  Onaylamak için:', '\n  To approve:')));
    console.log(chalk.cyan('    natureco device-pair approve <code>'));
    console.log(chalk.cyan('    natureco device-pair reject <code>'));
  }

  console.log();
}

function requestPairing(deviceName, deviceType) {
  const name = deviceName || `Device-${crypto.randomBytes(3).toString('hex')}`;
  const type = deviceType || 'cli';
  const code = generatePairingCode();
  const id = `dev_${crypto.randomBytes(8).toString('hex')}`;

  const data = loadPairings();
  if (!data.pendingRequests) data.pendingRequests = [];

  data.pendingRequests.push({
    id,
    name,
    type,
    code,
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });

  savePairings(data);

  console.log(chalk.cyan('\n  📱 Pairing Request\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Name:')}  ${chalk.cyan(name)}`);
  console.log(`  ${chalk.white('Type:')}  ${chalk.cyan(type)}`);
  console.log(`  ${chalk.white('Code:')}  ${chalk.yellow(code)}`);
  console.log(`  ${chalk.white('ID:')}    ${chalk.gray(id)}`);
  console.log(chalk.gray(`\n  Pairing code expires: ${new Date(Date.now() + 15 * 60 * 1000).toLocaleString()}`));
  console.log(chalk.gray('\n  On another terminal:'));
  console.log(chalk.cyan(`    natureco device-pair approve ${code}`));
  console.log(chalk.cyan(`    natureco device-pair reject ${code}`));
  console.log();
}

function approvePairing(code) {
  if (!code) {
    console.log(chalk.red(L('\n  ❌ Pairing code gerekli\n', '\n  ❌ Pairing code required\n')));
    process.exit(1);
  }

  const data = loadPairings();
  const idx = (data.pendingRequests || []).findIndex(p => p.code === code);

  if (idx === -1) {
    console.log(chalk.red(`\n  ❌ ${L('Geçersiz pairing code', 'Invalid pairing code')}: ${code}\n`));
    console.log(chalk.gray(L('  Bekleyen istekleri görmek için: natureco device-pair list\n', '  To see pending requests: natureco device-pair list\n')));
    process.exit(1);
  }

  const request = data.pendingRequests[idx];
  const token = `nc_${crypto.randomBytes(16).toString('hex')}`;

  if (!data.pairedDevices) data.pairedDevices = [];
  data.pairedDevices.push({
    id: request.id,
    name: request.name,
    type: request.type,
    token,
    pairedAt: new Date().toISOString()
  });

  data.pendingRequests.splice(idx, 1);
  savePairings(data);

  console.log(chalk.green(`\n  ✅ Paired: ${request.name}\n`));
  console.log(chalk.gray(`  Device ID: ${request.id}`));
  console.log(chalk.gray(`  Token: ${token}\n`));
}

function rejectPairing(code) {
  if (!code) {
    console.log(chalk.red(L('\n  ❌ Pairing code gerekli\n', '\n  ❌ Pairing code required\n')));
    process.exit(1);
  }

  const data = loadPairings();
  const idx = (data.pendingRequests || []).findIndex(p => p.code === code);

  if (idx === -1) {
    console.log(chalk.red(`\n  ❌ ${L('Geçersiz pairing code', 'Invalid pairing code')}: ${code}\n`));
    process.exit(1);
  }

  const request = data.pendingRequests[idx];
  data.pendingRequests.splice(idx, 1);
  savePairings(data);

  console.log(chalk.gray(`\n  🔴 Rejected: ${request.name}\n`));
}

function removeDevice(deviceId) {
  if (!deviceId) {
    console.log(chalk.red(L('\n  ❌ Device ID gerekli\n', '\n  ❌ Device ID required\n')));
    console.log(chalk.cyan('    natureco device-pair remove dev_abc123\n'));
    process.exit(1);
  }

  const data = loadPairings();
  const idx = (data.pairedDevices || []).findIndex(d => d.id === deviceId);

  if (idx === -1) {
    console.log(chalk.red(`\n  ❌ ${L('Cihaz bulunamadı', 'Device not found')}: ${deviceId}\n`));
    process.exit(1);
  }

  const device = data.pairedDevices[idx];
  data.pairedDevices.splice(idx, 1);
  savePairings(data);

  console.log(chalk.gray(`\n  🗑️  Removed: ${device.name} (${deviceId})\n`));
}

function showPairingCode() {
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  console.log(chalk.cyan('\n  🔑 Pairing Code\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  Code: ${chalk.bold.yellow(code)}`);
  console.log(`  Expires: ${chalk.gray(expiresAt.toLocaleString())}`);
  console.log(chalk.gray('\n  Share this code with the device to pair.\n'));
  console.log(chalk.gray('  On the other device:'));
  console.log(chalk.cyan(`    natureco device-pair verify ${code} <device-name>\n`));
}

function verifyPairing(code, deviceName) {
  if (!code) {
    console.log(chalk.red(L('\n  ❌ Pairing code gerekli\n', '\n  ❌ Pairing code required\n')));
    process.exit(1);
  }

  const data = loadPairings();
  const pending = data.pendingRequests || [];

  if (pending.some(p => p.code === code)) {
    console.log(chalk.green('\n  ✅ Pairing code valid — awaiting approval\n'));
    console.log(chalk.gray('  Ask the admin to run:'));
    console.log(chalk.cyan(`    natureco device-pair approve ${code}\n`));
    return;
  }

  const paired = data.pairedDevices || [];
  const matched = paired.find(d => {
    const cfg = getConfig();
    return cfg.pairingToken && d.token === cfg.pairingToken;
  });

  if (matched) {
    console.log(chalk.green(`\n  ✅ Already paired as: ${matched.name}\n`));
    return;
  }

  const name = deviceName || `Device-${crypto.randomBytes(3).toString('hex')}`;
  const newId = `dev_${crypto.randomBytes(8).toString('hex')}`;

  if (!data.pendingRequests) data.pendingRequests = [];
  data.pendingRequests.push({
    id: newId,
    name,
    type: 'cli',
    code,
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });

  savePairings(data);

  console.log(chalk.yellow(`\n  ⏳ Pairing requested for "${name}" with code ${code}\n`));
  console.log(chalk.gray('  Admin should approve with:'));
  console.log(chalk.cyan(`    natureco device-pair approve ${code}\n`));
}

module.exports = devicePair;
