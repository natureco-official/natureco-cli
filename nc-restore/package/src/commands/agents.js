const chalk = require('chalk');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');
const inquirer = require('../utils/inquirer-wrapper');
const { getConfig, saveConfig } = require('../utils/config');
const { getBots } = require('../utils/api');

const BINDINGS_FILE = path.join(os.homedir(), '.natureco', 'agent-bindings.json');
const IDENTITIES_FILE = path.join(os.homedir(), '.natureco', 'agent-identities.json');

function loadBindings() {
  try {
    if (fs.existsSync(BINDINGS_FILE)) return JSON.parse(fs.readFileSync(BINDINGS_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveBindings(data) {
  fs.mkdirSync(path.dirname(BINDINGS_FILE), { recursive: true });
  fs.writeFileSync(BINDINGS_FILE, JSON.stringify(data, null, 2));
}

function loadIdentities() {
  try {
    if (fs.existsSync(IDENTITIES_FILE)) return JSON.parse(fs.readFileSync(IDENTITIES_FILE, 'utf8'));
  } catch {}
  return {};
}

function saveIdentities(data) {
  fs.mkdirSync(path.dirname(IDENTITIES_FILE), { recursive: true });
  fs.writeFileSync(IDENTITIES_FILE, JSON.stringify(data, null, 2));
}

async function agents(args) {
  const [action, ...params] = (args || []);

  if (!action || action === 'list') return listAgents();
  if (action === 'set') return setActiveAgent(params[0]);
  if (action === 'info') return agentInfo(params[0]);
  if (action === 'add') return addAgent();
  if (action === 'bindings') return listBindings();
  if (action === 'bind') return bindAgent(params[0], params[1]);
  if (action === 'unbind') return unbindAgent(params[0], params[1]);
  if (action === 'set-identity') return setIdentity(params[0], params.slice(1).join(' '));

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco agents [list|set|info|add|bindings|bind|unbind|set-identity]\n'));
  process.exit(1);
}

async function listAgents() {
  const config = getConfig();
  const apiKey = config.providerApiKey || config.apiKey || '';

  F.info('Agentlar yükleniyor...');

  let botList = { bots: [] };
  try {
    botList = await getBots(apiKey);
  } catch {}

  console.log('\n' + tui.styled('  🤖 Agents', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  if (!botList.bots?.length) {
    console.log('\n  ' + tui.C.muted('Agent bulunamadı.'));
    console.log('  ' + tui.C.muted('Oluşturmak için: ') + tui.C.brand('developers.natureco.me'));
    console.log('');
    return;
  }

  const rows = botList.bots.map(bot => ({
    name: bot.name + (config.botName === bot.name ? ' ●' : ''),
    id: bot.id,
    provider: bot.ai_provider || 'groq',
    model: bot.model || '—',
    active: config.botName === bot.name,
  }));

  console.log('\n' + tui.table(rows, [
    {
      key: 'name', label: 'İsim', minWidth: 18,
      render: r => r.active
        ? tui.styled(r.name, { color: tui.PALETTE.success, bold: true })
        : tui.C.text(r.name)
    },
    { key: 'id', label: 'ID', minWidth: 16, render: r => tui.C.muted(r.id) },
    { key: 'provider', label: 'Provider', minWidth: 12, render: r => tui.C.text(r.provider) },
    { key: 'model', label: 'Model', minWidth: 18, render: r => tui.C.muted(r.model) },
  ], { borderStyle: 'round', zebra: true }));

  console.log('\n  ' + tui.C.muted('Değiştirmek için: ') + tui.C.brand('natureco agents set <bot-adı>'));
  console.log('');
}

async function setActiveAgent(botName) {
  const config = getConfig();
  const apiKey = config.providerApiKey || config.apiKey || '';

  let botList = { bots: [] };
  try {
    botList = await getBots(apiKey);
  } catch {}

  if (!botName) {
    if (!botList.bots?.length) {
      console.log(chalk.gray('\n  Agent bulunamadı.\n'));
      return;
    }
    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message: '  Aktif agent seç:',
      choices: botList.bots.map(b => ({ name: b.name, value: b.name })),
    }]);
    botName = selected;
  }

  const bot = botList.bots?.find(b => b.name === botName || b.id === botName);
  if (!bot && botList.bots?.length) {
    console.log(chalk.red(`\n  ❌ Agent bulunamadı: ${botName}\n`));
    process.exit(1);
  }

  config.botName = botName;
  if (bot?.id) config.defaultBotId = bot.id;
  saveConfig(config);

  console.log(chalk.green(`\n  ✓ Aktif agent: ${botName}\n`));
}

async function agentInfo(botName) {
  const config = getConfig();
  const apiKey = config.providerApiKey || config.apiKey || '';
  const name = botName || config.botName;

  if (!name) {
    F.error('Agent adı belirtin: natureco agents info <bot-adı>');
    return;
  }

  let botList = { bots: [] };
  try {
    botList = await getBots(apiKey);
  } catch {}

  const bot = botList.bots?.find(b => b.name === name || b.id === name);

  F.header('Agent: ' + name);

  if (bot) {
    F.kv('ID', bot.id);
    F.kv('Provider', bot.ai_provider || 'groq');
    if (bot.model) F.kv('Model', bot.model);
    if (bot.system_prompt) {
      F.kv('Prompt', bot.system_prompt.slice(0, 80) + (bot.system_prompt.length > 80 ? '...' : ''));
    }
  } else {
    F.meta('(Detay alınamadı)');
  }

  try {
    const { loadMemory } = require('../utils/memory');
    const mem = loadMemory(bot?.id || 'universal-provider');
    if (mem.name || mem.facts?.length) {
      if (mem.name) F.kv('Kullanıcı', mem.name);
      F.kv('Hafıza', (mem.facts || []).length + ' bilgi');
    }
  } catch {}
}

async function addAgent() {
  console.log('');
  console.log(chalk.gray('  Yeni agent oluşturmak için Developers Portal\'ı kullanın:'));
  console.log(chalk.cyan('  developers.natureco.me\n'));
  console.log(chalk.gray('  Oluşturduktan sonra: ') + chalk.cyan('natureco agents list\n'));
}

// ── Bindings ──────────────────────────────────────────────────────────────────

function listBindings() {
  const bindings = loadBindings();
  const keys = Object.keys(bindings);

  F.section('Bindings (' + keys.length + ')');

  if (keys.length === 0) {
    F.meta('Henüz binding yok.');
    return;
  }

  const items = [];
  keys.forEach(agentId => {
    bindings[agentId].forEach(ch => items.push(agentId + ' → ' + ch));
  });
  F.list(items);
}

function bindAgent(agentId, channel) {
  if (!agentId || !channel) {
    F.error('Kullanım: natureco agents bind <agentId> <channel>');
    return;
  }
  const bindings = loadBindings();
  if (!bindings[agentId]) bindings[agentId] = [];
  if (!bindings[agentId].includes(channel)) bindings[agentId].push(channel);
  saveBindings(bindings);
  F.success('Agent ' + agentId + ' → ' + channel + ' bağlandı');
}

function unbindAgent(agentId, channel) {
  if (!agentId || !channel) {
    F.error('Kullanım: natureco agents unbind <agentId> <channel>');
    return;
  }
  const bindings = loadBindings();
  if (!bindings[agentId]) {
    F.warning('Agent ' + agentId + ' için binding bulunamadı');
    return;
  }
  bindings[agentId] = bindings[agentId].filter(ch => ch !== channel);
  if (bindings[agentId].length === 0) delete bindings[agentId];
  saveBindings(bindings);
  F.success('Agent ' + agentId + ' → ' + channel + ' bağlantısı kaldırıldı');
}

function setIdentity(agentId, identity) {
  if (!agentId) {
    F.error('Kullanım: natureco agents set-identity <agentId> <identity>');
    return;
  }
  const identities = loadIdentities();
  identities[agentId] = identity || 'default';
  saveIdentities(identities);
  F.success('Agent ' + agentId + ' identity: ' + (identity || 'default'));
}

module.exports = agents;
