const chalk = require('chalk');
const F = require('../utils/format');
const path = require('path');
const fs = require('fs');
const { getConfig, setConfigValue, getAllConfig, listBackups, restoreConfig, saveConfig, CONFIG_FILE, CONFIG_BACKUP_DIR } = require('../utils/config');
const TB = require('../utils/token-budget');

function config(args) {
  const [action, key, ...valueParts] = args;

  if (!action) {
    F.error('Kullanım: natureco config <get|set|unset|list|file|schema|validate|backups|restore> [key] [value]');
    process.exit(1);
  }

  const SENSITIVE_KEYS = ['apiKey', 'providerApiKey', 'providerApiKey1', 'providerApiKey2', 'secret', 'token', 'password', 'webhookSecret'];

  function maskSensitive(key, value) {
    if (typeof value !== 'string' || value.length < 8) return value;
    const lower = key.toLowerCase();
    if (!SENSITIVE_KEYS.some(sk => lower.includes(sk.toLowerCase()))) return value;
    return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 8, 16)) + value.slice(-4);
  }

  if (action === 'list') {
    const cfg = getAllConfig();
    const rows = Object.entries(cfg).map(([k, v]) => ({
      key: k,
      value: maskSensitive(k, typeof v === 'string' ? v : JSON.stringify(v)),
      sensitive: SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk.toLowerCase())),
    }));

    console.log('\n' + tui.styled('  ⚙️  Configuration (' + rows.length + ' ayar)', { color: tui.PALETTE.primary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n' + tui.table(rows, [
      { key: 'key', label: 'Anahtar', minWidth: 24, render: r => tui.styled(r.key, { color: tui.PALETTE.primary, bold: true }) },
      {
        key: 'value', label: 'Değer', minWidth: 40,
        render: r => r.sensitive
          ? tui.styled(r.value, { color: tui.PALETTE.warning })
          : tui.C.text(r.value)
      },
    ], { borderStyle: 'round', zebra: true }));
    console.log('');
    return;
  }

  if (action === 'get') {
    if (!key) {
      console.log('\n' + tui.C.red('  ❌ Key belirtilmedi.') + '\n');
      process.exit(1);
    }
    const cfg = getConfig();
    const keys = key.split('.');
    let value = cfg;
    for (const k of keys) {
      value = value?.[k];
    }
    if (value === undefined) {
      console.log('\n' + tui.styled('  ℹ ' + key + ': (tanımlı değil)', { color: tui.PALETTE.muted }) + '\n');
    } else {
      const cardW = 60;
      console.log('\n' + tui.styled('  🔍 ' + key, { color: tui.PALETTE.primary, bold: true }));
      console.log(tui.styled('  ╭' + '─'.repeat(cardW) + '╮', { color: tui.PALETTE.border }));
      const lines = maskSensitive(key, JSON.stringify(value, null, 2)).split('\n');
      for (const line of lines) {
        const padded = (line || '').padEnd(cardW - 2).slice(0, cardW - 2);
        console.log(tui.styled('  │ ', { color: tui.PALETTE.border }) + tui.styled(padded, { color: tui.PALETTE.text }) + tui.styled(' │', { color: tui.PALETTE.border }));
      }
      console.log(tui.styled('  ╰' + '─'.repeat(cardW) + '╯', { color: tui.PALETTE.border }));
      console.log('');
    }
    return;
  }

  if (action === 'set') {
    if (!key) {
      F.error('Key belirtilmedi.');
      process.exit(1);
    }
    if (valueParts.length === 0) {
      F.error('Value belirtilmedi.');
      process.exit(1);
    }
    const value = valueParts.join(' ');

    let parsedValue = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {}

    setConfigValue(key, parsedValue);
    F.success(`${key} = ${JSON.stringify(parsedValue)}`);
    return;
  }

  if (action === 'unset') {
    if (!key) {
      F.error('Key belirtilmedi.');
      process.exit(1);
    }
    const cfg = getConfig();
    const keys = key.split('.');
    let obj = cfg;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj?.[keys[i]];
    }
    if (obj && keys[keys.length - 1] in obj) {
      delete obj[keys[keys.length - 1]];
    }
    saveConfig(cfg);
    F.success(`Unset: ${key}`);
    return;
  }

  if (action === 'file') {
    const configPath = CONFIG_FILE;
    const exists = fs.existsSync(configPath);
    F.header('Config File');
    F.kv('Path', configPath);
    if (exists) {
      const stats = fs.statSync(configPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      F.kv('Size', `${sizeKB} KB`);
      F.kv('Last Modified', String(stats.mtime));
      const content = fs.readFileSync(configPath, 'utf8');
      try {
        const parsed = JSON.parse(content);
        const keys = Object.keys(parsed);
        F.kv('Keys', keys.length ? keys.join(', ') : '(empty)');
      } catch {
        F.error('(invalid JSON)');
      }
    } else {
      F.warning('(file does not exist)');
    }
    return;
  }

  if (action === 'schema') {
    F.section('Config Schema');
    const schema = {
      apiKey: { type: 'string', description: 'API key for the provider', required: true },
      providerUrl: { type: 'string', description: 'Base URL of the provider API', required: true },
      providerModel: { type: 'string', description: 'Default model identifier', required: false, default: 'gpt-4' },
      temperature: { type: 'number', description: 'Sampling temperature (0-2)', required: false, default: 0.7 },
      maxTokens: { type: 'number', description: 'Maximum tokens per response', required: false, default: 2048 },
      systemPrompt: { type: 'string', description: 'Custom system prompt', required: false },
      proxy: { type: 'object', description: 'Proxy configuration', required: false, properties: { host: { type: 'string' }, port: { type: 'number' } } },
      timeout: { type: 'number', description: 'Request timeout in milliseconds', required: false, default: 30000 },
      organization: { type: 'string', description: 'Organization ID for multi-tenant setups', required: false },
    };
    const rows = Object.entries(schema).map(([k, v]) => [
      v.required ? `${k}*` : k,
      v.type,
      v.description,
      v.default !== undefined ? JSON.stringify(v.default) : '—',
    ]);
    F.table(['Field', 'Type', 'Description', 'Default'], rows);
    F.meta('* = required');
    return;
  }

  if (action === 'validate') {
    const cfg = getConfig();
    F.section('Config Validation');
    const checks = [
      { field: 'apiKey', label: 'API Key', required: true },
      { field: 'providerUrl', label: 'Provider URL', required: true },
      { field: 'providerModel', label: 'Provider Model', required: false },
    ];
    let allPass = true;
    for (const check of checks) {
      const value = cfg[check.field];
      if (check.required && (!value || typeof value !== 'string')) {
        F.error(`${check.label}: FAIL (required)`);
        allPass = false;
      } else if (value && typeof value !== 'string') {
        F.warning(`${check.label}: WARN (expected string, got ${typeof value})`);
      } else if (value) {
        F.success(`${check.label}: PASS`);
      } else {
        F.info(`${check.label}: not set`);
      }
    }
    if (allPass) {
      F.success('All required fields are set.');
    } else {
      F.error('Some required fields are missing.');
    }
    return;
  }

  if (action === 'backups' || action === 'backup') {
    const backups = listBackups();
    F.section('Config Yedekleri');
    if (backups.length === 0) {
      F.info('Hen\u00fcz yedek al\u0131nmam\u0131\u015f.');
      return;
    }
    const rows = backups.map((f, i) => {
      const ts = f.replace(/^config-|\.json$/g, '').replace(/T/, ' ').replace(/-/g, ':').replace(/:[^:]*$/, '');
      return [String(i + 1), ts, path.join(CONFIG_BACKUP_DIR, f)];
    });
    F.table(['#', 'Tarih', 'Dosya'], rows);
    F.meta('Geri y\u00fcklemek i\u00e7in: natureco config restore <dosya-ad\u0131>');
    F.meta(`\u00d6rnek: natureco config restore ${backups[0] || 'config-....json'}`);
    return;
  }

  if (action === 'restore') {
    const backupId = key;
    if (!backupId) {
      const backups = listBackups();
      if (backups.length === 0) {
        F.error('Geri y\u00fcklenecek yedek bulunamad\u0131.');
        process.exit(1);
      }
      F.section('Geri Y\u00fckleme');
      F.kv('En son yedek', backups[0]);
      F.meta(`Kullan\u0131m: natureco config restore ${backups[0]}`);
      F.meta('Yedekleri listelemek i\u00e7in: natureco config backups');
      return;
    }

    try {
      const result = restoreConfig(backupId);
      F.success(`Config geri y\u00fcklendi: ${result.timestamp}`);
      F.meta(`Kaynak: ${result.path}`);
    } catch (err) {
      F.error(`Geri y\u00fckleme ba\u015far\u0131s\u0131z: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (action === 'budget') {
    return configBudget(key, valueParts);
  }

  F.error(`Ge\u00e7ersiz action: ${action}`);
  F.meta('Kullan\u0131m: natureco config <get|set|unset|list|file|schema|validate|backups|restore|budget> [key] [value]');
  process.exit(1);
}

function configBudget(sub, args) {
  if (!sub || sub === 'show') {
    const b = TB.load();
    F.header('Token Budget');
    F.kv('Preset', b.preset || 'balanced');
    F.kv('Max Context Tokens', String(b.maxContextTokens));
    F.kv('Preserve Recent Tokens', String(b.preserveRecentTokens));
    F.kv('Tail Turns', String(b.tailTurns));
    F.divider();
    F.section('Output Limits');
    F.kv('Tool Max Lines', String(b.toolMaxLines));
    F.kv('Tool Max Chars', String(b.toolMaxChars));
    F.kv('MCP Desc Max Chars', String(b.mcpDescMaxChars));
    F.divider();
    F.section('Content Truncation');
    F.kv('System Prompt Max', String(b.systemPromptMaxChars));
    F.kv('Memory Max Facts', String(b.memoryMaxFacts));
    F.kv('Project Memory Max', String(b.projectMemoryMaxChars));
    F.kv('File Content Max', String(b.fileContentMaxChars));
    F.divider();
    F.section('Conversation');
    F.kv('Messages on Disk', String(b.conversationOnDisk));
    F.kv('Messages in Context', String(b.conversationInContext));
    F.kv('Auto Compact', String(b.autoCompact));
    F.kv('Reserved Tokens', String(b.reservedTokens));
    F.meta('');
    F.meta('Switch preset: natureco config budget preset <efficient|balanced|quality>');
    F.meta('Set a value:   natureco config budget set <key> <value>');
    return;
  }

  if (sub === 'preset') {
    const name = args[0];
    if (!name || !['efficient', 'balanced', 'quality'].includes(name)) {
      F.error('Preset: efficient, balanced, quality');
      F.table(['Preset', 'Description', 'Context'], TB.getPresets().map(p => [p.key, p.label, String(p.maxContextTokens)]));
      return;
    }
    TB.setPreset(name);
    F.success('Token budget preset: ' + name);
    return;
  }

  if (sub === 'set') {
    const key = args[0];
    const val = args[1];
    if (!key || val === undefined) {
      F.error('Kullan\u0131m: natureco config budget set <key> <value>');
      return;
    }
    const budget = TB.load();
    if (!(key in budget)) {
      F.error('Bilinmeyen budget key: ' + key);
      return;
    }
    const num = Number(val);
    budget[key] = isNaN(num) ? val : num;
    TB.save(budget);
    F.success(key + ' = ' + budget[key]);
    return;
  }

  if (sub === 'usage') {
    const usage = TB.getAllUsage();
    if (!usage || Object.keys(usage).length === 0) {
      F.info('Hen\u00fcz token kullan\u0131m\u0131 kaydedilmedi.');
      return;
    }
    F.header('Token Usage');
    const rows = Object.entries(usage).map(([sid, u]) => [
      sid.slice(0, 20),
      String(u.total || 0),
      String(u.input || 0),
      String(u.output || 0),
      String(u.count || 0)
    ]);
    F.table(['Session', 'Total', 'Input', 'Output', 'Calls'], rows);
    return;
  }

  F.error('Budget alt komutu: ' + sub);
  F.meta('Kullan\u0131m: natureco config budget <show|preset|set|usage>');
}

module.exports = config;
