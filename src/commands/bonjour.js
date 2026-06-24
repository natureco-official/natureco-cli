const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');
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
  console.log(chalk.gray('  Kullanım: natureco bonjour [scan|discover|status]\n'));
  process.exit(1);
}

async function scanNetwork() {
  console.log(chalk.cyan('\n  Ağ taranıyor...\n'));

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
    console.log(chalk.gray('  Ağ arayüzü bulunamadı.\n'));
    return;
  }

  const gateway = await discoverGateway();

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold('\n  Ağ Arayüzleri\n'));

  found.forEach(f => {
    console.log(chalk.white(`  ${f.interface}`));
    console.log(chalk.gray(`    IP: ${f.address}`));
    console.log(chalk.gray(`    MAC: ${f.mac}`));
  });

  if (gateway) {
    console.log(chalk.gray('\n  Varsayılan ağ geçidi: ') + chalk.cyan(gateway));
  }

  console.log(chalk.gray('\n  Service discovery için: ') + chalk.cyan('natureco bonjour discover\n'));
}

async function discoverServices() {
  console.log(chalk.cyan('\n  Servis keşfi başlatılıyor...\n'));

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
    console.log(chalk.gray('  Servis bulunamadı.\n'));
    return;
  }

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold('\n  Bulunan Servisler\n'));

  results.forEach(r => {
    console.log(`  ${chalk.green('●')} ${chalk.white(r.service)} ${chalk.gray(`→ ${r.host}:${r.port}`)}`);
  });

  console.log(chalk.gray('\n  Özel port eklemek: ') + chalk.cyan('natureco config set discoveryPorts [3000,4000]\n'));
}

function statusBonjour() {
  console.log(chalk.gray('\n  Bonjour/mDNS Servis Keşfi\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('  Ağ keşif aracı — NatureCo servislerini ve gateway\'i bulur.'));
  console.log(chalk.gray('  Komutlar:'));
  console.log(chalk.cyan('    scan      ') + chalk.gray('Ağ arayüzlerini ve IP\'leri listele'));
  console.log(chalk.cyan('    discover  ') + chalk.gray('Yerel ağda NatureCo servislerini ara'));
  console.log(chalk.gray('\n  Port yapılandırması:'));
  console.log(chalk.gray('    Varsayılan: 3848 (Gateway), 3849 (Dashboard)'));
  console.log(chalk.gray('    Özel: ') + chalk.cyan('natureco config set discoveryPorts [3000,4000]\n'));
}

module.exports = bonjour;
