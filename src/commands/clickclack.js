const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');
const http = require('http');

function beep() {
  try {
    process.stdout.write('\x07');
  } catch {}
}

function speak(text) {
  try {
    const { execFileSync } = require('child_process');
    if (process.platform === 'darwin') execFileSync('say', [text], { stdio: 'ignore' });
    else if (process.platform === 'win32') {
      const powershell = '$text = [Console]::In.ReadToEnd(); (New-Object -ComObject SAPI.SpVoice).Speak($text)';
      execFileSync('powershell', ['-NoProfile', '-Command', powershell], { stdio: ['pipe', 'ignore', 'ignore'], input: text });
    }
  } catch {}
}

async function clickclack(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return statusClickclack();
  if (action === 'test') return testClickclack();
  if (action === 'enable') return enableClickclack();
  if (action === 'disable') return disableClickclack();
  if (action === 'listen') {
    const port = params[0] || 3888;
    return listenWebhook(parseInt(port, 10));
  }
  if (action === 'notify') return sendNotification(params.join(' '));

  console.log(chalk.red(`\n  ❌ Unknown command: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco clickclack [status|test|enable|disable|listen|notify]\n'));
  process.exit(1);
}

function statusClickclack() {
  const config = getConfig();
  const cc = config.clickclack || {};
  console.log(chalk.cyan('\n  🔔 ClickClack Status\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Enabled:')}      ${cc.enabled !== false ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  ${chalk.white('Beep on msg:')}   ${cc.beepOnMessage !== false ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  ${chalk.white('Speak on msg:')}  ${cc.speakOnMessage ? chalk.green('Yes') : chalk.gray('No')}`);
  console.log(`  ${chalk.white('Webhook port:')}  ${chalk.cyan(cc.webhookPort || 3888)}`);
  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.cyan('    natureco clickclack test') + chalk.gray('     Test beep/speak'));
  console.log(chalk.cyan('    natureco clickclack enable') + chalk.gray('   Enable notifications'));
  console.log(chalk.cyan('    natureco clickclack disable') + chalk.gray('  Disable notifications'));
  console.log(chalk.cyan('    natureco clickclack listen') + chalk.gray('  Listen for webhook'));
  console.log(chalk.cyan('    natureco clickclack notify') + chalk.gray('  Send notification'));
  console.log();
}

function testClickclack() {
  console.log(chalk.cyan('\n  Testing ClickClack...\n'));
  beep();
  console.log(chalk.gray('  Beep sent'));
  speak('ClickClack notification test');
  console.log(chalk.gray('  Speech sent'));
  console.log(chalk.green('\n  ✅ Test complete\n'));
}

function enableClickclack() {
  const config = getConfig();
  if (!config.clickclack) config.clickclack = {};
  config.clickclack.enabled = true;
  saveConfig(config);
  console.log(chalk.green('\n  ✅ ClickClack enabled\n'));
}

function disableClickclack() {
  const config = getConfig();
  if (!config.clickclack) config.clickclack = {};
  config.clickclack.enabled = false;
  saveConfig(config);
  console.log(chalk.gray('\n  🔕 ClickClack disabled\n'));
}

function sendNotification(message) {
  if (!message) {
    console.log(chalk.red('\n  ❌ Message required\n'));
    console.log(chalk.cyan('    natureco clickclack notify "Your message here"\n'));
    process.exit(1);
  }
  beep();
  if (message.length < 100) speak(message);
  console.log(chalk.green(`  🔔 ${message}\n`));
}

function listenWebhook(port) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const message = data.message || data.text || data.notification || JSON.stringify(data);
          beep();
          if (message.length < 100) speak(message);
          console.log(chalk.green(`\n  🔔 ${new Date().toISOString()} — ${message}\n`));
        } catch {
          beep();
          console.log(chalk.green(`\n  🔔 ${new Date().toISOString()} — ${body}\n`));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ClickClack webhook listener');
    }
  });

  server.listen(port, () => {
    console.log(chalk.cyan(`\n  🔔 ClickClack listening on port ${port}\n`));
    console.log(chalk.gray('  Send POST requests to:'));
    console.log(chalk.white(`    http://localhost:${port}/`));
    console.log(chalk.gray('  With JSON body:'));
    console.log(chalk.white('    { "message": "Hello from NatureCo" }'));
    console.log(chalk.gray('\n  Press Ctrl+C to stop\n'));
  });
}

module.exports = clickclack;
module.exports.speak = speak;
