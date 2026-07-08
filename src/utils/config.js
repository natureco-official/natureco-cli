const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ConfigParseError, ConfigMutationConflictError, ConfigValidationError, handleError } = require('./errors');

let json5;
try {
  json5 = require('json5');
} catch {
  json5 = null;
}

const CONFIG_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CONFIG_BACKUP_DIR = path.join(CONFIG_DIR, 'backups');
const MAX_BACKUPS = 10;

let _configCache = null;
let _configHash = null;

function getProfileDir() {
  const profileArg = process.argv.find(a => a.startsWith('--profile='));
  const profileIdx = process.argv.indexOf('--profile');
  const profile = profileArg
    ? (profileArg.split('=')[1] || 'default')
    : (profileIdx !== -1 ? (process.argv[profileIdx + 1] || 'default') : null);
  if (profile && profile !== 'default') {
    return path.join(os.homedir(), `.natureco-${profile}`);
  }
  return CONFIG_DIR;
}

const ACTIVE_CONFIG_DIR = getProfileDir();
const ACTIVE_CONFIG_FILE = path.join(ACTIVE_CONFIG_DIR, 'config.json');

// v5.43 GÜVENLİK: config.json API anahtarları tutar; dizin/dosya dünya-okunabilir
// (0755/0644) olmamalı — ssh anahtarları gibi 0700/0600. chmod fallback eski kurulumlar için.
function ensureConfigDir() {
  if (!fs.existsSync(ACTIVE_CONFIG_DIR)) {
    fs.mkdirSync(ACTIVE_CONFIG_DIR, { recursive: true, mode: 0o700 });
  } else {
    try { fs.chmodSync(ACTIVE_CONFIG_DIR, 0o700); } catch { /* best-effort */ }
  }
}

function computeHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function createBackup() {
  if (!fs.existsSync(ACTIVE_CONFIG_FILE)) return;
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_BACKUP_DIR)) {
    fs.mkdirSync(CONFIG_BACKUP_DIR, { recursive: true, mode: 0o700 });
  } else {
    try { fs.chmodSync(CONFIG_BACKUP_DIR, 0o700); } catch { /* best-effort */ }
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(CONFIG_BACKUP_DIR, `config-${timestamp}.json`);
  fs.copyFileSync(ACTIVE_CONFIG_FILE, backupFile);
  // Yedek de API anahtarları içerir → 0600.
  try { fs.chmodSync(backupFile, 0o600); } catch { /* best-effort */ }
  const backups = fs.readdirSync(CONFIG_BACKUP_DIR)
    .filter(f => f.startsWith('config-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (backups.length > MAX_BACKUPS) {
    backups.slice(MAX_BACKUPS).forEach(f => {
      try { fs.unlinkSync(path.join(CONFIG_BACKUP_DIR, f)); } catch {}
    });
  }
}

function parseConfigContent(content) {
  if (!content || !content.trim()) return {};
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    if (json5) {
      try { return json5.parse(trimmed); } catch {}
    }
    return JSON.parse(trimmed);
  }
  return JSON.parse(trimmed);
}

function validateConfig(data) {
  if (data === null || data === undefined) throw new ConfigValidationError('Config cannot be null', { field: 'root' });
  if (typeof data !== 'object' || Array.isArray(data)) throw new ConfigValidationError('Config must be a JSON object', { field: 'root' });
  if (data.apiKey !== undefined && typeof data.apiKey !== 'string') throw new ConfigValidationError('apiKey must be a string', { field: 'apiKey' });
  if (data.providerUrl !== undefined && typeof data.providerUrl !== 'string') throw new ConfigValidationError('providerUrl must be a string', { field: 'providerUrl' });
  if (data.providerModel !== undefined && typeof data.providerModel !== 'string') throw new ConfigValidationError('providerModel must be a string', { field: 'providerModel' });
  return true;
}

function saveConfig(data, options = {}) {
  const { skipBackup = false, skipValidation = false } = options;
  ensureConfigDir();
  if (!skipValidation) validateConfig(data);
  if (!skipBackup) createBackup();
  const content = JSON.stringify(data, null, 2);
  fs.writeFileSync(ACTIVE_CONFIG_FILE, content, { encoding: 'utf8', mode: 0o600 });
  // mode yalnızca dosya YENİ oluşturulunca uygulanır; mevcut dosya için chmod şart.
  try { fs.chmodSync(ACTIVE_CONFIG_FILE, 0o600); } catch { /* best-effort */ }
  _configCache = data;
  _configHash = computeHash(data);
}

function loadConfig(options = {}) {
  const { useCache = true, skipValidation = false } = options;
  if (useCache && _configCache) return _configCache;
  if (!fs.existsSync(ACTIVE_CONFIG_FILE)) {
    _configCache = null;
    _configHash = null;
    return null;
  }
  try {
    const content = fs.readFileSync(ACTIVE_CONFIG_FILE, 'utf8');
    const data = parseConfigContent(content);
    if (!skipValidation) validateConfig(data);
    _configCache = data;
    _configHash = computeHash(data);
    return data;
  } catch (err) {
    _configCache = null;
    _configHash = null;
    if (err instanceof ConfigValidationError || err instanceof ConfigParseError) throw err;
    return null;
  }
}

function loadConfigWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return loadConfig({ useCache: false });
    } catch (err) {
      if (i === maxRetries - 1) throw err;
    }
  }
  return null;
}

function deleteConfig() {
  if (fs.existsSync(ACTIVE_CONFIG_FILE)) {
    createBackup();
    fs.unlinkSync(ACTIVE_CONFIG_FILE);
  }
  _configCache = null;
  _configHash = null;
}

function getApiKey() {
  const config = loadConfig();
  return config?.apiKey ?? null;
}

function saveApiKey(apiKey) {
  const config = loadConfig() ?? {};
  config.apiKey = apiKey;
  saveConfig(config);
}

function getConfig() {
  try {
    return loadConfig() ?? {};
  } catch {
    return {};
  }
}

function getAllConfig() {
  try {
    return loadConfig() ?? {};
  } catch {
    return {};
  }
}

function setConfigValue(key, value) {
  const config = loadConfig() ?? {};
  const keys = key.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  saveConfig(config);
}

function getConfigHash() {
  return _configHash;
}

function listBackups() {
  if (!fs.existsSync(CONFIG_BACKUP_DIR)) return [];
  return fs.readdirSync(CONFIG_BACKUP_DIR)
    .filter(f => f.startsWith('config-') && f.endsWith('.json'))
    .sort()
    .reverse();
}

function restoreConfig(backupFile) {
  const backupPath = path.isAbsolute(backupFile)
    ? backupFile
    : path.join(CONFIG_BACKUP_DIR, backupFile);
  if (!fs.existsSync(backupPath)) {
    throw new ConfigValidationError(`Yedek dosyası bulunamadı: ${backupPath}`, { field: 'backupFile' });
  }
  const content = fs.readFileSync(backupPath, 'utf8');
  const data = parseConfigContent(content);
  validateConfig(data);
  createBackup();
  fs.writeFileSync(ACTIVE_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  _configCache = data;
  _configHash = computeHash(data);
  return { path: backupPath, timestamp: path.basename(backupPath).replace(/^config-|\.json$/g, '') };
}

module.exports = {
  saveConfig,
  loadConfig,
  loadConfigWithRetry,
  deleteConfig,
  getApiKey,
  saveApiKey,
  getConfig,
  getAllConfig,
  setConfigValue,
  getConfigHash,
  listBackups,
  restoreConfig,
  CONFIG_FILE: ACTIVE_CONFIG_FILE,
  CONFIG_DIR: ACTIVE_CONFIG_DIR,
  CONFIG_BACKUP_DIR,
};
