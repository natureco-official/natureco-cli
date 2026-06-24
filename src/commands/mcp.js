const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MCP_CONFIG = path.join(os.homedir(), '.natureco', 'mcp-servers.json');

function loadServers() {
  if (!fs.existsSync(MCP_CONFIG)) return {};
  try { return JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf8')); }
  catch { return {}; }
}

function saveServers(servers) {
  const dir = path.dirname(MCP_CONFIG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MCP_CONFIG, JSON.stringify(servers, null, 2), 'utf8');
}

function mcp(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return cmdList();
  if (action === 'serve') return cmdServe();
  if (action === 'show') return cmdShow(params[0]);
  if (action === 'set') return cmdSet(params[0], params.slice(1));
  if (action === 'unset') return cmdUnset(params[0]);

  console.log(chalk.red(`\n  Unknown mcp action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco mcp <action> [params]'));
  console.log(chalk.gray('  Actions: serve, list, show <name>, set, unset <name>\n'));
  process.exit(1);
}

function cmdServe() {
  console.log(chalk.cyan('\n  MCP Server\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Endpoint:')}  ${chalk.green('http://127.0.0.1:3848/mcp')}`);
  console.log(`  ${chalk.white('Status:')}    ${chalk.gray('Would start MCP server here')}`);
  console.log('');
}

function cmdList() {
  const servers = loadServers();
  const names = Object.keys(servers);

  console.log(chalk.cyan('\n  MCP Servers\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (names.length === 0) {
    console.log(chalk.gray('  No MCP servers configured.\n'));
    console.log(chalk.gray('  Add one: ') + chalk.cyan('natureco mcp set <name> <command> [args...]\n'));
    return;
  }

  for (const name of names) {
    const s = servers[name];
    const status = s.disabled ? chalk.red('disabled') : chalk.green('enabled');
    console.log(`  ${chalk.white(name)} ${chalk.gray(`— ${status}`)}`);
    console.log(chalk.gray(`    Command: ${s.command} ${(s.args || []).join(' ')}`));
  }
  console.log('');
}

function cmdShow(name) {
  if (!name) {
    console.log(chalk.red('\n  Usage: natureco mcp show <name>\n'));
    process.exit(1);
  }

  const servers = loadServers();
  const s = servers[name];
  if (!s) {
    console.log(chalk.yellow(`\n  MCP server "${name}" not found.\n`));
    return;
  }

  console.log(chalk.cyan(`\n  MCP Server: ${name}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Command:')}  ${chalk.white(s.command)} ${chalk.gray((s.args || []).join(' '))}`);
  console.log(`  ${chalk.white('Status:')}   ${s.disabled ? chalk.red('disabled') : chalk.green('enabled')}`);
  if (s.env && Object.keys(s.env).length > 0) {
    console.log(`  ${chalk.white('Env:')}      ${chalk.gray(Object.keys(s.env).join(', '))}`);
  }
  console.log('');
}

function cmdSet(name, rest) {
  if (!name || rest.length === 0) {
    console.log(chalk.red('\n  Usage: natureco mcp set <name> <command> [args...]\n'));
    process.exit(1);
  }

  const servers = loadServers();
  servers[name] = {
    command: rest[0],
    args: rest.slice(1),
    disabled: false,
  };
  saveServers(servers);
  console.log(chalk.green(`\n  MCP server "${name}" configured.\n`));
}

function cmdUnset(name) {
  if (!name) {
    console.log(chalk.red('\n  Usage: natureco mcp unset <name>\n'));
    process.exit(1);
  }

  const servers = loadServers();
  if (!servers[name]) {
    console.log(chalk.yellow(`\n  MCP server "${name}" not found.\n`));
    return;
  }

  delete servers[name];
  saveServers(servers);
  console.log(chalk.gray(`\n  MCP server "${name}" removed.\n`));
}

module.exports = mcp;
