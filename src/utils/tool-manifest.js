'use strict';

const fs = require('fs');
const path = require('path');

let cache = null;

function loadToolManifest({ toolsDir = path.join(__dirname, '..', 'tools'), refresh = false } = {}) {
  if (cache && !refresh) return cache;
  const entries = new Map();
  if (!fs.existsSync(toolsDir)) return entries;
  for (const file of fs.readdirSync(toolsDir).filter(name => name.endsWith('.js')).sort()) {
    try {
      const mod = require(path.join(toolsDir, file));
      const name = mod.name || path.basename(file, '.js');
      const execute = mod.execute || mod.default?.execute;
      if (!name || typeof execute !== 'function') continue;
      entries.set(name, {
        name, description: mod.description || `${name} tool`,
        inputSchema: mod.inputSchema || mod.parameters || { type: 'object', properties: {} },
        execute, module: mod, source: file,
      });
    } catch { /* unavailable optional tool */ }
  }
  cache = entries;
  return entries;
}

function clearToolManifestCache() { cache = null; }

module.exports = { loadToolManifest, clearToolManifestCache };
