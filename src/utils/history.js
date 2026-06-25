const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');
const { writeJsonAtomicSync, readJsonSafeSync } = require('./atomic-file');

const HISTORY_DIR = path.join(CONFIG_DIR, 'history');

// Ensure history directory exists
function ensureHistoryDir() {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

// Get history file path for a bot
function getHistoryFilePath(botId) {
  ensureHistoryDir();
  return path.join(HISTORY_DIR, `${botId}.json`);
}

// Load conversation history for a bot
function loadHistory(botId) {
  const filePath = getHistoryFilePath(botId);
  const data = readJsonSafeSync(filePath, []);
  // Normalize: older versions may have saved non-array; defensive cast.
  return Array.isArray(data) ? data : [];
}

// Save conversation history for a bot
function saveHistory(botId, history) {
  const filePath = getHistoryFilePath(botId);
  try {
    writeJsonAtomicSync(filePath, history);
  } catch {
    // Silently fail - history is not critical
  }
}

// Add message to history
function addToHistory(botId, userMessage, botReply, conversationId = null) {
  const history = loadHistory(botId);
  
  history.push({
    timestamp: new Date().toISOString(),
    user: userMessage,
    bot: botReply,
    conversationId,
  });

  // Keep only last 100 messages
  if (history.length > 100) {
    history.shift();
  }

  saveHistory(botId, history);
}

// Get command history (only user messages)
function getCommandHistory(botId) {
  const history = loadHistory(botId);
  return history.map(h => h.user);
}

// Clear history for a bot
function clearHistory(botId) {
  const filePath = getHistoryFilePath(botId);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Get full history (for ultrareview)
function getHistory(botId) {
  return loadHistory(botId);
}

module.exports = {
  loadHistory,
  saveHistory,
  addToHistory,
  getCommandHistory,
  clearHistory,
  getHistory,
};
