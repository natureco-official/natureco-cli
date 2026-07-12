const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const dns = require('dns');
const os = require('os');

function discoverGateway() {
  return new Promise((resolve) => {
    const interfaces = os.networkInterfaces();
    let gateway = null;

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          // Try common gateway addresses
          const parts = addr.address.split('.');
          for (const gw of [
            `${parts[0]}.${parts[1]}.${parts[2]}.1`,
            `${parts[0]}.${parts[1]}.${parts[2]}.254`
          ]) {
            const sock = new (require('net').Socket)();
            sock.setTimeout(500);
            sock.on('connect', () => { sock.destroy(); if (!gateway) gateway = gw; });
            sock.on('error', () => {});
            sock.on('timeout', () => sock.destroy());
            sock.connect(80, gw);
          }
        }
      }
    }

    setTimeout(() => resolve(gateway), 1000);
  });
}

async function bonjour(args) {
  const [action, ...params] = (args || []);

  if (!action || action === 'scan') return scanNetwork();
  if (action === 'discover') return discoverServices();
  if (action === 'status') return statusBonjour();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco bonjour [scan|discover|status]\n', '  Usage: natureco bonjour [scan|discover|status]\n')));
  process.exit(1);
}

async function scanNetwork() {
  console.log(chalk.cyan(L('\n  Ağ taranıyor...\n', '\n  Scanning network...\n')));

  const interfaces = os.networkInterfaces();
  const found = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        found.push({
          interface: name,
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        });
      }
    }
  }

  if (found.length === 0) {
    console.log(chalk.gray(L('  Ağ arayüzü bulunamadı.\n', '  No network interfaces found.\n')));
    return;
  }

  const gateway = await discoverGateway();

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(L('\n  Ağ Arayüzleri\n', '\n  Network Interfaces\n')));

  found.forEach(f => {
    console.log(chalk.white(`  ${f.interface}`));
    console.log(chalk.gray(`    IP: ${f.address}`));
    console.log(chalk.gray(`    MAC: ${f.mac}`));
  });

  if (gateway) {
    console.log(chalk.gray(L('\n  Varsayılan ağ geçidi: ', '\n  Default gateway: ')) + chalk.cyan(gateway));
  }

  console.log(chalk.gray(L('\n  Service discovery için: ', '\n  For service discovery: ')) + chalk.cyan('natureco bonjour discover\n'));
}

async function discoverServices() {
  console.log(chalk.cyan(L('\n  Servis keşfi başlatılıyor...\n', '\n  Starting service discovery...\n')));

  // Try common ports
  const commonServices = [
    { name: 'HTTP', port: 80 },
    { name: 'HTTPS', port: 443 },
    { name: 'SSH', port: 22 },
    { name: 'NatureCo Gateway', port: 3848 },
    { name: 'Dashboard', port: 3849 },
    { name: 'OpenClaw', port: 3000 },
    { name: 'MCP', port: 3100 }
  ];

  const config = getConfig();
  const additionalPorts = config.discoveryPorts || [];
  const allServices = [...commonServices, ...additionalPorts.map(p => ({ name: `Port ${p}`, port: p }))];

  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const base = addr.address.split('.').slice(0, 3).join('.');
        for (let i = 1; i <= 5; i++) {
          const host = `${base}.${i}`;
          for (const svc of allServices) {
            try {
              await new Promise((resolve, reject) => {
                const sock = new (require('net').Socket)();
                sock.setTimeout(200);
                sock.on('connect', () => {
                  sock.destroy();
                  results.push({ host, port: svc.port, service: svc.name });
                  resolve();
                });
                sock.on('error', () => reject());
                sock.on('timeout', () => reject());
                sock.connect(svc.port, host);
              });
            } catch {}
          }
        }
      }
    }
  }

  if (results.length === 0) {
    console.log(chalk.gray(L('  Servis bulunamadı.\n', '  No services found.\n')));
    return;
  }

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(L('\n  Bulunan Servisler\n', '\n  Discovered Services\n')));

  results.forEach(r => {
    console.log(`  ${chalk.green('●')} ${chalk.white(r.service)} ${chalk.gray(`→ ${r.host}:${r.port}`)}`);
  });

  console.log(chalk.gray(L('\n  Özel port eklemek: ', '\n  Add custom port: ')) + chalk.cyan('natureco config set discoveryPorts [3000,4000]\n'));
}

function statusBonjour() {
  console.log(chalk.gray(L('\n  Bonjour/mDNS Servis Keşfi\n', '\n  Bonjour/mDNS Service Discovery\n')));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(L('  Ağ keşif aracı — NatureCo servislerini ve gateway\'i bulur.', '  Network discovery tool — finds NatureCo services and the gateway.')));
  console.log(chalk.gray(L('  Komutlar:', '  Commands:')));
  console.log(chalk.cyan('    scan      ') + chalk.gray(L('Ağ arayüzlerini ve IP\'leri listele', 'List network interfaces and IPs')));
  console.log(chalk.cyan('    discover  ') + chalk.gray(L('Yerel ağda NatureCo servislerini ara', 'Search for NatureCo services on the local network')));
  console.log(chalk.gray(L('\n  Port yapılandırması:', '\n  Port configuration:')));
  console.log(chalk.gray(L('    Varsayılan: 3848 (Gateway), 3849 (Dashboard)', '    Default: 3848 (Gateway), 3849 (Dashboard)')));
  console.log(chalk.gray(L('    Özel: ', '    Custom: ')) + chalk.cyan('natureco config set discoveryPorts [3000,4000]\n'));
}

module.exports = bonjour;
