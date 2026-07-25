const chalk = require('chalk');
const dns = require('dns');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const os = require('os');

function dnsCmd(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'discover') return discoverNetwork();
  if (action === 'resolve') return resolveHost(params[0]);
  if (action === 'services') return discoverServices();

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco dns [discover|resolve <host>|services]\n', '  Usage: natureco dns [discover|resolve <host>|services]\n')));
  process.exit(1);
}

function discoverNetwork() {
  console.log(chalk.cyan('\n  Network Discovery (DNS)\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const interfaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  ${chalk.white(name)}`);
        console.log(`    ${chalk.gray('IP:')}    ${addr.address}`);
        console.log(`    ${chalk.gray('MAC:')}   ${addr.mac}`);
        console.log(`    ${chalk.gray('Mask:')}  ${addr.netmask}`);
      }
    }
  }

  const tailscaleIP = detectTailscale();
  if (tailscaleIP) {
    console.log(`\n  ${chalk.green('●')} ${chalk.white('Tailscale')}: ${chalk.cyan(tailscaleIP)}`);
    const hostname = os.hostname();
    dns.resolveTxt(`_natureco._tcp.${hostname}.tailscale.net`, (err, records) => {
      if (!err && records) {
        console.log(`  ${chalk.gray('  Service:')} ${chalk.cyan(records.flat().join(', '))}`);
      }
    });
  }

  const zerotier = detectZeroTier();
  if (zerotier) {
    console.log(`  ${chalk.green('●')} ${chalk.white('ZeroTier')}: ${chalk.cyan(zerotier)}`);
  }

  console.log(chalk.gray('\n  mDNS: ') + chalk.cyan('natureco bonjour scan'));
  console.log(chalk.gray('  Resolve: ') + chalk.cyan('natureco dns resolve <hostname>'));
  console.log(chalk.gray('  Services: ') + chalk.cyan('natureco dns services\n'));
}

function detectTailscale() {
  try {
    const tailscaleDir = os.platform() === 'win32'
      ? os.homedir() + '\\AppData\\Local\\Tailscale'
      : '/var/run/tailscale';
    if (!require('fs').existsSync(tailscaleDir)) return null;

    const interfaces = os.networkInterfaces();
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && addr.address.startsWith('100.')) {
          return addr.address;
        }
      }
    }
  } catch {}
  return null;
}

function detectZeroTier() {
  try {
    const interfaces = os.networkInterfaces();
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && (
          addr.address.startsWith('10.144.') ||
          addr.address.startsWith('10.147.')
        )) {
          return addr.address;
        }
      }
    }
  } catch {}
  return null;
}

function resolveHost(hostname) {
  if (!hostname) {
    console.log(chalk.red('\n  ❌ Hostname gerekli\n'));
    console.log(chalk.gray(L('  Kullanım: natureco dns resolve <hostname>\n', '  Usage: natureco dns resolve <hostname>\n')));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n  Resolving: ${hostname}\n`));

  dns.resolve4(hostname, (err, addresses) => {
    if (err && err.code !== 'ENODATA') {
      console.log(chalk.red(`  ❌ ${err.message}\n`));
      return;
    }

    const results = [];
    if (addresses && addresses.length > 0) {
      for (const addr of addresses) {
        results.push({ type: 'A', value: addr });
      }
    }

    dns.resolve6(hostname, (err6, addrs6) => {
      if (!err6 && addrs6) {
        for (const addr of addrs6) {
          results.push({ type: 'AAAA', value: addr });
        }
      }

      dns.resolveTxt(hostname, (errTxt, txts) => {
        if (!errTxt && txts) {
          for (const txt of txts) {
            results.push({ type: 'TXT', value: txt.join(' ') });
          }
        }

        dns.resolveSrv(`_natureco._tcp.${hostname}`, (errSrv, srvs) => {
          if (!errSrv && srvs) {
            for (const srv of srvs) {
              results.push({ type: 'SRV', value: `${srv.name}:${srv.port} (priority ${srv.priority}, weight ${srv.weight})` });
            }
          }

          if (results.length === 0) {
            console.log(chalk.gray('  No DNS records found.\n'));
            return;
          }

          console.log(chalk.gray('  ' + '─'.repeat(48)));
          for (const r of results) {
            console.log(`  ${chalk.white(hostname)} ${chalk.cyan(r.type)} ${chalk.gray('→')} ${chalk.white(r.value)}`);
          }
          console.log();
        });
      });
    });
  });
}

function discoverServices() {
  console.log(chalk.cyan('\n  Service Discovery (DNS-SD)\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const services = [
    '_natureco._tcp',
    '_natureco-gateway._tcp',
    '_natureco-dashboard._tcp',
    '_mcp._tcp',
    '_openclaw._tcp',
  ];

  let pending = services.length;
  let found = false;

  for (const svc of services) {
    dns.resolveSrv(svc + '.local', { hints: dns.ADDRCONFIG }, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        found = true;
        console.log(`  ${chalk.green('●')} ${chalk.white(svc)}`);
        for (const addr of addresses) {
          dns.resolve4(addr.name, { hints: dns.ADDRCONFIG }, (err4, ips) => {
            const ip = ips && ips.length > 0 ? `(${ips[0]})` : '';
            console.log(`     ${chalk.gray(`${addr.name}:${addr.port} ${ip}`)}`);
          });
        }
        console.log();
      }
      pending--;
      if (pending === 0 && !found) {
        console.log(chalk.gray('  No NatureCo services discovered via DNS-SD.\n'));
        console.log(chalk.gray('  Try: ') + chalk.cyan('natureco bonjour discover'));
        console.log(chalk.gray('  Try: ') + chalk.cyan('natureco dns discover\n'));
      }
    });
  }

  setTimeout(() => {
    if (!found) {
      console.log(chalk.gray('  Discovering... (may take a moment)\n'));
    }
  }, 500);
}

module.exports = dnsCmd;
