/**
 * Gateway runtime for the Matrix / Teams / Google Chat / Zalo channels.
 *
 * The older channels each inline their own copy of the inbound handler:
 * skip own message → channelGate → runBrain (or a tool-less fallback) → send.
 * That is the part worth sharing, so `routeInbound` implements it once and each
 * channel only supplies transport.
 *
 * Kept out of gateway-server.js, which is already 2.3k lines.
 */

const { getLang: _gl } = require('./i18n');

const L = (tr, en) => (_gl() === 'en' ? en : tr);

/** Injected by the gateway so this module does not import it circularly. */
let deps = {
  channelGate: () => ({ allowed: true, trusted: true, reason: 'open' }),
  log: () => {},
};

function configure(overrides) {
  deps = { ...deps, ...overrides };
}

/**
 * Turn an inbound message into a reply string, applying the same sender
 * verification and memory isolation the other channels use.
 * Returns '' when nothing should be sent (blocked sender, empty text).
 */
async function routeInbound({ channel, chatKey, senderId, text, config }) {
  const message = String(text || '').trim();
  if (!message) return '';

  const gate = deps.channelGate(config, channel, senderId);
  if (!gate.allowed) {
    deps.log(channel, `Blocked (${gate.reason}): ${senderId}`, 'yellow');
    return '';
  }

  if (gate.trusted) {
    const { runBrain } = require('./channel-brain');
    return await runBrain({ channel, chatKey: String(chatKey), text: message });
  }

  // Untrusted sender: answer without tools and without touching memory.
  const { sendMessage } = require('./api');
  const response = await sendMessage(
    config.providerApiKey || config.apiKey || '',
    'universal-provider',
    message,
    `${channel}_${chatKey}`,
    `You are a helpful ${channel} assistant. Keep responses concise.`,
    { noTools: true },
  );
  return response?.reply || response?.message || '';
}

// ── Matrix ──────────────────────────────────────────────────────────────────
// Long-polls /sync, so it needs no public address. `since` is carried forward
// between polls; without it the server replays history on every call.

let matrixStop = false;

async function startMatrixProvider(config) {
  const homeserver = String(config.matrixHomeserver || '').replace(/\/+$/, '');
  const token = config.matrixToken;
  matrixStop = false;

  let userId = config.matrixUserId;
  try {
    const res = await fetch(`${homeserver}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      deps.log('matrix', `auth failed (HTTP ${res.status})`, 'red');
      return;
    }
    userId = (await res.json()).user_id || userId;
  } catch (error) {
    deps.log('matrix', `connection failed: ${error.message}`, 'red');
    return;
  }

  global.matrixProvider = { homeserver, token, userId };
  deps.log('matrix', `authenticated as ${userId}`, 'green');

  let since = null;
  const poll = async () => {
    if (matrixStop) return;
    try {
      const url = new URL(`${homeserver}/_matrix/client/v3/sync`);
      url.searchParams.set('timeout', '30000');
      if (since) url.searchParams.set('since', since);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        // Slightly above the server-side timeout so a normal empty poll is not
        // aborted as a client error.
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        deps.log('matrix', `sync HTTP ${res.status}`, 'yellow');
        setTimeout(poll, 15000);
        return;
      }
      const body = await res.json();
      since = body.next_batch || since;

      const rooms = body.rooms?.join || {};
      for (const [roomId, room] of Object.entries(rooms)) {
        for (const event of room.timeline?.events || []) {
          if (event.type !== 'm.room.message') continue;
          if (event.sender === userId) continue; // own echo
          const text = event.content?.body;
          if (!text) continue;
          deps.log('matrix', `Inbound from ${event.sender}: "${String(text).slice(0, 80)}"`, 'cyan');
          try {
            const reply = await routeInbound({ channel: 'matrix', chatKey: roomId, senderId: event.sender, text, config });
            if (reply) {
              await sendMatrixMessage(config, roomId, reply);
              deps.log('matrix', `Reply sent to ${roomId} (${reply.length} chars)`, 'green');
            }
          } catch (error) {
            deps.log('matrix', `handler error: ${error.message}`, 'red');
          }
        }
      }
      setImmediate(poll);
    } catch (error) {
      deps.log('matrix', `sync error: ${error.message}`, 'yellow');
      setTimeout(poll, 15000);
    }
  };
  poll();
}

function stopMatrixProvider() {
  matrixStop = true;
  global.matrixProvider = null;
}

async function sendMatrixMessage(config, roomId, message) {
  const homeserver = String(config.matrixHomeserver || '').replace(/\/+$/, '');
  // Matrix deduplicates on the transaction id, so it must be unique per send.
  const txnId = `nc${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${config.matrixToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: String(message) }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) {
    throw new Error(`Matrix send failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// ── Microsoft Teams ─────────────────────────────────────────────────────────
// Webhook inbound. Outbound needs the serviceUrl and conversation id captured
// from the inbound activity, so they are remembered per conversation.

const teamsConversations = new Map();
let teamsToken = { value: null, expiresAt: 0 };

async function teamsAccessToken(config) {
  if (teamsToken.value && Date.now() < teamsToken.expiresAt) return teamsToken.value;
  const { fetchTeamsToken } = require('../commands/teams');
  const token = await fetchTeamsToken({
    appId: config.teamsAppId,
    appPassword: config.teamsAppPassword,
    tenantId: config.teamsTenantId,
  });
  // Refresh a minute early rather than racing the expiry.
  teamsToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(60, (token.expires_in || 3600) - 60) * 1000,
  };
  return teamsToken.value;
}

async function handleTeamsWebhook(config, activity) {
  if (!activity || activity.type !== 'message') return { status: 200, body: {} };

  const conversationId = activity.conversation?.id;
  const serviceUrl = activity.serviceUrl;
  if (!conversationId || !serviceUrl) return { status: 400, body: { error: 'missing conversation or serviceUrl' } };

  if (activity.from?.id && config.teamsBotAppId && activity.from.id === config.teamsBotAppId) {
    return { status: 200, body: {} };
  }

  teamsConversations.set(conversationId, { serviceUrl, activityId: activity.id });

  // Teams strips the @mention into text but leaves the bot name in it.
  const text = String(activity.text || '').replace(/<at>[^<]*<\/at>/g, '').trim();
  const senderId = activity.from?.aadObjectId || activity.from?.id || 'unknown';
  deps.log('teams', `Inbound from ${senderId}: "${text.slice(0, 80)}"`, 'cyan');

  try {
    const reply = await routeInbound({ channel: 'teams', chatKey: conversationId, senderId, text, config });
    if (reply) {
      await sendTeamsMessage(config, conversationId, reply);
      deps.log('teams', `Reply sent to ${conversationId} (${reply.length} chars)`, 'green');
    }
  } catch (error) {
    deps.log('teams', `handler error: ${error.message}`, 'red');
    return { status: 500, body: { error: error.message } };
  }
  return { status: 200, body: {} };
}

async function sendTeamsMessage(config, conversationId, message) {
  const known = teamsConversations.get(conversationId);
  const serviceUrl = (known?.serviceUrl || config.teamsServiceUrl || '').replace(/\/+$/, '');
  if (!serviceUrl) {
    throw new Error(L(
      'Teams serviceUrl bilinmiyor — bot en az bir mesaj almalı',
      'The Teams serviceUrl is unknown — the bot must receive at least one message first',
    ));
  }
  const token = await teamsAccessToken(config);
  const res = await fetch(`${serviceUrl}/v3/conversations/${encodeURIComponent(conversationId)}/activities`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', text: String(message) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Teams send failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

// ── Google Chat ─────────────────────────────────────────────────────────────

let googleToken = { value: null, expiresAt: 0 };

async function googleAccessToken(config) {
  if (googleToken.value && Date.now() < googleToken.expiresAt) return googleToken.value;
  const { fetchGoogleToken } = require('../commands/googlechat');
  const token = await fetchGoogleToken(config.googlechatKeyFile);
  googleToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max(60, (token.expires_in || 3600) - 60) * 1000,
  };
  return googleToken.value;
}

async function handleGoogleChatWebhook(config, event) {
  if (!event) return { status: 400, body: { error: 'empty payload' } };

  // Google Chat sends ADDED_TO_SPACE / REMOVED_FROM_SPACE too; only MESSAGE
  // carries user text.
  if (event.type && event.type !== 'MESSAGE') return { status: 200, body: {} };

  const spaceName = event.space?.name || event.message?.space?.name;
  const text = String(event.message?.argumentText || event.message?.text || '').trim();
  const senderId = event.user?.name || event.message?.sender?.name || 'unknown';
  if (event.message?.sender?.type === 'BOT') return { status: 200, body: {} };
  if (!spaceName) return { status: 400, body: { error: 'missing space' } };

  deps.log('googlechat', `Inbound from ${senderId}: "${text.slice(0, 80)}"`, 'cyan');
  try {
    const reply = await routeInbound({ channel: 'googlechat', chatKey: spaceName, senderId, text, config });
    if (!reply) return { status: 200, body: {} };
    // Answering in the HTTP response is the cheapest path and needs no token;
    // fall back to the API only when that is not possible.
    return { status: 200, body: { text: reply } };
  } catch (error) {
    deps.log('googlechat', `handler error: ${error.message}`, 'red');
    return { status: 500, body: { error: error.message } };
  }
}

async function sendGoogleChatMessage(config, space, message) {
  // Prefer the service account (can post to any space it is in); the incoming
  // webhook is a single-space fallback.
  if (config.googlechatKeyFile) {
    const token = await googleAccessToken(config);
    const res = await fetch(`https://chat.googleapis.com/v1/${encodeURI(space)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(message) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Google Chat send failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return res.json();
  }

  if (config.googlechatWebhookUrl) {
    const res = await fetch(config.googlechatWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(message) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      throw new Error(`Google Chat webhook failed (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    return res.json().catch(() => ({}));
  }

  throw new Error(L('Google Chat yapılandırılmamış', 'Google Chat is not configured'));
}

// ── Zalo ────────────────────────────────────────────────────────────────────

async function handleZaloWebhook(config, event) {
  if (!event) return { status: 400, body: { error: 'empty payload' } };
  if (event.event_name && !String(event.event_name).startsWith('user_send')) {
    return { status: 200, body: {} };
  }

  const senderId = event.sender?.id;
  const text = String(event.message?.text || '').trim();
  if (!senderId) return { status: 400, body: { error: 'missing sender' } };

  deps.log('zalo', `Inbound from ${senderId}: "${text.slice(0, 80)}"`, 'cyan');
  try {
    const reply = await routeInbound({ channel: 'zalo', chatKey: senderId, senderId, text, config });
    if (reply) {
      await sendZaloMessage(config, senderId, reply);
      deps.log('zalo', `Reply sent to ${senderId} (${reply.length} chars)`, 'green');
    }
  } catch (error) {
    deps.log('zalo', `handler error: ${error.message}`, 'red');
    return { status: 500, body: { error: error.message } };
  }
  return { status: 200, body: {} };
}

async function sendZaloMessage(config, userId, message) {
  const { API_BASE } = require('../commands/zalo');
  const res = await fetch(`${API_BASE}/v3.0/oa/message/cs`, {
    method: 'POST',
    headers: { access_token: config.zaloAccessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { user_id: String(userId) },
      message: { text: String(message) },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Zalo send failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  let payload = {};
  try { payload = JSON.parse(text); } catch { /* non-JSON success is unexpected but not fatal */ }
  // Zalo reports failures with a 200 and an error code in the body.
  if (payload.error && payload.error !== 0) {
    throw new Error(`Zalo send rejected (error ${payload.error}): ${payload.message || 'unknown'}`);
  }
  return payload;
}

module.exports = {
  configure,
  routeInbound,
  startMatrixProvider,
  stopMatrixProvider,
  sendMatrixMessage,
  handleTeamsWebhook,
  sendTeamsMessage,
  handleGoogleChatWebhook,
  sendGoogleChatMessage,
  handleZaloWebhook,
  sendZaloMessage,
  _internals: { teamsConversations, teamsAccessToken, googleAccessToken },
};
