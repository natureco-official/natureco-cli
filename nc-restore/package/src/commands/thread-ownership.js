const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');

const MENTION_TTL_MS = 300 * 1000;

function threadOwnership(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusOwnership();
  if (action === 'list') return listOwnership();
  if (action === 'assign') return assignOwnership(params[0], params[1], params[2]);
  if (action === 'release') return releaseOwnership(params[0], params[1]);
  if (action === 'check') return checkOwnership(params[0], params[1], params[2]);
  if (action === 'agent') return setDefaultAgent(params[0]);

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco thread-ownership [status|list|assign|release|check|agent]\n'));
  process.exit(1);
}

function statusOwnership() {
  const config = getConfig();
  const to = config.threadOwnership || {};
  const agents = to.agents || { default: config.agentName || 'default' };

  const totalAssigned = Object.keys(to).filter(k => k !== 'agents').length;

  console.log(chalk.cyan('\n  🧵 Thread Ownership\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Default Agent:')} ${chalk.cyan(agents.default || 'default')}`);
  console.log(`  ${chalk.white('Assigned:')}      ${chalk.cyan(totalAssigned)} threads`);
  console.log(`  ${chalk.white('Slack Forwarder:')} ${chalk.gray(to.forwarderUrl || process.env.SLACK_FORWARDER_URL || 'not configured')}`);
  console.log(`  ${chalk.white('Config Path:')}   ${chalk.gray('~/.natureco/config.json → threadOwnership')}`);
  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.cyan('    list') + chalk.gray('                        List assignments'));
  console.log(chalk.cyan('    assign <thread> <agent> [channel]') + chalk.gray('  Assign thread'));
  console.log(chalk.cyan('    release <thread> [channel]') + chalk.gray('       Release thread'));
  console.log(chalk.cyan('    check <thread> <channel> <agent>') + chalk.gray('  Check if agent can claim'));
  console.log(chalk.cyan('    agent <name>') + chalk.gray('                 Set default agent'));
  console.log();
}

function listOwnership() {
  const config = getConfig();
  const to = config.threadOwnership || {};
  const entries = Object.entries(to).filter(([k]) => k !== 'agents' && k !== 'forwarderUrl');

  console.log(chalk.cyan(`\n  🧵 Thread Assignments (${entries.length})\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (entries.length === 0) {
    console.log(chalk.gray('  Atanmış thread yok.\n'));
    return;
  }

  for (const [threadId, data] of entries) {
    const agent = typeof data === 'string' ? data : data.agent || 'unknown';
    const channel = typeof data === 'string' ? '-' : data.channel || '-';
    const ts = typeof data === 'string' ? '-' : data.since ? new Date(data.since).toLocaleString() : '-';
    console.log(`  ${chalk.cyan(threadId.substring(0, 30))}`);
    console.log(`    ${chalk.gray('Agent:')}   ${chalk.white(agent)}`);
    console.log(`    ${chalk.gray('Channel:')} ${chalk.white(channel)}`);
    if (ts !== '-') console.log(`    ${chalk.gray('Since:')}   ${chalk.gray(ts)}`);
  }
  console.log();
}

function assignOwnership(threadId, agentName, channel) {
  if (!threadId || !agentName) {
    console.log(chalk.red('\n  ❌ threadId ve agentName gerekli\n'));
    console.log(chalk.cyan('    natureco thread-ownership assign C012345 "agent-bob" slack\n'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config.threadOwnership) config.threadOwnership = {};
  config.threadOwnership[threadId] = { agent: agentName, channel: channel || 'slack', since: new Date().toISOString() };
  saveConfig(config);

  console.log(chalk.green(`\n  ✅ Thread ${threadId} → ${agentName}${channel ? ` (${channel})` : ''}\n`));
}

function releaseOwnership(threadId, channel) {
  if (!threadId) {
    console.log(chalk.red('\n  ❌ threadId gerekli\n'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config.threadOwnership) config.threadOwnership = {};

  if (channel) {
    const found = Object.entries(config.threadOwnership).find(([k, v]) =>
      k === threadId && (typeof v === 'string' ? true : v.channel === channel)
    );
    if (found) delete config.threadOwnership[found[0]];
  } else {
    delete config.threadOwnership[threadId];
  }

  saveConfig(config);
  console.log(chalk.gray(`\n  🔓 Thread ${threadId} serbest bırakıldı\n`));
}

function checkOwnership(threadId, channel, agentName) {
  if (!threadId || !channel || !agentName) {
    console.log(chalk.red('\n  ❌ threadId, channel ve agentName gerekli\n'));
    console.log(chalk.cyan('    natureco thread-ownership check C012345 slack agent-bob\n'));
    process.exit(1);
  }

  const config = getConfig();
  const to = config.threadOwnership || {};
  const entry = Object.entries(to).find(([k, v]) => {
    if (k !== threadId) return false;
    if (typeof v === 'string') return true;
    return v.channel === channel || !v.channel;
  });

  if (!entry) {
    console.log(chalk.green(`\n  ✅ Thread ${threadId} sahipsiz — ${agentName} alabilir\n`));
    return;
  }

  const [, data] = entry;
  const owner = typeof data === 'string' ? data : data.agent;
  const since = typeof data === 'string' ? '-' : data.since ? new Date(data.since).toLocaleString() : '-';

  if (owner === agentName) {
    console.log(chalk.green(`\n  ✅ Thread ${threadId} zaten ${agentName}'e ait\n`));
    return;
  }

  const expired = data.since ? (Date.now() - new Date(data.since).getTime() > MENTION_TTL_MS) : false;
  if (expired) {
    console.log(chalk.yellow(`\n  ⚠️  Thread ${threadId} süresi dolmuş (${owner}), ${agentName} alabilir\n`));
    return;
  }

  console.log(chalk.red(`\n  ❌ Thread ${threadId} ${owner}'e ait (since: ${since}) — ${agentName} alamaz\n`));
}

function setDefaultAgent(name) {
  if (!name) {
    console.log(chalk.red('\n  ❌ Agent adı gerekli\n'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config.threadOwnership) config.threadOwnership = {};
  if (!config.threadOwnership.agents) config.threadOwnership.agents = {};
  config.threadOwnership.agents.default = name;
  saveConfig(config);
  console.log(chalk.green(`\n  ✅ Default agent set to: ${name}\n`));
}

module.exports = threadOwnership;
