const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
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

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco agents [list|set|info|add|bindings|bind|unbind|set-identity]\n', '  Usage: natureco agents [list|set|info|add|bindings|bind|unbind|set-identity]\n')));
  process.exit(1);
}

async function listAgents() {
  const config = getConfig();
  const apiKey = config.providerApiKey || config.apiKey || '';

  F.info(L('Agentlar yükleniyor...', 'Loading agents...'));

  let botList = { bots: [] };
  try {
    botList = await getBots(apiKey);
  } catch {}

  console.log('\n' + tui.styled('  🤖 Agents', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  if (!botList.bots?.length) {
    console.log('\n  ' + tui.C.muted(L('Agent bulunamadı.', 'No agents found.')));
    console.log('  ' + tui.C.muted(L('Oluşturmak için: ', 'To create: ')) + tui.C.brand('developers.natureco.me'));
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
      key: 'name', label: L('İsim', 'Name'), minWidth: 18,
      render: r => r.active
        ? tui.styled(r.name, { color: tui.PALETTE.success, bold: true })
        : tui.C.text(r.name)
    },
    { key: 'id', label: 'ID', minWidth: 16, render: r => tui.C.muted(r.id) },
    { key: 'provider', label: 'Provider', minWidth: 12, render: r => tui.C.text(r.provider) },
    { key: 'model', label: 'Model', minWidth: 18, render: r => tui.C.muted(r.model) },
  ], { borderStyle: 'round', zebra: true }));

  console.log('\n  ' + tui.C.muted(L('Değiştirmek için: ', 'To switch: ')) + tui.C.brand(L('natureco agents set <bot-adı>', 'natureco agents set <bot-name>')));
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
      console.log(chalk.gray(L('\n  Agent bulunamadı.\n', '\n  No agents found.\n')));
      return;
    }
    const { selected } = await inquirer.prompt([{
      type: 'list',
      name: 'selected',
      message: L('  Aktif agent seç:', '  Select active agent:'),
      choices: botList.bots.map(b => ({ name: b.name, value: b.name })),
    }]);
    botName = selected;
  }

  const bot = botList.bots?.find(b => b.name === botName || b.id === botName);
  if (!bot && botList.bots?.length) {
    console.log(chalk.red(`\n  ❌ ${L('Agent bulunamadı', 'No agent found')}: ${botName}\n`));
    process.exit(1);
  }

  config.botName = botName;
  if (bot?.id) config.defaultBotId = bot.id;
  saveConfig(config);

  console.log(chalk.green(`\n  ✓ ${L('Aktif agent', 'Active agent')}: ${botName}\n`));
}

async function agentInfo(botName) {
  const config = getConfig();
  const apiKey = config.providerApiKey || config.apiKey || '';
  const name = botName || config.botName;

  if (!name) {
    F.error(L('Agent adı belirtin: natureco agents info <bot-adı>', 'Specify agent name: natureco agents info <bot-name>'));
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
    F.meta(L('(Detay alınamadı)', '(Details unavailable)'));
  }

  try {
    const { loadMemory } = require('../utils/memory');
    const mem = loadMemory(bot?.id || 'universal-provider');
    if (mem.name || mem.facts?.length) {
      if (mem.name) F.kv(L('Kullanıcı', 'User'), mem.name);
      F.kv(L('Hafıza', 'Memory'), (mem.facts || []).length + L(' bilgi', ' facts'));
    }
  } catch {}
}

async function addAgent() {
  console.log('');
  console.log(chalk.gray(L('  Yeni agent oluşturmak için Developers Portal\'ı kullanın:', '  Use the Developers Portal to create a new agent:')));
  console.log(chalk.cyan('  developers.natureco.me\n'));
  console.log(chalk.gray(L('  Oluşturduktan sonra: ', '  After creating: ')) + chalk.cyan('natureco agents list\n'));
}

// ── Bindings ──────────────────────────────────────────────────────────────────

function listBindings() {
  const bindings = loadBindings();
  const keys = Object.keys(bindings);

  F.section('Bindings (' + keys.length + ')');

  if (keys.length === 0) {
    F.meta(L('Henüz binding yok.', 'No bindings yet.'));
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
    F.error(L('Kullanım: natureco agents bind <agentId> <channel>', 'Usage: natureco agents bind <agentId> <channel>'));
    return;
  }
  const bindings = loadBindings();
  if (!bindings[agentId]) bindings[agentId] = [];
  if (!bindings[agentId].includes(channel)) bindings[agentId].push(channel);
  saveBindings(bindings);
  F.success('Agent ' + agentId + ' → ' + channel + L(' bağlandı', ' bound'));
}

function unbindAgent(agentId, channel) {
  if (!agentId || !channel) {
    F.error(L('Kullanım: natureco agents unbind <agentId> <channel>', 'Usage: natureco agents unbind <agentId> <channel>'));
    return;
  }
  const bindings = loadBindings();
  if (!bindings[agentId]) {
    F.warning('Agent ' + agentId + L(' için binding bulunamadı', ' has no bindings'));
    return;
  }
  bindings[agentId] = bindings[agentId].filter(ch => ch !== channel);
  if (bindings[agentId].length === 0) delete bindings[agentId];
  saveBindings(bindings);
  F.success('Agent ' + agentId + ' → ' + channel + L(' bağlantısı kaldırıldı', ' unbound'));
}

function setIdentity(agentId, identity) {
  if (!agentId) {
    F.error(L('Kullanım: natureco agents set-identity <agentId> <identity>', 'Usage: natureco agents set-identity <agentId> <identity>'));
    return;
  }
  const identities = loadIdentities();
  identities[agentId] = identity || 'default';
  saveIdentities(identities);
  F.success('Agent ' + agentId + ' identity: ' + (identity || 'default'));
}

module.exports = agents;
