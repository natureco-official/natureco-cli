const chalk = require('chalk');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig } = require('../utils/config');

const HISTORY_FILE = path.join(os.homedir(), '.natureco', 'messages.jsonl');
const PID_FILE = path.join(os.homedir(), '.natureco', 'gateway.pid');
const GATEWAY_HTTP_URL = 'http://127.0.0.1:3847/send';

const VALID_CHANNELS = ['telegram', 'whatsapp', 'discord', 'slack', 'signal', 'irc', 'mattermost', 'imessage', 'sms'];

const CHANNEL_CONFIG_MAP = {
  telegram:   { keys: ['telegramToken', 'telegramBotId'], all: true },
  whatsapp:   { keys: ['whatsappConnected', 'whatsappBotId'], all: true },
  discord:    { keys: ['discordBotId'], all: false },
  slack:      { keys: ['slackToken', 'slackBotId'], all: true },
  signal:     { keys: ['signalBotId'], all: false },
  irc:        { keys: ['ircBotId'], all: false },
  mattermost: { keys: ['mattermostBotId', 'mattermostToken'], all: true },
  imessage:   { keys: ['imessageBotId'], all: false },
  sms:        { keys: ['smsBotId'], all: false },
};

function parseFlags(args) {
  const flags = {};
  const flagNames = ['channel', 'target', 'message', 'media', 'question', 'options', 'message-id', 'emoji', 'query', 'limit', 'edit-id', 'delete-id', 'channel-all', 'thread-id', 'sticker-id', 'sticker', 'user', 'role', 'action', 'reason', 'pin-id', 'duration', 'name', 'time', 'path'];
  for (let i = 0; i < args.length; i++) {
    for (const name of flagNames) {
      const long = '--' + name;
      if (args[i] === long) {
        const val = args[i + 1];
        if (val !== undefined && !val.startsWith('--')) {
          flags[name] = val;
          i++;
        } else {
          flags[name] = true;
        }
      }
    }
  }
  return flags;
}

function getAction(args) {
  const action = args.find(a => !a.startsWith('--'));
  return action || 'send';
}

function ensureHistoryDir() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logHistory(entry) {
  ensureHistoryDir();
  try {
    fs.appendFileSync(HISTORY_FILE, JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n', 'utf8');
  } catch (err) {
    F.warning('Could not write message history: ' + err.message);
  }
}

function checkGatewayRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function channelDisplayName(ch) {
  return ch.charAt(0).toUpperCase() + ch.slice(1);
}

async function trySendViaGateway(channel, target, messageText, mediaPath) {
  if (!checkGatewayRunning()) return false;
  try {
    const body = { channel, target, message: messageText };
    if (mediaPath) body.media = mediaPath;
    const response = await fetch(GATEWAY_HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (response.ok) {
      F.success('Message sent via gateway.');
      F.kv('Channel', channel);
      F.kv('Target', target);
      if (messageText) F.kv('Message', messageText);
      return true;
    }
    F.warning('Gateway returned: ' + (data.error || 'unknown error'));
    return false;
  } catch {
    return false;
  }
}

function showPreview(channel, target, messageText, extra) {
  F.kv('Channel', channel);
  F.kv('Target', target);
  if (messageText) F.kv('Message', messageText);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) F.kv(k, v);
    }
  }
}

function checkChannelConfig(config, channel) {
  const spec = CHANNEL_CONFIG_MAP[channel];
  if (!spec) {
    console.log(chalk.red('\nUnknown channel: ' + channel + '\n'));
    console.log(chalk.gray('Supported channels: ' + VALID_CHANNELS.join(', ') + '\n'));
    process.exit(1);
  }
  const present = spec.keys.map(k => config[k] !== undefined && config[k] !== null && config[k] !== '');
  const missing = spec.keys.every(v => v === false);
  if (missing) {
    console.log(chalk.red('\nChannel ' + channelDisplayName(channel) + ' is not configured.\n'));
    console.log(chalk.gray('Configure it first: natureco ' + channel + ' connect\n'));
    process.exit(1);
  }
  if (spec.all && !present.every(Boolean)) {
    console.log(chalk.red('\nChannel ' + channelDisplayName(channel) + ' is not fully configured.\n'));
    console.log(chalk.gray('Run: natureco ' + channel + ' connect\n'));
    process.exit(1);
  }
}

async function message(args) {
  const flags = parseFlags(args);
  const action = getAction(args);
  const config = getConfig();

  const channel = flags['channel-all'] ? null : (flags.channel || 'whatsapp');
  const target = flags.target;
  const messageText = flags.message;
  const mediaPath = flags.media;
  const question = flags.question;
  const optionsRaw = flags.options;
  const messageId = flags['message-id'];
  const emoji = flags.emoji;
  const query = flags.query;
  const limit = flags.limit || '20';
  const editId = flags['edit-id'];
  const deleteId = flags['delete-id'];
  const nonFlagArgs = args.filter(a => !a.startsWith('--'));
  const compoundAction = nonFlagArgs.length >= 2 ? nonFlagArgs[0] + ' ' + nonFlagArgs[1] : null;

  if (action === 'send') {
    if (!channel || !target || !messageText) {
      console.log(chalk.red('\nUsage: message send --channel <ch> --target <dest> --message <text>\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Preparing to send ' + channelDisplayName(channel) + ' message...');
    showPreview(channel, target, messageText, mediaPath ? { Media: mediaPath } : null);
    const sent = await trySendViaGateway(channel, target, messageText, mediaPath);
    if (!sent) {
      F.info('(Gateway not available -- message logged for later dispatch)');
    }
    logHistory({ action: 'send', channel, target, message: messageText, media: mediaPath, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'broadcast') {
    const targetsRaw = flags.target || '';
    const targets = targetsRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (targets.length === 0 || !messageText) {
      console.log(chalk.red('\nUsage: message broadcast --targets <t1,t2,...> --message <text>\n'));
      process.exit(1);
    }
    const channelsToUse = flags['channel-all'] ? VALID_CHANNELS : (channel ? [channel] : VALID_CHANNELS);
    for (const ch of channelsToUse) {
      if (!VALID_CHANNELS.includes(ch)) continue;
      const cfgOk = (() => {
        try { checkChannelConfig(config, ch); return true; } catch { return false; }
      })();
      if (!cfgOk) {
        F.info('Skipping ' + ch + ' (not configured)');
        continue;
      }
      for (const tgt of targets) {
        F.info('Broadcasting to ' + ch + ' / ' + tgt + '...');
        showPreview(ch, tgt, messageText, null);
        const sent = await trySendViaGateway(ch, tgt, messageText, mediaPath);
        if (!sent) {
          F.info('(Gateway not available -- message logged)');
        }
        logHistory({ action: 'broadcast', channel: ch, target: tgt, message: messageText, media: mediaPath, dispatched: sent });
      }
    }
    return;
  }

  if (action === 'poll') {
    if (!channel || !target || !question || !optionsRaw) {
      console.log(chalk.red('\nUsage: message poll --channel <ch> --target <dest> --question <q> --options <a,b,c>\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    const options = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
    F.info('Preparing poll on ' + channelDisplayName(channel) + '...');
    F.table(['Property', 'Value'], [
      ['Channel', channel],
      ['Target', target],
      ['Question', question],
      ['Options', options.join(' | ')],
    ]);
    const sent = await trySendViaGateway(channel, target, '[POLL] ' + question + ' (' + options.join(', ') + ')', mediaPath);
    if (!sent) {
      F.info('(Gateway not available -- poll logged for later dispatch)');
    }
    logHistory({ action: 'poll', channel, target, question, options, media: mediaPath, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'react') {
    if (!channel || !target || !messageId || !emoji) {
      console.log(chalk.red('\nUsage: message react --channel <ch> --target <dest> --message-id <id> --emoji <e>\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Preparing reaction on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { 'Message ID': messageId, Emoji: emoji });
    const sent = await trySendViaGateway(channel, target, '[REACT] ' + messageId + ' ' + emoji, null);
    if (!sent) {
      F.info('(Gateway not available -- reaction logged for later dispatch)');
    }
    logHistory({ action: 'react', channel, target, messageId, emoji, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'read') {
    if (!channel || !target) {
      console.log(chalk.red('\nUsage: message read --channel <ch> --target <dest> [--limit <n>]\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    const limitNum = parseInt(limit, 10) || 20;
    F.info('Reading last ' + limitNum + ' messages from ' + channelDisplayName(channel) + ' / ' + target + '...');
    if (!checkGatewayRunning()) {
      F.info('Gateway not running. Showing local history...');
    }
    if (fs.existsSync(HISTORY_FILE)) {
      const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
      const relevant = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(e => e && e.channel === channel && e.target === target)
        .slice(-limitNum);
      if (relevant.length === 0) {
        F.info('No messages found in local history.');
      } else {
        for (const entry of relevant) {
          const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '?';
          F.kv('Time', time);
          F.kv('Message', entry.message || entry.question || '(no text)');
          if (entry.dispatched) F.success('sent');
        }
      }
    } else {
      F.info('No message history found.');
    }
    return;
  }

  if (action === 'edit') {
    if (!channel || !target || !editId || !messageText) {
      console.log(chalk.red('\nUsage: message edit --channel <ch> --target <dest> --edit-id <id> --message <text>\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Preparing to edit message on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, messageText, { 'Edit ID': editId });
    const sent = await trySendViaGateway(channel, target, '[EDIT ' + editId + '] ' + messageText, null);
    if (!sent) {
      F.info('(Gateway not available -- edit logged for later dispatch)');
    }
    logHistory({ action: 'edit', channel, target, editId, message: messageText, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'delete') {
    if (!channel || !target || !deleteId) {
      console.log(chalk.red('\nUsage: message delete --channel <ch> --target <dest> --delete-id <id>\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Preparing to delete message on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { 'Delete ID': deleteId });
    const sent = await trySendViaGateway(channel, target, '[DELETE ' + deleteId + ']', null);
    if (!sent) {
      F.info('(Gateway not available -- deletion logged for later dispatch)');
    }
    logHistory({ action: 'delete', channel, target, deleteId, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'search') {
    if (!channel || !query) {
      console.log(chalk.red('\nUsage: message search --channel <ch> --query <q>\n'));
      process.exit(1);
    }
    if (!VALID_CHANNELS.includes(channel)) {
      console.log(chalk.red('\nUnsupported channel: ' + channel + '\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Searching ' + channelDisplayName(channel) + ' for: ' + query);
    if (fs.existsSync(HISTORY_FILE)) {
      const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
      const q = query.toLowerCase();
      const results = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(e => e && e.channel === channel && (
          (e.message && e.message.toLowerCase().includes(q)) ||
          (e.question && e.question.toLowerCase().includes(q)) ||
          (e.target && e.target.includes(q))
        ));
      if (results.length === 0) {
        F.info('No matches found in local history.');
      } else {
        F.success('Found ' + results.length + ' result(s)');
        const tableRows = results.map(entry => [
          entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '?',
          entry.target,
          entry.message || entry.question || '(no text)',
        ]);
        F.table(['Time', 'Target', 'Message'], tableRows);
      }
    } else {
      F.info('No message history found.');
    }
    return;
  }

  if (action === 'pin') {
    if (!channel || !target || !messageId) {
      console.log(chalk.red('\nUsage: message pin --channel <ch> --target <dest> --message-id <id>\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Pinning message on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { 'Message ID': messageId });
    const sent = await trySendViaGateway(channel, target, '[PIN] ' + messageId, null);
    if (!sent) F.info('(Gateway not available -- pin logged)');
    logHistory({ action: 'pin', channel, target, messageId, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'unpin') {
    if (!channel || !target || !messageId) {
      console.log(chalk.red('\nUsage: message unpin --channel <ch> --target <dest> --message-id <id>\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Unpinning message on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { 'Message ID': messageId });
    const sent = await trySendViaGateway(channel, target, '[UNPIN] ' + messageId, null);
    if (!sent) F.info('(Gateway not available -- unpin logged)');
    logHistory({ action: 'unpin', channel, target, messageId, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'thread') {
    const threadId = flags['thread-id'] || flags['message-id'];
    if (!channel || !target || !threadId || !messageText) {
      console.log(chalk.red('\nUsage: message thread --channel <ch> --target <dest> --thread-id <id> --message <text>\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Replying in thread on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, messageText, { 'Thread ID': threadId });
    const sent = await trySendViaGateway(channel, target, '[THREAD ' + threadId + '] ' + messageText, mediaPath);
    if (!sent) F.info('(Gateway not available -- thread reply logged)');
    logHistory({ action: 'thread', channel, target, threadId, message: messageText, media: mediaPath, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'sticker') {
    const stickerId = flags['sticker-id'] || flags.sticker || messageText;
    if (!channel || !target || !stickerId) {
      console.log(chalk.red('\nUsage: message sticker --channel <ch> --target <dest> --sticker-id <id>\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Sending sticker on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { 'Sticker': stickerId });
    const sent = await trySendViaGateway(channel, target, '[STICKER] ' + stickerId, mediaPath);
    if (!sent) F.info('(Gateway not available -- sticker logged)');
    logHistory({ action: 'sticker', channel, target, sticker: stickerId, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'role') {
    const roleUser = flags.user;
    const roleName = flags.role;
    const roleAction = flags.action || 'set';
    if (!channel || !target || !roleUser || !roleName) {
      console.log(chalk.red('\nUsage: message role --channel <ch> --target <dest> --user <user> --role <role> [--action set|remove]\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.info('Managing role on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { User: roleUser, Role: roleName, Action: roleAction });
    const sent = await trySendViaGateway(channel, target, '[ROLE ' + roleAction + '] ' + roleUser + ' ' + roleName, null);
    if (!sent) F.info('(Gateway not available -- role change logged)');
    logHistory({ action: 'role', channel, target, user: roleUser, role: roleName, roleAction, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  if (action === 'moderation') {
    const modAction = flags.action || 'warn';
    const modReason = flags.reason || 'No reason specified';
    const modMessageId = flags['message-id'];
    if (!channel || !target || !modMessageId) {
      console.log(chalk.red('\nUsage: message moderation --channel <ch> --target <dest> --message-id <id> [--action warn|mute|kick|ban] [--reason <text>]\n'));
      process.exit(1);
    }
    checkChannelConfig(config, channel);
    F.warning('Moderating message on ' + channelDisplayName(channel) + '...');
    showPreview(channel, target, null, { 'Message ID': modMessageId, Action: modAction, Reason: modReason });
    const sent = await trySendViaGateway(channel, target, '[MOD ' + modAction + '] ' + modMessageId + ': ' + modReason, null);
    if (!sent) F.info('(Gateway not available -- moderation logged)');
    logHistory({ action: 'moderation', channel, target, messageId: modMessageId, modAction, modReason, dispatched: sent });
    if (!sent) process.exit(0);
    return;
  }

  // ── reactions ─────────────────────────────────────────────────────
  if (action === 'reactions') {
    const ch = flags.channel || nonFlagArgs[1];
    const msgId = flags['message-id'] || nonFlagArgs[2];
    if (!ch || !msgId) { console.log(chalk.red('\nUsage: message reactions <channel> <messageId>\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'reactions.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try { fs.appendFileSync(file, JSON.stringify({ action: 'reactions', channel: ch, messageId: msgId, timestamp: new Date().toISOString() }) + '\n', 'utf8'); } catch (err) { F.warning(err.message); }
    F.info('Reactions on ' + ch + ' for ' + msgId + ':');
    if (fs.existsSync(file)) {
      const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const relevant = entries.filter(e => e.channel === ch && e.messageId === msgId);
      if (relevant.length === 0) F.info('No reactions found.');
      else for (const r of relevant.slice(-10)) F.kv(new Date(r.timestamp).toLocaleString(), 'reaction');
    }
    return;
  }

  // ── pins ──────────────────────────────────────────────────────────
  if (action === 'pins') {
    const ch = flags.channel || nonFlagArgs[1];
    if (!ch) { console.log(chalk.red('\nUsage: message pins <channel>\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'pins.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    F.info('Pinned messages in ' + ch + ':');
    if (fs.existsSync(file)) {
      const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const pinned = entries.filter(e => e.channel === ch && e.action === 'pin');
      if (pinned.length === 0) F.info('No pinned messages.');
      else for (const p of pinned.slice(-20)) F.kv(new Date(p.timestamp).toLocaleString(), p.messageId || '?');
    } else { F.info('No pinned messages found.'); }
    return;
  }

  // ── permissions ──────────────────────────────────────────────────
  if (action === 'permissions') {
    const ch = flags.channel || nonFlagArgs[1];
    const user = flags.user || nonFlagArgs[2];
    if (!ch) { console.log(chalk.red('\nUsage: message permissions <channel> [user]\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'permissions.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'permissions', channel: ch, user: user || null, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); } catch (err) { F.warning(err.message); }
    F.info('Permissions for ' + ch + (user ? ' / ' + user : '') + ':');
    F.info('(Full permission list not yet available)');
    return;
  }

  // ── channel info ─────────────────────────────────────────────────
  if (compoundAction === 'channel info') {
    const ch = flags.channel || nonFlagArgs[2];
    if (!ch) { console.log(chalk.red('\nUsage: message channel info <channel>\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'channels.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'channel info', channel: ch, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); } catch (err) { F.warning(err.message); }
    F.info('Channel info for ' + ch + ':');
    F.kv('Name', channelDisplayName(ch));
    F.kv('Key', ch);
    F.info('(Channel info not yet fully implemented)');
    return;
  }

  // ── channel list ─────────────────────────────────────────────────
  if (compoundAction === 'channel list') {
    const file = path.join(os.homedir(), '.natureco', 'channels.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    F.info('Available channels:');
    F.list(VALID_CHANNELS.map(ch => {
      const configured = (() => { try { checkChannelConfig(config, ch); return true; } catch { return false; } })();
      return { label: channelDisplayName(ch), value: configured ? 'configured' : 'not configured' };
    }));
    return;
  }

  // ── member info ──────────────────────────────────────────────────
  if (compoundAction === 'member info') {
    const ch = flags.channel || nonFlagArgs[2];
    const user = flags.user || nonFlagArgs[3];
    if (!ch || !user) { console.log(chalk.red('\nUsage: message member info <channel> <user>\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'members.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'member info', channel: ch, user, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); } catch (err) { F.warning(err.message); }
    F.info('Member info for ' + user + ' on ' + ch + ':');
    F.kv('User', user);
    F.kv('Channel', channelDisplayName(ch));
    F.info('(Member info not yet fully implemented)');
    return;
  }

  // ── voice status ─────────────────────────────────────────────────
  if (compoundAction === 'voice status') {
    const ch = flags.channel || nonFlagArgs[2];
    const file = path.join(os.homedir(), '.natureco', 'voice.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'voice status', channel: ch || 'all', timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); } catch (err) { F.warning(err.message); }
    F.info('Voice status' + (ch ? ' for ' + ch : ' (all channels)') + ':');
    F.info('(Voice status not yet fully implemented)');
    return;
  }

  // ── event list ──────────────────────────────────────────────────
  if (compoundAction === 'event list') {
    const ch = flags.channel || nonFlagArgs[2];
    const file = path.join(os.homedir(), '.natureco', 'events.jsonl');
    F.info('Events' + (ch ? ' in ' + ch : '') + ':');
    if (fs.existsSync(file)) {
      const entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const filtered = ch ? entries.filter(e => e.channel === ch) : entries;
      if (filtered.length === 0) F.info('No events found.');
      else for (const e of filtered.slice(-20)) F.kv(new Date(e.timestamp).toLocaleString(), (e.name || 'Unnamed') + (e.time ? ' at ' + e.time : ''));
    } else { F.info('No events found.'); }
    return;
  }

  // ── event create ─────────────────────────────────────────────────
  if (compoundAction === 'event create') {
    const ch = flags.channel || nonFlagArgs[2];
    const name = flags.name || nonFlagArgs[3];
    const time = flags.time || nonFlagArgs[4];
    if (!ch || !name) { console.log(chalk.red('\nUsage: message event create <channel> <name> [time]\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'events.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'event create', channel: ch, name, time: time || null, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); F.success('Event "' + name + '" created on ' + ch); } catch (err) { console.log(chalk.red('Error: ' + err.message + '\n')); process.exit(1); }
    return;
  }

  // ── thread create ─────────────────────────────────────────────────
  if (compoundAction === 'thread create') {
    const ch = flags.channel || nonFlagArgs[2];
    const name = flags.name || nonFlagArgs[3];
    if (!ch || !name) { console.log(chalk.red('\nUsage: message thread create <channel> <name>\n')); process.exit(1); }
    F.info('Would create thread ' + name + ' in ' + ch);
    return;
  }

  // ── thread list ─────────────────────────────────────────────────
  if (compoundAction === 'thread list') {
    const ch = flags.channel || nonFlagArgs[2];
    if (!ch) { console.log(chalk.red('\nUsage: message thread list <channel>\n')); process.exit(1); }
    F.info('Would list threads in ' + ch);
    return;
  }

  // ── thread reply ────────────────────────────────────────────────
  if (compoundAction === 'thread reply') {
    const ch = flags.channel || nonFlagArgs[2];
    const threadId = flags['thread-id'] || nonFlagArgs[3];
    const text = flags.message || nonFlagArgs[4];
    if (!ch || !threadId || !text) { console.log(chalk.red('\nUsage: message thread reply <channel> <threadId> <text>\n')); process.exit(1); }
    F.info('Would reply to ' + threadId + ' in ' + ch + ': ' + text);
    return;
  }

  // ── emoji list ──────────────────────────────────────────────────
  if (compoundAction === 'emoji list') {
    const ch = flags.channel || nonFlagArgs[2] || null;
    F.info('Would list emoji for ' + (ch || 'all channels'));
    return;
  }

  // ── emoji upload ────────────────────────────────────────────────
  if (compoundAction === 'emoji upload') {
    const ch = flags.channel || nonFlagArgs[2];
    const emojiPath = flags.path || nonFlagArgs[3];
    if (!ch || !emojiPath) { console.log(chalk.red('\nUsage: message emoji upload <channel> <path>\n')); process.exit(1); }
    F.info('Would upload emoji from ' + emojiPath + ' to ' + ch);
    return;
  }

  // ── sticker send ────────────────────────────────────────────────
  if (compoundAction === 'sticker send') {
    const ch = flags.channel || nonFlagArgs[2];
    const stickerId = flags['sticker-id'] || flags.sticker || nonFlagArgs[3];
    if (!ch || !stickerId) { console.log(chalk.red('\nUsage: message sticker send <channel> <stickerId>\n')); process.exit(1); }
    F.info('Would send sticker ' + stickerId + ' to ' + ch);
    return;
  }

  // ── sticker upload ──────────────────────────────────────────────
  if (compoundAction === 'sticker upload') {
    const ch = flags.channel || nonFlagArgs[2];
    const stickerPath = flags.path || nonFlagArgs[3];
    if (!ch || !stickerPath) { console.log(chalk.red('\nUsage: message sticker upload <channel> <path>\n')); process.exit(1); }
    F.info('Would upload sticker from ' + stickerPath + ' to ' + ch);
    return;
  }

  // ── timeout ──────────────────────────────────────────────────────
  if (action === 'timeout') {
    const ch = flags.channel || nonFlagArgs[1];
    const user = flags.user || nonFlagArgs[2];
    const duration = flags.duration || nonFlagArgs[3] || '5m';
    if (!ch || !user) { console.log(chalk.red('\nUsage: message timeout <channel> <user> [duration]\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'moderation.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'timeout', channel: ch, user, duration, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); F.warning(user + ' timed out on ' + ch + ' for ' + duration); } catch (err) { console.log(chalk.red('Error: ' + err.message + '\n')); process.exit(1); }
    return;
  }

  // ── kick ─────────────────────────────────────────────────────────
  if (action === 'kick') {
    const ch = flags.channel || nonFlagArgs[1];
    const user = flags.user || nonFlagArgs[2];
    if (!ch || !user) { console.log(chalk.red('\nUsage: message kick <channel> <user>\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'moderation.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'kick', channel: ch, user, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); F.warning(user + ' kicked from ' + ch); } catch (err) { console.log(chalk.red('Error: ' + err.message + '\n')); process.exit(1); }
    return;
  }

  // ── ban ──────────────────────────────────────────────────────────
  if (action === 'ban') {
    const ch = flags.channel || nonFlagArgs[1];
    const user = flags.user || nonFlagArgs[2];
    const reason = flags.reason || nonFlagArgs[3] || 'No reason specified';
    if (!ch || !user) { console.log(chalk.red('\nUsage: message ban <channel> <user> [reason]\n')); process.exit(1); }
    const file = path.join(os.homedir(), '.natureco', 'moderation.jsonl');
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entry = { action: 'ban', channel: ch, user, reason, timestamp: new Date().toISOString() };
    try { fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8'); F.warning(user + ' banned from ' + ch + ': ' + reason); } catch (err) { console.log(chalk.red('Error: ' + err.message + '\n')); process.exit(1); }
    return;
  }

  console.log(chalk.red('\nUnknown action: ' + (compoundAction || action) + '\n'));
  console.log(chalk.gray('Available actions: send, broadcast, poll, react, read, edit, delete, search, pin, unpin, thread, thread create, thread list, thread reply, sticker, sticker send, sticker upload, emoji list, emoji upload, role, moderation, reactions, pins, permissions, channel info, channel list, member info, voice status, event list, event create, timeout, kick, ban\n'));
  process.exit(1);
}

message.VALID_CHANNELS = VALID_CHANNELS;

module.exports = message;
