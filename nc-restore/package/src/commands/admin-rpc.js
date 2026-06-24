const chalk = require('chalk');
const http = require('http');
const { getConfig } = require('../utils/config');

const ALLOWED_METHODS = [
  'health', 'status',
  'config.get', 'config.set',
  'channels.status', 'channels.start', 'channels.stop',
  'agents.list',
  'logs.tail',
  'cron.list', 'cron.status',
  'tasks.list',
  'plugins.list'
];

let serverInstance = null;

function adminRpc(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusAdmin();
  if (action === 'start') return startAdmin(params[0]);
  if (action === 'stop') return stopAdmin();
  if (action === 'call') return callMethod(params[0], params.slice(1).join(' '));
  if (action === 'methods') return listMethods();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco admin-rpc [status|start|stop|call|methods]\n'));
  process.exit(1);
}

function statusAdmin() {
  const running = serverInstance !== null;
  console.log(chalk.cyan('\n  🖥️  Admin HTTP RPC\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Server:')}       ${running ? chalk.green(`http://localhost:${serverInstance?.port || 3847}`) : chalk.red('Durduruldu')}`);
  console.log(`  ${chalk.white('Methods:')}       ${ALLOWED_METHODS.length}`);
  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.cyan('    start [port]') + chalk.gray('  Start RPC server (default: 3847)'));
  console.log(chalk.cyan('    stop') + chalk.gray('           Stop RPC server'));
  console.log(chalk.cyan('    call <method>') + chalk.gray('  Call RPC method'));
  console.log(chalk.cyan('    methods') + chalk.gray('       List methods'));
  console.log();
}

function listMethods() {
  console.log(chalk.cyan('\n  📋 Admin RPC Methods\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  for (const m of ALLOWED_METHODS) {
    console.log(`  ${chalk.white(m)}`);
  }
  console.log();
}

async function callMethod(method, jsonParams) {
  if (!method) {
    console.log(chalk.red('\n  ❌ Method adı gerekli\n'));
    console.log(chalk.cyan('    natureco admin-rpc call health\n'));
    process.exit(1);
  }

  if (!ALLOWED_METHODS.includes(method)) {
    console.log(chalk.red(`\n  ❌ Desteklenmeyen method: ${method}\n`));
    process.exit(1);
  }

  let params = {};
  if (jsonParams) {
    try { params = JSON.parse(jsonParams); }
    catch { console.log(chalk.red('\n  ❌ Geçersiz JSON\n')); process.exit(1); }
  }

  console.log(chalk.cyan(`\n  📡 Calling: ${method}\n`));

  if (method === 'health') {
    console.log(chalk.green('  ✅ System healthy'));
    console.log(chalk.gray(`  Node: ${process.version}`));
    console.log(chalk.gray(`  Platform: ${process.platform}`));
    console.log(chalk.gray(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`));
    return;
  }

  if (method === 'status') {
    const config = getConfig();
    console.log(chalk.green('  ✅ Status\n'));
    console.log(chalk.gray(`  Gateway: ${config.gatewayUrl || 'not configured'}`));
    console.log(chalk.gray(`  Provider: ${config.provider || 'not set'}`));
    console.log(chalk.gray(`  Model: ${config.model || 'not set'}\n`));
    return;
  }

  if (method === 'plugins.list') {
    const { loadTools } = require('../utils/tool-runner');
    const tools = loadTools();
    console.log(chalk.green(`  📦 ${Object.keys(tools).length} tools loaded\n`));
    for (const [name, t] of Object.entries(tools)) {
      console.log(`  ${chalk.white('●')} ${name} ${chalk.gray('- ' + (t.description || '').substring(0, 60))}`);
    }
    console.log();
    return;
  }

  if (method === 'config.get') {
    const config = getConfig();
    const key = params.key;
    if (key) {
      const value = key.split('.').reduce((o, k) => o?.[k], config);
      console.log(chalk.white(`  ${key}: `) + chalk.cyan(JSON.stringify(value)));
    } else {
      console.log(chalk.cyan(JSON.stringify(config, null, 2)));
    }
    console.log();
    return;
  }

  if (method === 'logs.tail') {
    const lines = params.lines || 20;
    const { execSync } = require('child_process');
    try {
      const logPath = require('path').join(require('os').homedir(), '.natureco', 'logs', 'gateway.log');
      const output = execSync(`tail -${lines} "${logPath}"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      console.log(output);
    } catch {
      console.log(chalk.yellow('  ⚠️  Log bulunamadı\n'));
    }
    return;
  }

  if (method === 'config.set') {
    const { setConfigValue } = require('../utils/config');
    if (!params.key) { console.log(chalk.red('\n  ❌ params.key gerekli\n')); process.exit(1); }
    setConfigValue(params.key, params.value);
    console.log(chalk.green(`\n  ✅ config.${params.key} = ${JSON.stringify(params.value)}\n`));
    return;
  }

  if (method === 'channels.status' || method === 'channels.start' || method === 'channels.stop') {
    const { getAllConfig } = require('../utils/config');
    const cfg = getAllConfig();
    const channels = ['telegram', 'discord', 'slack', 'whatsapp'];
    console.log(chalk.cyan(`\n  📡 Channel: ${method}\n`));
    if (method === 'channels.status') {
      for (const ch of channels) {
        const token = cfg[`${ch}Token`];
        console.log(`  ${token ? chalk.green('●') : chalk.gray('○')} ${ch} ${token ? chalk.gray('(configured)') : chalk.gray('(not set)')}`);
      }
    } else {
      const ch = params.name || 'all';
      console.log(chalk.gray(`  ${method.split('.')[1]} ${ch} (simulated)\n`));
    }
    console.log();
    return;
  }

  if (method === 'agents.list') {
    const { listTasks, getTaskSummary } = require('../utils/background');
    const tasks = listTasks({ limit: 20 });
    const summary = getTaskSummary();
    console.log(chalk.cyan(`\n  👤 Agents (${summary.active} active, ${summary.total} total)\n`));
    console.log(chalk.gray('  ' + '─'.repeat(48)));
    for (const t of tasks.slice(0, 10)) {
      const icon = t.status === 'succeeded' ? chalk.green('✓') : t.status === 'running' ? chalk.yellow('●') : chalk.gray('○');
      console.log(`  ${icon} ${chalk.white(t.message || '(no message)')}`);
      console.log(chalk.gray(`     [${t.id}] ${t.runtime} — ${t.status}`));
    }
    console.log();
    return;
  }

  if (method === 'cron.list' || method === 'cron.status') {
    const { getConfig } = require('../utils/config');
    const config = getConfig();
    const jobs = config.cronJobs || [];
    console.log(chalk.cyan(`\n  ⏰ ${method} (${jobs.length} jobs)\n`));
    if (jobs.length === 0) {
      console.log(chalk.gray('  Cron job yapılandırılmamış.\n'));
      return;
    }
    for (const j of jobs) {
      console.log(`  ${chalk.white(j.name || '(unnamed)')} — ${chalk.gray(j.schedule || j.interval)}`);
    }
    console.log();
    return;
  }

  if (method === 'tasks.list') {
    const { listTasks, getTaskSummary } = require('../utils/background');
    const tasks = listTasks({ limit: 20 });
    const summary = getTaskSummary();
    console.log(chalk.cyan(`\n  📋 Tasks (${summary.active} active, ${summary.total} total)\n`));
    for (const t of tasks.slice(0, 15)) {
      console.log(`  ${chalk.white(t.id)} — ${chalk.cyan(t.status)} — ${chalk.gray(t.message?.substring(0, 50) || '')}`);
    }
    console.log();
    return;
  }

  console.log(chalk.yellow(`  ⚠️  Method "${method}" henüz implemente edilmedi\n`));
}

function startAdmin(portStr) {
  if (serverInstance) {
    console.log(chalk.yellow('\n  ⚠️  Server zaten çalışıyor\n'));
    return;
  }

  const port = parseInt(portStr, 10) || 3847;

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Allow': 'POST', 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const rpc = JSON.parse(body);
        if (!rpc.method || typeof rpc.method !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'method required' }));
          return;
        }

        if (!ALLOWED_METHODS.includes(rpc.method)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `Method not allowed: ${rpc.method}` }));
          return;
        }

        const config = getConfig();
        let payload;

        if (rpc.method === 'health') {
          payload = { status: 'ok', node: process.version, uptime: process.uptime() };
        } else if (rpc.method === 'status') {
          payload = { gateway: config.gatewayUrl, provider: config.provider, model: config.model };
        } else if (rpc.method === 'config.get') {
          const key = rpc.params?.key;
          payload = key ? { [key]: key.split('.').reduce((o, k) => o?.[k], config) } : config;
        } else if (rpc.method === 'plugins.list') {
          const { loadTools } = require('../utils/tool-runner');
          payload = { tools: Object.keys(loadTools()) };
        } else if (rpc.method === 'config.set') {
          const { setConfigValue } = require('../utils/config');
          setConfigValue(rpc.params.key, rpc.params.value);
          payload = { ok: true, key: rpc.params.key, value: rpc.params.value };
        } else if (rpc.method === 'channels.status' || rpc.method === 'channels.start' || rpc.method === 'channels.stop') {
          const channels = ['telegram', 'discord', 'slack', 'whatsapp'];
          const status = {};
          for (const ch of channels) status[ch] = !!config[`${ch}Token`];
          payload = { action: rpc.method, channels: status };
        } else if (rpc.method === 'agents.list' || rpc.method === 'tasks.list') {
          const { listTasks, getTaskSummary } = require('../utils/background');
          payload = { summary: getTaskSummary(), tasks: listTasks({ limit: 20 }) };
        } else if (rpc.method === 'cron.list' || rpc.method === 'cron.status') {
          payload = { jobs: config.cronJobs || [] };
        } else {
          payload = { message: `Method "${rpc.method}" called`, params: rpc.params };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: rpc.id || 'rpc-1', payload }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
  });

  serverInstance = server;
  serverInstance.port = port;

  server.listen(port, () => {
    console.log(chalk.green(`\n  ✅ Admin RPC server started on http://localhost:${port}\n`));
    console.log(chalk.gray('  POST requests with JSON body:'));
    console.log(chalk.white('    { "method": "health", "id": "req-1" }'));
    console.log(chalk.white('    { "method": "config.get", "params": { "key": "provider" } }'));
    console.log(chalk.gray('\n  Press Ctrl+C to stop\n'));
  });

  server.on('error', (err) => {
    console.log(chalk.red(`\n  ❌ Server error: ${err.message}\n`));
    serverInstance = null;
  });
}

function stopAdmin() {
  if (!serverInstance) {
    console.log(chalk.yellow('\n  ⚠️  Server çalışmıyor\n'));
    return;
  }

  serverInstance.close(() => {
    console.log(chalk.gray('\n  🛑 Admin RPC server durduruldu\n'));
    serverInstance = null;
  });
}

module.exports = adminRpc;
