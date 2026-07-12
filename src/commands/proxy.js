const chalk = require('chalk');
const http = require('http');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { URL } = require('url');

const PROXY_STATE_FILE = path.join(os.homedir(), '.natureco', 'proxy-state.json');

function getState() {
  if (!fs.existsSync(PROXY_STATE_FILE)) {
    return { coverage: {}, sessions: [], blobCache: {}, queryLogs: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(PROXY_STATE_FILE, 'utf8'));
  } catch {
    return { coverage: {}, sessions: [], blobCache: {}, queryLogs: [] };
  }
}

function saveState(state) {
  const dir = path.dirname(PROXY_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROXY_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let proxyInstance = null;
let captured = [];
let forwardUrl = null;

function proxy(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusProxy();
  if (action === 'start') return startProxy(params);
  if (action === 'stop') return stopProxy();
  if (action === 'capture') return showCapture();
  if (action === 'clear') return clearCapture();
  if (action === 'run') return cmdRun();
  if (action === 'coverage') return cmdCoverage();
  if (action === 'sessions') return cmdSessions();
  if (action === 'query') return cmdQuery(params[0]);
  if (action === 'blob') return cmdBlob(params[0]);
  if (action === 'purge') return cmdPurge();

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco proxy [status|start|stop|capture|clear|run|coverage|sessions|query|blob|purge]\n', '  Usage: natureco proxy [status|start|stop|capture|clear|run|coverage|sessions|query|blob|purge]\n')));
  process.exit(1);
}

function statusProxy() {
  console.log(chalk.cyan('\n  🔍 Debug Proxy\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Status:')}  ${proxyInstance ? chalk.green('Running') : chalk.red('Stopped')}`);
  if (proxyInstance) {
    console.log(`  ${chalk.white('Port:')}    ${proxyInstance.port}`);
    console.log(`  ${chalk.white('Forward:')} ${forwardUrl ? chalk.cyan(forwardUrl) : chalk.gray('(none)')}`);
    console.log(`  ${chalk.white('Captured:')} ${captured.length} request(s)`);
  }
  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.gray('    status                          Show proxy status'));
  console.log(chalk.gray('    start [port] [--forward <url>]  Start proxy server'));
  console.log(chalk.gray('    stop                            Stop proxy server'));
  console.log(chalk.gray('    capture                         Show captured requests'));
  console.log(chalk.gray('    clear                           Clear captured requests'));
  console.log(chalk.gray('    run                             Run proxy (stub)'));
  console.log(chalk.gray('    coverage                        Show proxy coverage stats'));
  console.log(chalk.gray('    sessions                        List proxy sessions'));
  console.log(chalk.gray('    query <pattern>                 Query proxy logs'));
  console.log(chalk.gray('    blob <hash>                     Get blob by hash'));
  console.log(chalk.gray('    purge                           Purge proxy cache'));
  console.log();
}

function startProxy(params) {
  if (proxyInstance) {
    console.log(chalk.yellow('\n  ⚠️  Proxy already running\n'));
    return;
  }

  const port = parseInt(params[0], 10) || 8080;
  const fwdIdx = params.indexOf('--forward');
  if (fwdIdx !== -1 && params[fwdIdx + 1]) {
    forwardUrl = params[fwdIdx + 1];
  }

  captured = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const entry = {
        id: captured.length + 1,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body ? body.substring(0, 2000) : null
      };
      captured.push(entry);
      if (captured.length > 200) captured.shift();

      console.log(chalk.gray(`  [${entry.id}] ${chalk.cyan(req.method)} ${req.url}`));

      if (forwardUrl) {
        try {
          const target = new URL(req.url, forwardUrl);
          const proxyReq = http.request({
            hostname: target.hostname,
            port: target.port || 80,
            path: target.pathname + target.search,
            method: req.method,
            headers: { ...req.headers, host: target.host }
          }, proxyRes => {
            let proxyBody = '';
            proxyRes.on('data', c => proxyBody += c);
            proxyRes.on('end', () => {
              res.writeHead(proxyRes.statusCode, proxyRes.headers);
              res.end(proxyBody);
            });
          });
          proxyReq.on('error', () => {
            res.writeHead(502);
            res.end('Bad Gateway');
          });
          if (body) proxyReq.write(body);
          proxyReq.end();
        } catch {
          res.writeHead(502);
          res.end('Bad Gateway');
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: entry.id, captured: captured.length }));
      }
    });
  });

  proxyInstance = server;
  proxyInstance.port = port;
  server.listen(port, () => {
    console.log(chalk.green(`\n  🔍 Debug proxy on http://localhost:${port}\n`));
    if (forwardUrl) console.log(chalk.gray(`  Forwarding to: ${forwardUrl}\n`));
    console.log(chalk.gray('  Captured requests shown below. Press Ctrl+C to stop.\n'));
  });
}

function stopProxy() {
  if (!proxyInstance) {
    console.log(chalk.yellow('\n  ⚠️  Proxy not running\n'));
    return;
  }
  proxyInstance.close(() => {
    console.log(chalk.gray('\n  🛑 Proxy stopped\n'));
    proxyInstance = null;
    forwardUrl = null;
  });
}

function showCapture() {
  if (captured.length === 0) {
    console.log(chalk.gray('\n  No captured requests.\n'));
    return;
  }

  console.log(chalk.cyan(`\n  📋 Captured Requests (${captured.length})\n`));
  console.log(chalk.gray('  ' + '─'.repeat(64)));

  for (const entry of captured.slice(-20)) {
    const time = entry.timestamp.slice(11, 19);
    console.log(`  ${chalk.gray(`[${entry.id}]`)} ${chalk.cyan(entry.method)} ${chalk.white(entry.url)}  ${chalk.gray(time)}`);
    if (entry.body) {
      const preview = entry.body.length > 200 ? entry.body.substring(0, 200) + '…' : entry.body;
      console.log(`    ${chalk.gray(preview)}`);
    }
  }
  console.log();
}

function clearCapture() {
  captured = [];
  console.log(chalk.gray('\n  🗑️  Captured requests cleared\n'));
}

function cmdRun() {
  console.log(chalk.green('\n  ▶️  Proxy run would start proxy server\n'));
  console.log(chalk.gray('  (Stub — implement actual proxy server startup here)\n'));
}

function cmdCoverage() {
  const state = getState();

  console.log(chalk.cyan('\n  📊 Proxy Coverage Stats\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const coverage = state.coverage || {};
  const keys = Object.keys(coverage);

  if (keys.length === 0) {
    console.log(chalk.gray('  No coverage data recorded yet.\n'));
    return;
  }

  for (const key of keys) {
    const c = coverage[key];
    console.log(chalk.white(`  ${key}`));
    console.log(chalk.gray(`    Count: ${c.count || 0}`));
    if (c.lastSeen) console.log(chalk.gray(`    Last seen: ${c.lastSeen}`));
    if (c.avgResponseTime) console.log(chalk.gray(`    Avg response time: ${c.avgResponseTime}ms`));
    console.log();
  }
}

function cmdSessions() {
  const state = getState();

  console.log(chalk.cyan('\n  🔌 Proxy Sessions\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const sessions = state.sessions || [];

  if (sessions.length === 0) {
    console.log(chalk.gray('  No sessions recorded.\n'));
    return;
  }

  for (const s of sessions) {
    console.log(chalk.white(`  [${s.id}]`), chalk.gray(`${s.host || 'unknown'} — ${s.started || '?'}`));
  }
  console.log();
}

function cmdQuery(pattern) {
  const state = getState();

  if (!pattern) {
    console.log(chalk.red('\n  ❌ Query pattern is required.\n'));
    console.log(chalk.gray('  Usage: natureco proxy query <pattern>\n'));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n  🔎 Proxy Logs matching: ${pattern}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const logs = state.queryLogs || [];
  const matching = logs.filter(l =>
    (l.url && l.url.includes(pattern)) ||
    (l.method && l.method.includes(pattern)) ||
    (l.body && l.body.includes(pattern))
  );

  if (matching.length === 0) {
    console.log(chalk.gray('  No matching logs found.\n'));
    return;
  }

  for (const log of matching.slice(-20)) {
    console.log(`  ${chalk.gray(`[${log.id}]`)} ${chalk.cyan(log.method)} ${chalk.white(log.url)}`);
  }
  console.log(chalk.gray(`  Showing ${Math.min(matching.length, 20)} of ${matching.length} result(s)\n`));
}

function cmdBlob(hash) {
  const state = getState();

  if (!hash) {
    console.log(chalk.red('\n  ❌ Blob hash is required.\n'));
    console.log(chalk.gray('  Usage: natureco proxy blob <hash>\n'));
    process.exit(1);
  }

  const blobCache = state.blobCache || {};
  const blob = blobCache[hash];

  if (!blob) {
    console.log(chalk.yellow(`\n  ⚠️  Blob not found: ${hash}\n`));
    return;
  }

  console.log(chalk.cyan('\n  💾 Blob\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.white(`  Hash: ${hash}`));
  console.log(chalk.white(`  Size: ${blob.size || 'unknown'} bytes`));
  console.log(chalk.white(`  Type: ${blob.type || 'unknown'}`));
  console.log(chalk.white(`  Cached: ${blob.cached || 'unknown'}`));
  console.log(chalk.gray('  (Stub — actual blob retrieval requires blob storage backend)\n'));
}

function cmdPurge() {
  const state = getState();

  state.coverage = {};
  state.sessions = [];
  state.blobCache = {};
  state.queryLogs = [];
  saveState(state);

  console.log(chalk.green('\n  🧹 Proxy cache purged\n'));
}

module.exports = proxy;
