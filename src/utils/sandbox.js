/**
 * sandbox — Lightweight command execution sandbox
 *
 * Levels: none | basic | strict
 *
 * - none: no restrictions
 * - basic: timeout + cwd restriction
 * - strict: timeout + cwd + no-network + env cleanup
 */

const path = require('path');
const os = require('os');

const SANDBOX_LEVELS = { none: 0, basic: 1, strict: 2 };

function getLevel(cfg = {}) {
  const level = (cfg.sandbox || cfg.sandboxLevel || 'none').toLowerCase();
  return SANDBOX_LEVELS[level] !== undefined ? level : 'none';
}

function isPathAllowed(targetPath, cwd) {
  if (!targetPath) return true;
  const abs = path.resolve(targetPath);
  // Always allow /tmp and project directory
  if (abs.startsWith('/tmp/') || abs.startsWith('/private/tmp/')) return true;
  if (cwd && abs.startsWith(path.resolve(cwd))) return true;
  return false;
}

function isNetworkCommand(cmd) {
  const networkPatterns = [
    'curl ', 'wget ', 'nc ', 'ncat ', 'ssh ', 'scp ', 'rsync',
    'pip install', 'npm install', 'yarn add', 'pnpm add',
    'apt-get', 'apt ', 'yum ', 'dnf ', 'brew install',
    'git clone', 'git fetch', 'git pull',
    'docker pull', 'docker run',
  ];
  const lower = cmd.toLowerCase();
  return networkPatterns.some(p => lower.includes(p));
}

function getSandboxEnv(level) {
  if (level === 'strict') {
    return {
      PATH: process.env.PATH || '',
      HOME: os.homedir(),
      TMPDIR: os.tmpdir(),
      NODE_ENV: 'development',
    };
  }
  return undefined; // Use parent env
}

function getTimeout(level, defaultTimeout = 30000) {
  if (level === 'strict') return 10000;
  if (level === 'basic') return defaultTimeout;
  return 0; // no timeout
}

module.exports = { getLevel, isPathAllowed, isNetworkCommand, getSandboxEnv, getTimeout, SANDBOX_LEVELS };
