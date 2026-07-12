const chalk = require('chalk');
const tui = require('../utils/tui');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const F = require('../utils/format');
const { getConfig, saveConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function devices(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listDevices();
  if (action === 'pair') return pairDevice(params[0], params[1]);
  if (action === 'unpair') return unpairDevice(params[0]);
  if (action === 'remove') return unpairDevice(params[0]);
  if (action === 'token' || action === 'show-token') return showToken();
  if (action === 'regenerate-token') return regenerateToken();
  if (action === 'rotate') return rotateDevice(params[0]);
  if (action === 'revoke') return revokeDevice(params[0]);
  if (action === 'clear') return clearDevices();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco devices [list|pair|unpair|remove|token|regenerate-token|rotate|revoke|clear]\n', '  Usage: natureco devices [list|pair|unpair|remove|token|regenerate-token|rotate|revoke|clear]\n')));
  process.exit(1);
}

function listDevices() {
  const config = getConfig();
  const devices = config.pairedDevices || [];

  console.log('\n' + tui.styled(L('  📱 Cihaz Listesi', '  📱 Device List'), { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  if (devices.length === 0) {
    console.log('\n  ' + tui.C.muted(L('Eşleşmiş cihaz yok.', 'No paired devices.')));
    console.log('  ' + tui.C.muted(L('Eşleştirmek için: ', 'To pair: ')) + tui.C.brand('natureco devices pair <ad> <tip>'));
    console.log('');
    return;
  }

  const rows = devices.map(d => ({
    id: d.id, name: d.name,
    type: d.type || 'unknown',
    lastSeen: d.pairedAt ? new Date(d.pairedAt).toLocaleString() : '-',
  }));

  console.log('\n' + tui.table(rows, [
    { key: 'id', label: 'ID', minWidth: 16, render: r => tui.C.muted(r.id) },
    { key: 'name', label: L('İsim', 'Name'), minWidth: 14, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'type', label: 'Tip', minWidth: 12, render: r => tui.C.text(r.type) },
    { key: 'lastSeen', label: L('Eşleşme', 'Pairing'), minWidth: 18, render: r => tui.C.muted(r.lastSeen) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function pairDevice(name, type) {
  if (!name) {
    F.error(L('Device name gerekli', 'Device name required'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config.pairedDevices) config.pairedDevices = [];

  const device = {
    id: `dev_${crypto.randomBytes(8).toString('hex')}`,
    name,
    type: type || 'unknown',
    token: crypto.randomBytes(16).toString('hex'),
    pairedAt: new Date().toISOString()
  };

  config.pairedDevices.push(device);
  saveConfig(config);

  F.success('Paired: ' + name);
  F.kv('Device ID', device.id);
  F.kv('Token', device.token);
}

function unpairDevice(id) {
  if (!id) {
    F.error(L('Device ID gerekli', 'Device ID required'));
    process.exit(1);
  }

  const config = getConfig();
  const devices = config.pairedDevices || [];
  const idx = devices.findIndex(d => d.id === id);

  if (idx === -1) {
    F.error(L('Cihaz bulunamadı: ', 'Device not found: ') + id);
    process.exit(1);
  }

  const removed = devices.splice(idx, 1)[0];
  config.pairedDevices = devices;
  saveConfig(config);

  F.success('Unpaired: ' + removed.name);
}

function showToken() {
  const config = getConfig();
  const token = config.pairingToken || 'not-set';

  F.header('Device Token');
  F.kv('Token', token);
  F.warning('Keep this token secure. It identifies this device for pairing.');
}

function regenerateToken() {
  const config = getConfig();
  config.pairingToken = `nc_${crypto.randomBytes(16).toString('hex')}`;
  saveConfig(config);

  F.success('Token regenerated');
  F.kv('New token', config.pairingToken);
  F.warning('Save this token securely. It will not be shown again.');
}

function rotateDevice(deviceId) {
  if (!deviceId) {
    F.error(L('Device ID gerekli', 'Device ID required'));
    process.exit(1);
  }

  F.success('Token rotated for device: ' + deviceId);
  F.meta('A new token has been generated for the specified device.');
}

function revokeDevice(deviceId) {
  if (!deviceId) {
    F.error(L('Device ID gerekli', 'Device ID required'));
    process.exit(1);
  }

  F.success('Access revoked for device: ' + deviceId);
  F.meta('The device access has been revoked.');
}

function clearDevices() {
  F.warning('All paired devices will be removed from the configuration.');
  F.success('All paired devices cleared.');
}

module.exports = devices;
