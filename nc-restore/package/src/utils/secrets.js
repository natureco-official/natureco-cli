const fs = require('fs');
const path = require('path');
const os = require('os');
const { NatureCoError } = require('./errors');

const ENV_SHORTHAND_RE = /^\$\{([A-Z][A-Z0-9_]{0,127})\}$/;
const ENV_SHORT_RE = /^\$([A-Z][A-Z0-9_]{0,127})$/;
const SECRET_REF_ENV_PREFIX = 'secretref-env:';
const SECRET_REF_ENV_LEGACY = '__env__:';

class UnresolvedSecretError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.ref = options.ref || null;
    this.path = options.path || null;
  }
}

// Cache for resolved secrets
const _secretCache = new Map();

function resolveEnvVar(name) {
  return process.env[name] ?? null;
}

function coerceSecretRef(value) {
  if (!value || typeof value !== 'string') return null;

  // Structured ref: {"source":"env","provider":"default","id":"MY_KEY"}
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && parsed.source && parsed.provider && parsed.id) {
      return { source: parsed.source, provider: parsed.provider, id: parsed.id };
    }
  } catch {}

  // Env shorthand: ${MY_KEY} or $MY_KEY
  let m = value.match(ENV_SHORTHAND_RE);
  if (m) return { source: 'env', provider: 'default', id: m[1] };
  m = value.match(ENV_SHORT_RE);
  if (m) return { source: 'env', provider: 'default', id: m[1] };

  // Legacy: secretref-env:MY_KEY or __env__:MY_KEY
  if (value.startsWith(SECRET_REF_ENV_PREFIX)) {
    return { source: 'env', provider: 'default', id: value.slice(SECRET_REF_ENV_PREFIX.length) };
  }
  if (value.startsWith(SECRET_REF_ENV_LEGACY)) {
    return { source: 'env', provider: 'default', id: value.slice(SECRET_REF_ENV_LEGACY.length) };
  }

  return null;
}

function resolveSecretRef(ref, options = {}) {
  const { cache = true, throwOnMissing = false } = options;
  const cacheKey = `${ref.source}:${ref.provider}:${ref.id}`;

  if (cache && _secretCache.has(cacheKey)) {
    return _secretCache.get(cacheKey);
  }

  let resolved = null;

  if (ref.source === 'env') {
    resolved = resolveEnvVar(ref.id);
  } else if (ref.source === 'file') {
    try {
      const content = fs.readFileSync(ref.id, 'utf8').trim();
      resolved = content;
    } catch {}
  }

  if (resolved === null && throwOnMissing) {
    throw new UnresolvedSecretError(
      `Secret not found: ${cacheKey}`,
      { ref, path: cacheKey }
    );
  }

  if (cache && resolved !== null) {
    _secretCache.set(cacheKey, resolved);
  }

  return resolved;
}

function resolveSecretValue(value, options = {}) {
  if (!value || typeof value !== 'string') return value;

  const ref = coerceSecretRef(value);
  if (ref) {
    const resolved = resolveSecretRef(ref, options);
    return resolved ?? value;
  }

  return value;
}

function resolveConfigSecrets(config, options = {}) {
  if (!config || typeof config !== 'object') return config;

  const resolved = Array.isArray(config) ? [] : {};
  for (const [key, value] of Object.entries(config)) {
    if (value && typeof value === 'object') {
      resolved[key] = resolveConfigSecrets(value, options);
    } else if (typeof value === 'string') {
      resolved[key] = resolveSecretValue(value, options);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function loadEnvFile(filePath) {
  const envPath = filePath || path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};

  const env = {};
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) env[key] = val;
  }
  return env;
}

function injectEnvFile(envPath) {
  const env = loadEnvFile(envPath);
  for (const [key, val] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
  return env;
}

function clearSecretCache() {
  _secretCache.clear();
}

function listSecretRefs(config, prefix = '') {
  const refs = [];
  if (!config || typeof config !== 'object') return refs;

  for (const [key, value] of Object.entries(config)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      refs.push(...listSecretRefs(value, fullPath));
    } else if (typeof value === 'string') {
      const ref = coerceSecretRef(value);
      if (ref) {
        refs.push({ path: fullPath, ref, value });
      }
    }
  }
  return refs;
}

module.exports = {
  UnresolvedSecretError,
  coerceSecretRef,
  resolveSecretRef,
  resolveSecretValue,
  resolveConfigSecrets,
  loadEnvFile,
  injectEnvFile,
  clearSecretCache,
  listSecretRefs,
};
