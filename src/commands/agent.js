const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const path = require('path');
const os = require('os');

const BINDINGS_FILE = path.join(os.homedir(), '.natureco', 'agent-bindings.json');
const IDENTITIES_FILE = path.join(os.homedir(), '.natureco', 'agent-identities.json');

async function agent(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' || args[i] === '-t') opts.to = args[++i];
    else if (args[i] === '--message' || args[i] === '-m') opts.message = args[++i];
    else if (args[i] === '--channel' || args[i] === '-c') opts.channel = args[++i];
    else if (args[i] === '--deliver') opts.deliver = true;
    else if (args[i] === '--model') opts.model = args[++i];
    else if (args[i] === '--provider') opts.provider = args[++i];
    else if (!opts.action) opts.action = args[i];
    else (opts._positional = opts._positional || []).push(args[i]);
  }

  if (!opts.action || opts.action === 'help') return showHelp();
  if (opts.action === 'run') return runAgent(opts);
  if (opts.action === 'abort') return abortAgent(opts.message);
  if (opts.action === 'tail') return tailAgent(opts.message);
  if (opts.action === 'logs') return logsAgent(opts.message);
  if (opts.action === 'bindings') return listBindings();
  if (opts.action === 'bind') return bindAgent(opts);
  if (opts.action === 'unbind') return unbindAgent(opts);
  if (opts.action === 'set-identity') return setIdentity(opts);

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${opts.action}\n`));
  process.exit(1);
}

async function runAgent(opts) {
  const { getConfig } = require('../utils/config');
  const { createTask } = require('../utils/background');
  const { getProviderConfig } = require('../utils/api');
  const config = getConfig();
  const pc = getProviderConfig();

  const provider = opts.provider || (pc?.url?.includes('groq') ? 'groq' : config.provider || 'openai');
  const model = opts.model || config.providerModel || config.model || 'llama-3.3-70b-versatile';
  const message = opts.message || 'Hello';
  const apiKey = pc?.apiKey || config[`${provider}ApiKey`] || process.env[`${provider.toUpperCase()}_API_KEY`];

  if (!apiKey) {
    console.log(chalk.red(`\n  ❌ ${provider} API key ${L('gerekli', 'required')}\n`));
    process.exit(1);
  }

  const task = createTask({
    runtime: 'cli',
    message: message.substring(0, 80),
    botName: opts.to || 'default',
  });

  console.log(chalk.cyan(`\n  🤖 Agent Turn [${task.id}]\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Message:')}  ${message}`);
  if (opts.to) console.log(`  ${chalk.white('To:')}       ${opts.to}`);
  if (opts.channel) console.log(`  ${chalk.white('Channel:')}  ${opts.channel}`);
  console.log(`  ${chalk.white('Provider:')} ${provider}`);
  console.log(`  ${chalk.white('Model:')}    ${model}`);
  console.log(chalk.gray('\n  Running...\n'));

  try {
    const { updateTask } = require('../utils/background');
    updateTask(task.id, { status: 'running' });

    const apiUrl = pc?.url || `https://api.${provider}.com/v1`;
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], max_tokens: 2048 })
    });

    if (!response.ok) {
      updateTask(task.id, { status: 'failed', error: `API error ${response.status}` });
      throw new Error(`API error ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response';

    updateTask(task.id, { status: 'succeeded', result: reply.substring(0, 500) });

    console.log(chalk.white('  Response:'));
    console.log(chalk.gray(`  ${reply.substring(0, 500)}`));

    if (opts.deliver && opts.channel) {
      console.log(chalk.gray(`\n  📨 Delivering via ${opts.channel}...`));
    }

    console.log();
  } catch (err) {
    console.log(chalk.red(`  ❌ ${err.message}\n`));
    process.exit(1);
  }
}

function abortAgent(taskId) {
  const { cancelTask, listTasks } = require('../utils/background');
  if (taskId) {
    const t = cancelTask(taskId);
    if (!t) { console.log(chalk.red(`\n  ❌ ${L('Task bulunamadı', 'Task not found')}: ${taskId}\n`)); process.exit(1); }
    console.log(chalk.yellow(`\n  🛑 ${L('Task iptal edildi', 'Task cancelled')}: ${taskId}\n`));
    return;
  }
  const running = listTasks({ status: 'running' });
  if (running.length === 0) {
    console.log(chalk.gray(L('\n  Çalışan task yok\n', '\n  No running tasks\n')));
    return;
  }
  for (const t of running) {
    cancelTask(t.id);
    console.log(chalk.yellow(`  🛑 ${L('Task iptal edildi', 'Task cancelled')}: ${t.id} — ${t.message}`));
  }
  console.log();
}

function tailAgent(taskId) {
  const { getTask } = require('../utils/background');
  if (!taskId) {
    console.log(chalk.red(L('\n  ❌ Task ID gerekli. Kullanım: natureco agent tail <id>\n', '\n  ❌ Task ID required. Usage: natureco agent tail <id>\n')));
    process.exit(1);
  }
  const task = getTask(taskId);
  if (!task) { console.log(chalk.red(`\n  ❌ ${L('Task bulunamadı', 'Task not found')}: ${taskId}\n`)); process.exit(1); }
  console.log(chalk.cyan(`\n  📋 Task: ${task.id}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Message:')}  ${task.message}`);
  console.log(`  ${chalk.white('Status:')}   ${statusColor(task.status)}`);
  if (task.result) console.log(`  ${chalk.white('Result:')}   ${chalk.gray(task.result.substring(0, 300))}`);
  if (task.error) console.log(`  ${chalk.white('Error:')}    ${chalk.red(task.error)}`);
  if (task.createdAt) console.log(`  ${chalk.white('Created:')} ${chalk.gray(task.createdAt)}`);
  if (task.endedAt) console.log(`  ${chalk.white('Ended:')}   ${chalk.gray(task.endedAt)}`);
  console.log();
}

function logsAgent(statusFilter) {
  const { listTasks } = require('../utils/background');
  const tasks = listTasks(statusFilter ? { status: statusFilter } : {});
  console.log(chalk.cyan(`\n  📜 Agent Logs${statusFilter ? ` (${statusFilter})` : ''}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  if (tasks.length === 0) {
    console.log(chalk.gray(L('  Task bulunamadı.\n', '  Task not found.\n')));
    return;
  }
  for (const t of tasks.slice(0, 20)) {
    console.log(`  ${statusColor(t.status)} ${chalk.white(t.message || L('(boş)', '(empty)'))}`);
    console.log(chalk.gray(`     [${t.id}] ${t.createdAt?.slice(0, 16) || ''} — ${t.runtime}`));
  }
  console.log();
}

// ── bindings ──────────────────────────────────────────────────────────
function listBindings() {
  const bindings = loadBindings();
  const ids = loadIdentities();
  console.log(chalk.cyan('\n  Agent Bindings\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  const entries = Object.entries(bindings);
  if (entries.length === 0) {
    console.log(chalk.gray('  No agents bound to any channels.\n'));
    return;
  }
  for (const [agentId, channels] of entries) {
    const identity = ids[agentId];
    console.log(`  ${chalk.white(agentId)}${identity ? chalk.gray(' (' + identity + ')') : ''}`);
    for (const ch of channels) {
      console.log(chalk.gray('    └─ ') + chalk.cyan(ch));
    }
  }
  console.log('');
}

function loadBindings() {
  if (!fs.existsSync(BINDINGS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(BINDINGS_FILE, 'utf8')); } catch { return {}; }
}

function saveBindings(data) {
  const dir = path.dirname(BINDINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BINDINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function bindAgent(opts) {
  const pos = opts._positional || [];
  const agentId = pos[0];
  const channel = pos[1] || opts.channel;
  if (!agentId || !channel) {
    console.log(chalk.red('\nUsage: natureco agents bind <agentId> <channel>\n'));
    process.exit(1);
  }
  const bindings = loadBindings();
  if (!bindings[agentId]) bindings[agentId] = [];
  if (!bindings[agentId].includes(channel)) bindings[agentId].push(channel);
  saveBindings(bindings);
  console.log(chalk.green('\nAgent "' + agentId + '" bound to ' + channel + '\n'));
}

function unbindAgent(opts) {
  const pos = opts._positional || [];
  const agentId = pos[0];
  const channel = pos[1] || opts.channel;
  if (!agentId || !channel) {
    console.log(chalk.red('\nUsage: natureco agents unbind <agentId> <channel>\n'));
    process.exit(1);
  }
  const bindings = loadBindings();
  if (bindings[agentId]) {
    bindings[agentId] = bindings[agentId].filter(c => c !== channel);
    if (bindings[agentId].length === 0) delete bindings[agentId];
  }
  saveBindings(bindings);
  console.log(chalk.green('\nAgent "' + agentId + '" unbound from ' + channel + '\n'));
}

// ── identities ────────────────────────────────────────────────────────
function loadIdentities() {
  if (!fs.existsSync(IDENTITIES_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(IDENTITIES_FILE, 'utf8')); } catch { return {}; }
}

function saveIdentities(data) {
  const dir = path.dirname(IDENTITIES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(IDENTITIES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function setIdentity(opts) {
  const pos = opts._positional || [];
  const agentId = pos[0];
  const identity = pos.slice(1).join(' ') || opts.message;
  if (!agentId || !identity) {
    console.log(chalk.red('\nUsage: natureco agents set-identity <agentId> <identity>\n'));
    process.exit(1);
  }
  const ids = loadIdentities();
  ids[agentId] = identity;
  saveIdentities(ids);
  console.log(chalk.green('\nIdentity set for agent "' + agentId + '": ' + identity + '\n'));
}

function statusColor(s) {
  const m = { succeeded: chalk.green('✓'), failed: chalk.red('✗'), running: chalk.yellow('●'), queued: chalk.cyan('○'), cancelled: chalk.gray('−'), timed_out: chalk.red('⚠'), lost: chalk.magenta('?') };
  return m[s] || chalk.gray('○');
}

function showHelp() {
  console.log(chalk.cyan('\n  🤖 Agent\n'));
  console.log(chalk.gray('  Run, manage, and monitor agent tasks.\n'));
  console.log(chalk.gray('  Usage: natureco agent <action> [options]'));
  console.log(chalk.gray('\n  Actions:'));
  console.log(chalk.cyan('    run') + chalk.gray('                     Run an agent turn'));
  console.log(chalk.cyan('    abort [id]') + chalk.gray('             Cancel a running task'));
  console.log(chalk.cyan('    tail <id>') + chalk.gray('              Show task details'));
  console.log(chalk.cyan('    logs [status]') + chalk.gray('          List recent tasks'));
  console.log(chalk.cyan('    bindings') + chalk.gray('               List agent bindings'));
  console.log(chalk.cyan('    bind <id> <ch>') + chalk.gray('        Bind agent to channel'));
  console.log(chalk.cyan('    unbind <id> <ch>') + chalk.gray('      Unbind agent from channel'));
  console.log(chalk.cyan('    set-identity <id> <persona>') + chalk.gray('   Set agent identity'));
  console.log(chalk.gray('\n  Options for run:'));
  console.log(chalk.cyan('    --message, -m <text>') + chalk.gray('   Message to send'));
  console.log(chalk.cyan('    --to, -t <target>') + chalk.gray('      Target channel/contact'));
  console.log(chalk.cyan('    --channel, -c <name>') + chalk.gray('   Channel to use'));
  console.log(chalk.cyan('    --deliver') + chalk.gray('              Deliver reply via channel'));
  console.log(chalk.cyan('    --model <model>') + chalk.gray('        Model override'));
  console.log(chalk.cyan('    --provider <name>') + chalk.gray('     Provider override'));
  console.log(chalk.gray('\n  Examples:'));
  console.log(chalk.gray(L('    natureco agent run --message "Merhaba"', '    natureco agent run --message "Hello"')));
  console.log(chalk.gray('    natureco agent abort'));
  console.log(chalk.gray('    natureco agent tail <id>'));
  console.log(chalk.gray('    natureco agent logs running\n'));
}

module.exports = agent;
