const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
const F = require('../utils/format');
const { getConfig, saveConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { foldTr } = require('../utils/tr-text');

async function channels(args) {
  const [action, ...params] = (args || []);

  if (!action || action === 'list') return listChannels();
  if (action === 'status') return statusChannels();
  if (action === 'remove') return removeChannel(params[0]);
  if (action === 'logs') return channelLogs(params[0]);
  if (action === 'add') return addChannel();
  if (action === 'login') return loginChannel(params[0]);
  if (action === 'logout') return logoutChannel(params[0]);
  if (action === 'capabilities') return capabilitiesChannels(params[0]);
  if (action === 'resolve') return resolveIdentifier(params[0], params[1]);

  F.error(`Unknown command: ${action}`);
  F.info('Usage: natureco channels [list|status|add|remove|login|logout|capabilities|resolve|logs]');
  process.exit(1);
}

function addChannel() {
  F.section('Add Channel');
  F.list([
    'telegram - Connect Telegram bot',
    'whatsapp - Connect WhatsApp bot',
    'discord  - Connect Discord bot',
    'slack    - Connect Slack bot',
    'signal   - Connect Signal bot',
    'irc      - Connect IRC bot',
    'mattermost - Connect Mattermost bot',
    'imessage - Connect iMessage bridge',
    'sms      - Connect SMS/Twilio',
    'webhooks - Connect webhooks',
    'matrix     - Connect Matrix (Element / Synapse)',
    'teams      - Connect Microsoft Teams',
    'googlechat - Connect Google Chat',
    'zalo       - Connect Zalo Official Account',
  ]);
  F.info('Use: natureco <channel> connect');
}

function loginChannel(channel) {
  if (!channel) {
    F.error('Channel name required');
    F.info('Usage: natureco channels login <telegram|whatsapp|discord|slack|signal|irc|mattermost|imessage|sms|webhooks|matrix|teams|googlechat|zalo>');
    process.exit(1);
  }

  const config = getConfig();
  const ch = channel.toLowerCase();
  const channelKeys = {
    telegram: 'telegramToken',
    whatsapp: 'whatsappConnected',
    discord: 'discordToken',
    slack: 'slackToken',
    signal: 'signalBotId',
    irc: 'ircBotId',
    mattermost: 'mattermostBotId',
    imessage: 'imessageBotId',
    sms: 'smsBotId',
    webhooks: 'webhooks',
    matrix: 'matrixBotId',
    teams: 'teamsBotId',
    googlechat: 'googlechatBotId',
    zalo: 'zaloBotId',
  };

  const key = channelKeys[ch];
  if (!key) {
    F.error(`Unknown channel: ${channel}`);
    process.exit(1);
  }

  const isConfigured = key === 'webhooks'
    ? !!(config.webhooks && config.webhooks.length > 0)
    : !!config[key];

  if (!isConfigured) {
    F.error(`${channel} channel not configured`);
    F.info(`Configure first with: natureco ${ch} connect`);
    process.exit(1);
  }

  F.success(`${channel} session opening...`);
  F.info(`Authentication and session initialization to ${channel} server.`);
}

function logoutChannel(channel) {
  if (!channel) {
    F.error('Channel name required');
    F.info('Usage: natureco channels logout <telegram|whatsapp|discord|slack|signal|irc|mattermost|imessage|sms|webhooks|matrix|teams|googlechat|zalo>');
    process.exit(1);
  }

  const config = getConfig();
  const ch = channel.toLowerCase();

  if (ch === 'telegram') {
    delete config.telegramToken;
    delete config.telegramBotId;
    delete config.telegramAllowedChats;
  } else if (ch === 'whatsapp') {
    if (config.whatsappBotId) {
      const sessionDir = path.join(os.homedir(), '.natureco', 'whatsapp-sessions', config.whatsappBotId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
    delete config.whatsappConnected;
    delete config.whatsappBotId;
    delete config.whatsappPhone;
    delete config.whatsappAllowedNumbers;
  } else if (ch === 'discord') {
    delete config.discordToken;
    delete config.discordBotId;
  } else if (ch === 'slack') {
    delete config.slackToken;
    delete config.slackBotId;
  } else if (ch === 'signal') {
    delete config.signalHttpUrl;
    delete config.signalAccount;
    delete config.signalDmPolicy;
    delete config.signalBotId;
  } else if (ch === 'irc') {
    delete config.ircHost; delete config.ircPort; delete config.ircTls;
    delete config.ircNick; delete config.ircUsername; delete config.ircPassword;
    delete config.ircChannels; delete config.ircDmPolicy; delete config.ircBotId;
  } else if (ch === 'mattermost') {
    delete config.mattermostBaseUrl; delete config.mattermostToken;
    delete config.mattermostDmPolicy; delete config.mattermostBotId;
  } else if (ch === 'imessage') {
    delete config.imessageCliPath; delete config.imessageDmPolicy; delete config.imessageBotId;
  } else if (ch === 'sms') {
    delete config.smsAccountSid; delete config.smsAuthToken; delete config.smsFromNumber;
    delete config.smsPublicWebhookUrl; delete config.smsDmPolicy; delete config.smsBotId;
  } else if (ch === 'webhooks') {
    delete config.webhooks; delete config.webhookEnabled;
  } else {
    F.error(`Unknown channel: ${channel}`);
    process.exit(1);
  }

  saveConfig(config);
  F.success(`${channel} session closed and config cleaned`);
}

function capabilitiesChannels(channel) {
  const capabilities = [
    { name: 'telegram',   send: '✓', receive: '✓', media: '✓', polls: '✓', admin: '✓', webhooks: '✓', threads: '✓' },
    { name: 'whatsapp',   send: '✓', receive: '✓', media: '✓', polls: '✗', admin: '✗', webhooks: '✓', threads: '✗' },
    { name: 'discord',    send: '✓', receive: '✓', media: '✓', polls: '✓', admin: '✓', webhooks: '✓', threads: '✓' },
    { name: 'slack',      send: '✓', receive: '✓', media: '✓', polls: '✓', admin: '✓', webhooks: '✓', threads: '✓' },
    { name: 'signal',     send: '✓', receive: '✓', media: '✓', polls: '✗', admin: '✗', webhooks: '✗', threads: '✗' },
    { name: 'irc',        send: '✓', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✗', threads: '✗' },
    { name: 'mattermost', send: '✓', receive: '✓', media: '✓', polls: '✓', admin: '✓', webhooks: '✓', threads: '✓' },
    { name: 'imessage',   send: '✓', receive: '✓', media: '✓', polls: '✗', admin: '✗', webhooks: '✗', threads: '✓' },
    { name: 'sms',        send: '✓', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✓', threads: '✗' },
    { name: 'webhooks',   send: '✗', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✗', threads: '✗' },
    { name: 'matrix',     send: '✓', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✗', threads: '✓' },
    { name: 'teams',      send: '✓', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✓', threads: '✓' },
    { name: 'googlechat', send: '✓', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✓', threads: '✓' },
    { name: 'zalo',       send: '✓', receive: '✓', media: '✗', polls: '✗', admin: '✗', webhooks: '✓', threads: '✗' },
  ];

  const entries = channel
    ? capabilities.filter(c => c.name === channel.toLowerCase())
    : capabilities;

  if (channel && entries.length === 0) {
    F.error(`Unknown channel: ${channel}`);
    process.exit(1);
  }

  const headers = ['Channel', 'Send', 'Recv', 'Media', 'Polls', 'Admin', 'WkHk', 'Threads'];
  const rows = entries.map(c => [c.name, c.send, c.receive, c.media, c.polls, c.admin, c.webhooks, c.threads]);

  F.table(headers, rows);
  F.meta('WkHk = Webhook Callback support');
}

function resolveIdentifier(channel, identifier) {
  if (!channel) {
    F.error('Channel name required');
    F.info('Usage: natureco channels resolve <channel> <user/group>');
    process.exit(1);
  }

  if (!identifier) {
    F.error('User/group identifier required');
    F.info('Usage: natureco channels resolve <channel> <user/group>');
    process.exit(1);
  }

  const knownKinds = ['telegram', 'whatsapp', 'discord', 'slack', 'signal', 'irc', 'mattermost', 'imessage', 'sms', 'webhooks', 'matrix', 'teams', 'googlechat', 'zalo'];
  const ch = channel.toLowerCase();

  if (!knownKinds.includes(ch)) {
    F.error(`Unknown channel: ${channel}`);
    process.exit(1);
  }

  F.header('Resolve Identifier');
  F.kv('Channel', ch);
  F.kv('Identifier', identifier);
  F.kv('Action', `Query ${ch} API to resolve "${identifier}" to a canonical user/group ID`);
  F.kv('Result', `[mock] resolved to ${ch}:${identifier.replace(/[^a-zA-Z0-9]/g, '_')}@${ch}.local`);
}

function listChannels() {
  const config = getConfig();
  const channels = [];

  if (config.telegramToken) {
    channels.push({
      name: 'Telegram',
      type: '✈',
      status: 'connected',
      detail: `token: ${config.telegramToken.slice(0, 12)}...`,
    });
  }

  if (config.whatsappConnected) {
    channels.push({
      name: 'WhatsApp',
      type: '📱',
      status: 'connected',
      detail: config.whatsappPhone ? `+${config.whatsappPhone.split(':')[0]}` : 'connected',
    });
  }

  if (config.discordToken) {
    channels.push({
      name: 'Discord',
      type: '🎮',
      status: 'connected',
      detail: `token: ${config.discordToken.slice(0, 12)}...`,
    });
  }

  if (config.slackToken) {
    channels.push({
      name: 'Slack',
      type: '💼',
      status: 'connected',
      detail: `token: ${config.slackToken.slice(0, 12)}...`,
    });
  }

  if (config.signalBotId) {
    channels.push({
      name: 'Signal',
      type: '🔒',
      status: 'connected',
      detail: `account: ${config.signalAccount || 'connected'}`,
    });
  }

  if (config.ircBotId) {
    channels.push({
      name: 'IRC',
      type: '💬',
      status: 'connected',
      detail: `${config.ircHost}:${config.ircPort} (${config.ircNick})`,
    });
  }

  if (config.mattermostBotId) {
    channels.push({
      name: 'Mattermost',
      type: '📢',
      status: 'connected',
      detail: `server: ${config.mattermostBaseUrl || 'connected'}`,
    });
  }

  if (config.matrixBotId) {
    channels.push({
      name: 'Matrix',
      type: '🔷',
      status: 'connected',
      detail: `homeserver: ${config.matrixHomeserver || 'connected'}`,
    });
  }

  if (config.teamsBotId) {
    channels.push({
      name: 'Microsoft Teams',
      type: '🟦',
      status: 'connected',
      detail: `app: ${config.teamsAppId || 'connected'} (webhook)`,
    });
  }

  if (config.googlechatBotId) {
    channels.push({
      name: 'Google Chat',
      type: '🟩',
      status: 'connected',
      detail: config.googlechatKeyFile ? 'service account (webhook)' : 'webhook URL (send only)',
    });
  }

  if (config.zaloBotId) {
    channels.push({
      name: 'Zalo',
      type: '🔵',
      status: 'connected',
      detail: 'Official Account (webhook)',
    });
  }

  if (config.imessageBotId) {
    channels.push({
      name: 'iMessage',
      type: '💬',
      status: 'connected',
      detail: 'macOS bridge',
    });
  }

  if (config.smsBotId) {
    channels.push({
      name: 'SMS (Twilio)',
      type: '📨',
      status: 'connected',
      detail: `number: ${config.smsFromNumber || 'connected'}`,
    });
  }

  if (config.webhooks && config.webhooks.length > 0) {
    channels.push({
      name: 'Webhooks',
      type: '🔗',
      status: 'connected',
      detail: `${config.webhooks.length} route`,
    });
  }

  F.header('Channels');

  if (channels.length === 0) {
    console.log('\n' + tui.styled(L('  📡 Bağlı Kanal Yok', '  📡 No Connected Channels'), { color: tui.PALETTE.warning, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n  ' + tui.C.muted(L('Bağlamak için:', 'To connect:')));
    const connectCmds = ['telegram', 'whatsapp', 'discord', 'slack', 'signal', 'irc', 'mattermost', 'imessage', 'sms', 'webhooks', 'matrix', 'teams', 'googlechat', 'zalo'];
    for (const c of connectCmds) {
      console.log('   ' + tui.C.brand('natureco ' + c + ' connect'));
    }
    console.log('');
    return;
  }

  console.log('\n' + tui.styled(L('  📡 Bağlı Kanallar (', '  📡 Connected Channels (') + channels.length + ')', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
  console.log('\n' + tui.table(channels, [
    {
      key: 'name', label: L('Kanal', 'Channel'), minWidth: 14,
      render: r => tui.styled(r.type + ' ' + r.name, { color: tui.PALETTE.primary, bold: true })
    },
    {
      key: 'status', label: L('Durum', 'Status'), minWidth: 14,
      render: r => r.status === 'connected'
        ? tui.styled(L('  ✓ Bağlı ', '  ✓ Linked '), { bg: tui.PALETTE.success, color: '#000', bold: true })
        : tui.styled(L(' ✗ Kopuk ', ' ✗ Down '), { bg: tui.PALETTE.muted, color: '#000', bold: true })
    },
    { key: 'detail', label: L('Detay', 'Detail'), minWidth: 30, render: r => tui.C.muted(r.detail) },
  ], { borderStyle: 'round', zebra: true }));

  console.log('\n  ' + tui.C.muted(L('Kaldırmak için: ', 'To remove: ')) + tui.C.brand(L('natureco channels remove <kanal>', 'natureco channels remove <channel>')));
  console.log('');
}

function statusChannels() {
  const config = getConfig();

  const checks = [
    { name: 'Telegram', ok: !!config.telegramToken },
    { name: 'WhatsApp', ok: !!config.whatsappConnected },
    { name: 'Discord',  ok: !!config.discordToken },
    { name: 'Slack',    ok: !!config.slackToken },
    { name: 'Signal',   ok: !!config.signalBotId },
    { name: 'IRC',      ok: !!config.ircBotId },
    { name: 'Mattermost', ok: !!config.mattermostBotId },
    { name: 'iMessage', ok: !!config.imessageBotId },
    { name: 'SMS',      ok: !!config.smsBotId },
    { name: 'Webhooks', ok: !!(config.webhooks && config.webhooks.length > 0) },
  ];

  checks.forEach(ch => F.dot(ch.ok, ch.name));

  const connected = checks.filter(c => c.ok).length;
  F.kv('Active', `${connected}/${checks.length} channels`);
}

function removeChannel(channel) {
  if (!channel) {
    F.error('Channel name required');
    F.info('Usage: natureco channels remove <telegram|whatsapp|discord|slack|signal|irc|mattermost|imessage|sms|webhooks|matrix|teams|googlechat|zalo>');
    process.exit(1);
  }

  const config = getConfig();
  const ch = channel.toLowerCase();

  if (ch === 'telegram') {
    delete config.telegramToken;
    delete config.telegramBotId;
    delete config.telegramAllowedChats;
  } else if (ch === 'whatsapp') {
    if (config.whatsappBotId) {
      const sessionDir = path.join(os.homedir(), '.natureco', 'whatsapp-sessions', config.whatsappBotId);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
    delete config.whatsappConnected;
    delete config.whatsappBotId;
    delete config.whatsappPhone;
    delete config.whatsappAllowedNumbers;
  } else if (ch === 'discord') {
    delete config.discordToken;
    delete config.discordBotId;
  } else if (ch === 'slack') {
    delete config.slackToken;
    delete config.slackBotId;
  } else if (ch === 'signal') {
    delete config.signalHttpUrl;
    delete config.signalAccount;
    delete config.signalDmPolicy;
    delete config.signalBotId;
  } else if (ch === 'irc') {
    delete config.ircHost; delete config.ircPort; delete config.ircTls;
    delete config.ircNick; delete config.ircUsername; delete config.ircPassword;
    delete config.ircChannels; delete config.ircDmPolicy; delete config.ircBotId;
  } else if (ch === 'mattermost') {
    delete config.mattermostBaseUrl; delete config.mattermostToken;
    delete config.mattermostDmPolicy; delete config.mattermostBotId;
  } else if (ch === 'imessage') {
    delete config.imessageCliPath; delete config.imessageDmPolicy; delete config.imessageBotId;
  } else if (ch === 'sms') {
    delete config.smsAccountSid; delete config.smsAuthToken; delete config.smsFromNumber;
    delete config.smsPublicWebhookUrl; delete config.smsDmPolicy; delete config.smsBotId;
  } else if (ch === 'webhooks') {
    delete config.webhooks; delete config.webhookEnabled;
  } else {
    F.error(`Unknown channel: ${channel}`);
    process.exit(1);
  }

  saveConfig(config);
  F.success(`${channel} removed`);
}

function channelLogs(channel) {
  const logFile = path.join(os.homedir(), '.natureco', 'gateway.log');
  if (!fs.existsSync(logFile)) {
    F.meta('Log file not found.');
    return;
  }

  const lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(l => l.trim());
  const filtered = channel
    ? lines.filter(l => foldTr(l).includes(foldTr(channel)))
    : lines;

  const last = filtered.slice(-20);
  F.header(`Channel Logs${channel ? ` (${channel})` : ''}`);
  last.forEach(l => F.meta(l));
}

module.exports = channels;
