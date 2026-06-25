const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomicSync, readJsonSafeSync } = require('./atomic-file');

// ── Legacy botId-based sessions ─────────────────────────────────────────────────

const HISTORY_DIR = path.join(os.homedir(), '.natureco', 'history');

function getSessionsDir(botId) {
  return path.join(HISTORY_DIR, botId, 'sessions');
}

function ensureSessionsDir(botId) {
  const dir = getSessionsDir(botId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createSession(botId, botName) {
  ensureSessionsDir(botId);

  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const session = {
    id: sessionId,
    botId,
    botName,
    createdAt: new Date().toISOString(),
    messages: [],
  };

  _saveBotSession(botId, session);
  return session;
}

function _saveBotSession(botId, session) {
  ensureSessionsDir(botId);
  const sessionFile = path.join(getSessionsDir(botId), `${session.id}.json`);
  writeJsonAtomicSync(sessionFile, session);
}

function loadSession(botId, sessionId) {
  const sessionFile = path.join(getSessionsDir(botId), `${sessionId}.json`);
  return readJsonSafeSync(sessionFile, null);
}

function getLatestSession(botId) {
  ensureSessionsDir(botId);
  const sessionsDir = getSessionsDir(botId);
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) return null;

  const sorted = files
    .map(f => ({
      file: f,
      mtime: fs.statSync(path.join(sessionsDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const latestFile = sorted[0].file;
  const sessionId = path.basename(latestFile, '.json');
  return loadSession(botId, sessionId);
}

function listSessionsForBot(botId) {
  ensureSessionsDir(botId);
  const sessionsDir = getSessionsDir(botId);
  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

  const sessions = files.map(f => {
    const sessionId = path.basename(f, '.json');
    return loadSession(botId, sessionId);
  }).filter(Boolean);

  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return sessions;
}

function addMessageToSession(botId, sessionId, userMessage, botReply) {
  const session = loadSession(botId, sessionId);
  if (!session) return false;

  session.messages.push({
    user: userMessage,
    bot: botReply,
    timestamp: new Date().toISOString(),
  });

  _saveBotSession(botId, session);
  return true;
}

// ── Command-based sessions ──────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(os.homedir(), '.natureco', 'sessions');

function saveSession(commandName, messages, metadata = {}) {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  const id = Date.now().toString(36);
  const filename = path.join(SESSIONS_DIR, `${commandName}-${id}.json`);
  writeJsonAtomicSync(filename, {
    id, commandName, messages, metadata,
    savedAt: new Date().toISOString(),
  });
  return filename;
}

function loadLastSession(commandName) {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.startsWith(commandName + '-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (!files.length) return null;
  return JSON.parse(
    fs.readFileSync(path.join(SESSIONS_DIR, files[0]), 'utf8')
  );
}

function listSessions(commandName) {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => !commandName || f.startsWith(commandName + '-'))
    .map(f => {
      const data = JSON.parse(
        fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8')
      );
      return {
        id: data.id,
        commandName: data.commandName,
        savedAt: data.savedAt,
        messageCount: data.messages.length,
        preview: data.messages
          .find(m => m.role === 'user')?.content?.slice(0, 60)
      };
    })
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function deleteSession(id) {
  if (!fs.existsSync(SESSIONS_DIR)) return false;
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.includes(id));
  files.forEach(f => fs.unlinkSync(path.join(SESSIONS_DIR, f)));
  return files.length > 0;
}

module.exports = {
  createSession,
  loadSession,
  getLatestSession,
  listSessionsForBot,
  addMessageToSession,
  saveSession,
  loadLastSession,
  listSessions,
  deleteSession,
};
