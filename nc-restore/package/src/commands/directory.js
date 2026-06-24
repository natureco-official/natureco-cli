const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { getConfig } = require('../utils/config');

const PEERS_FILE = path.join(os.homedir(), '.natureco', 'peers.json');

function loadPeers() {
  try {
    return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function savePeers(peers) {
  const dir = path.dirname(PEERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
}

function directory(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'self') return showSelf();
  if (action === 'channels' || action === 'peers') return listPeers();
  if (action === 'search') return searchPeers(params.join(' '));
  if (action === 'register') return registerPeer(params[0], params.slice(1).join(' '));
  if (action === 'remove') return removePeer(params[0]);
  if (action === 'groups' && params[0] === 'list') return groupsList();
  if (action === 'groups' && params[0] === 'members') return groupsMembers(params[1]);
  if (action === 'groups') return groupsList();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco directory [self|peers|search|register|remove|groups]\n'));
  process.exit(1);
}

function showSelf() {
  const config = getConfig();
  console.log(chalk.cyan('\n  Self\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Name:')}     ${chalk.cyan(config.agentName || process.env.USER || 'user')}`);
  console.log(`  ${chalk.white('Gateway:')}  ${chalk.gray(config.gatewayUrl || 'not configured')}`);
  console.log(`  ${chalk.white('Provider:')} ${chalk.gray(config.provider || 'not set')}`);
  console.log(`  ${chalk.white('Model:')}    ${chalk.gray(config.model || 'not set')}`);
  console.log(`  ${chalk.white('User ID:')}  ${chalk.gray(config.userId || 'local')}`);
  console.log(`  ${chalk.white('Peers:')}    ${chalk.gray(`${loadPeers().length} registered`)}`);
  console.log(`  ${chalk.white('Host:')}     ${chalk.gray(os.hostname())}`);
  console.log();
}

function listPeers() {
  const config = getConfig();
  const peers = loadPeers();

  if (peers.length === 0) {
    console.log(chalk.cyan('\n  Directory\n'));
    console.log(chalk.gray('  ' + '─'.repeat(48)));

    const channels = ['telegram', 'whatsapp', 'discord', 'slack', 'signal', 'irc', 'mattermost', 'imessage', 'sms'];
    let found = false;

    for (const ch of channels) {
      if (config[ch]) {
        const info = typeof config[ch] === 'object' ? Object.keys(config[ch]).join(', ') : 'connected';
        console.log(`  ${chalk.green('●')} ${chalk.white(ch)}: ${chalk.gray(info)}`);
        found = true;
      }
    }

    if (!found) console.log(chalk.gray('  No channels configured.'));
    console.log(chalk.gray('\n  Register peers: ') + chalk.cyan('natureco directory register <url> [name]'));
    console.log();
    return;
  }

  console.log(chalk.cyan('\n  Known Peers\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  peers.forEach(p => {
    const status = p.lastSeen ? chalk.gray(`(seen: ${new Date(p.lastSeen).toLocaleDateString()})`) : '';
    console.log(`  ${chalk.green('●')} ${chalk.white(p.name || p.url)}`);
    console.log(`     ${chalk.gray(p.url)} ${status}`);
  });
  console.log(chalk.gray(`\n  Total: ${peers.length} peers`));
  console.log();
}

function searchPeers(query) {
  if (!query) {
    console.log(chalk.red('\n  ❌ Arama sorgusu gerekli\n'));
    console.log(chalk.gray('  Kullanım: natureco directory search <query>\n'));
    process.exit(1);
  }

  const peers = loadPeers();
  const lower = query.toLowerCase();
  const results = peers.filter(p =>
    (p.name && p.name.toLowerCase().includes(lower)) ||
    (p.url && p.url.toLowerCase().includes(lower)) ||
    (p.tags && p.tags.some(t => t.toLowerCase().includes(lower)))
  );

  if (results.length === 0) {
    console.log(chalk.yellow(`\n  "${query}" için eşleşen peer bulunamadı.\n`));
    return;
  }

  console.log(chalk.cyan(`\n  Search Results (${results.length}) for: "${query}"\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  results.forEach(p => {
    console.log(`  ${chalk.green('●')} ${chalk.white(p.name || p.url)}`);
    console.log(`     ${chalk.gray(p.url)}`);
    if (p.tags) console.log(`     ${chalk.gray('tags: ' + p.tags.join(', '))}`);
  });
  console.log();
}

function registerPeer(url, name) {
  if (!url) {
    console.log(chalk.red('\n  ❌ URL gerekli\n'));
    console.log(chalk.gray('  Kullanım: natureco directory register <url> [name]\n'));
    process.exit(1);
  }

  const peers = loadPeers();
  if (peers.some(p => p.url === url)) {
    console.log(chalk.yellow(`\n  ⚠ Bu peer zaten kayıtlı: ${url}\n`));
    return;
  }

  peers.push({ url, name: name || url, tags: [], addedAt: new Date().toISOString(), lastSeen: null });
  savePeers(peers);
  console.log(chalk.green(`\n  ✓ Peer kaydedildi: ${name || url}\n`));
}

function removePeer(urlOrName) {
  if (!urlOrName) {
    console.log(chalk.red('\n  ❌ URL veya isim gerekli\n'));
    console.log(chalk.gray('  Kullanım: natureco directory remove <url|name>\n'));
    process.exit(1);
  }

  let peers = loadPeers();
  const initialLength = peers.length;
  peers = peers.filter(p => p.url !== urlOrName && p.name !== urlOrName);

  if (peers.length === initialLength) {
    console.log(chalk.yellow(`\n  ⚠ Peer bulunamadı: ${urlOrName}\n`));
    return;
  }

  savePeers(peers);
  console.log(chalk.green(`\n  ✓ Peer kaldırıldı: ${urlOrName}\n`));
}

function groupsList() {
  console.log(chalk.cyan('\n  Groups: (stub)\n'));
}

function groupsMembers(name) {
  if (!name) {
    console.log(chalk.red('\n  ❌ Group name gerekli\n'));
    process.exit(1);
  }
  console.log(chalk.cyan('\n  Members of group "' + name + '":\n'));
  const peers = loadPeers().filter(p => p.tags && p.tags.includes('group:' + name));
  if (peers.length === 0) {
    console.log(chalk.gray('  No members found.\n'));
    return;
  }
  for (const p of peers) {
    console.log(`  ${chalk.green('●')} ${chalk.white(p.name || p.url)}`);
  }
  console.log();
}

module.exports = directory;
