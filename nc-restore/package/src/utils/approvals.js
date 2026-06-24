const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const chalk = require('chalk');
const inquirer = require('./inquirer-wrapper');
const { NatureCoError } = require('./errors');

const APPROVALS_FILE = path.join(os.homedir(), '.natureco', 'exec-approvals.json');
const APPROVALS_SOCKET_PATH = path.join(os.homedir(), '.natureco', 'exec-approvals.sock');
const DEFAULT_TIMEOUT_MS = 1800000; // 30 min

class ExecApprovalError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.command = options.command || null;
  }
}

// -- Data types --

/**
 * @typedef {'deny'|'allowlist'|'full'} ExecSecurity
 * @typedef {'off'|'on-miss'|'always'} ExecAsk
 * @typedef {'deny'|'allowlist'|'ask'|'auto'|'full'} ExecMode
 * @typedef {{ id?: string, pattern: string, argPattern?: string, source?: string, lastUsedAt?: string, lastUsedCommand?: string }} AllowlistEntry
 * @typedef {{ version: 1, defaults?: { security?: ExecSecurity, ask?: ExecAsk }, agents?: Record<string, { security?: ExecSecurity, ask?: ExecAsk, allowlist?: AllowlistEntry[] }> }} ApprovalsFile
 * @typedef {'allow-once'|'allow-always'|'deny'} ApprovalDecision
 */

function getApprovalsPath() {
  return APPROVALS_FILE;
}

function loadApprovals() {
  if (!fs.existsSync(APPROVALS_FILE)) {
    return { version: 1, defaults: { security: 'full', ask: 'off' }, agents: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8'));
  } catch {
    return { version: 1, defaults: { security: 'full', ask: 'off' }, agents: {} };
  }
}

function saveApprovals(data) {
  const dir = path.dirname(APPROVALS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function resolveEffectivePolicy(agentId) {
  const file = loadApprovals();
  const defaults = file.defaults || { security: 'full', ask: 'off' };
  if (!agentId || !file.agents?.[agentId]) {
    return { security: defaults.security || 'full', ask: defaults.ask || 'off', allowlist: [] };
  }
  const agent = file.agents[agentId];
  return {
    security: agent.security || defaults.security || 'full',
    ask: agent.ask || defaults.ask || 'off',
    allowlist: agent.allowlist || [],
  };
}

function resolveMode(security, ask) {
  if (security === 'deny') return 'deny';
  if (security === 'allowlist' && ask === 'always') return 'ask';
  if (security === 'allowlist') return 'allowlist';
  if (security === 'full') return 'full';
  return 'full';
}

function matchAllowlist(entries, command) {
  if (!entries || !command) return null;
  for (const entry of entries) {
    try {
      const pattern = new RegExp(entry.pattern, 'i');
      if (pattern.test(command)) {
        if (entry.argPattern) {
          const argRe = new RegExp(entry.argPattern, 'i');
          const args = command.split(/\s+/).slice(1).join(' ');
          if (!argRe.test(args)) continue;
        }
        return entry;
      }
    } catch {}
  }
  return null;
}

function requiresApproval({ command, agentId, security, ask }) {
  const policy = resolveEffectivePolicy(agentId);
  const mode = resolveMode(security || policy.security, ask || policy.ask);

  if (mode === 'deny') return { required: true, reason: 'deny' };
  if (mode === 'full') return { required: false, reason: 'full' };

  // Check allowlist
  const match = matchAllowlist(policy.allowlist, command);
  if (match) return { required: false, reason: 'allowlist', entry: match };

  if (mode === 'allowlist') return { required: true, reason: 'not-in-allowlist' };
  if (mode === 'ask') return { required: true, reason: 'ask' };

  return { required: true, reason: 'unknown' };
}

// Built-in safe commands that never need approval
const SAFE_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'echo', 'pwd', 'date', 'whoami',
  'node -e', 'node -v', 'npm -v', 'git status', 'git diff', 'git log',
]);

function isSafeCommand(command) {
  if (SAFE_COMMANDS.has(command.trim())) return true;
  for (const safe of SAFE_COMMANDS) {
    if (command.trim().startsWith(safe)) return true;
  }
  return false;
}

// Known dangerous patterns that should always warn
const DANGEROUS_PATTERNS = [
  /^rm\s+-rf\s+\/\s*$/,
  /^mkfs/,
  /^dd\s+if=.*\s+of=\/dev/,
  /^:\(\)\s*\{.*:\(\)\s*;\s*\};/,
  /^chmod\s+-R\s+777\s+\//,
  /^chown\s+-R/,
  /^>\/dev\/sda/,
  /^\|.*sh$/,
  /^curl.*\|.*sh$/,
  /^wget.*\|.*sh$/,
];

function isDangerousCommand(command) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command.trim())) return true;
  }
  return false;
}

async function requestUserApproval(command, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, agentId } = options;

  console.log('');
  console.log(chalk.yellow('  ⚠️  Command requires approval'));
  console.log(chalk.gray('  ─'.repeat(30)));
  console.log(chalk.white('  ') + command);
  console.log(chalk.gray('  ─'.repeat(30)));

  const choices = [
    { value: 'allow-once', name: 'Allow once' },
    { value: 'allow-always', name: 'Always allow this command' },
    { value: 'deny', name: 'Deny' },
  ];

  // Add edit option if command is dangerous
  if (options.isDangerous) {
    choices.push({ value: 'edit', name: 'Edit command' });
  }

  process.stdin.resume();
  const { decision } = await inquirer.prompt([{
    type: 'list',
    name: 'decision',
    message: 'What would you like to do?',
    choices,
  }]);

  if (decision === 'edit') {
    const { edited } = await inquirer.prompt([{
      type: 'input',
      name: 'edited',
      message: 'Edit command:',
      default: command,
    }]);
    return { decision: 'allow-once', command: edited };
  }

  if (decision === 'allow-always') {
    addAllowlistEntry(agentId, command);
  }

  return { decision, command };
}

function addAllowlistEntry(agentId, command) {
  const file = loadApprovals();
  if (!file.agents) file.agents = {};
  if (!file.agents[agentId]) file.agents[agentId] = { allowlist: [] };

  // Escape special regex chars in the command for pattern matching
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = {
    id: `auto-${Date.now()}`,
    pattern: `^${escaped}$`,
    source: 'allow-always',
    lastUsedAt: new Date().toISOString(),
    lastUsedCommand: command,
  };

  file.agents[agentId].allowlist.push(entry);
  saveApprovals(file);
}

function setSecurityPolicy(agentId, options = {}) {
  const file = loadApprovals();
  if (!file.agents) file.agents = {};
  if (!file.agents[agentId]) file.agents[agentId] = {};

  if (options.security) file.agents[agentId].security = options.security;
  if (options.ask !== undefined) file.agents[agentId].ask = options.ask;

  saveApprovals(file);
}

async function checkCommand(command, options = {}) {
  const { agentId = 'default' } = options;

  // Empty command
  if (!command || !command.trim()) {
    return { allowed: false, reason: 'empty' };
  }

  // Check if safe
  if (isSafeCommand(command)) {
    return { allowed: true, reason: 'safe-command' };
  }

  // Check if dangerous
  const dangerous = isDangerousCommand(command);
  const policy = resolveEffectivePolicy(agentId);
  const mode = resolveMode(policy.security, policy.ask);

  if (mode === 'deny') {
    return { allowed: false, reason: 'denied-by-policy', policy };
  }

  // Check allowlist
  const match = matchAllowlist(policy.allowlist, command);
  if (match) {
    return { allowed: true, reason: 'allowlist', entry: match };
  }

  if (mode === 'allowlist') {
    return { allowed: false, reason: 'not-in-allowlist', policy };
  }

  if (mode === 'ask') {
    const result = await requestUserApproval(command, { ...options, isDangerous: dangerous });
    return {
      allowed: result.decision === 'allow-once' || result.decision === 'allow-always',
      reason: result.decision,
      editedCommand: result.command,
    };
  }

  // Full mode - always allow
  return { allowed: true, reason: 'full-mode' };
}

function listAllowlist(agentId) {
  const policy = resolveEffectivePolicy(agentId);
  return policy.allowlist || [];
}

function removeAllowlistEntry(agentId, entryId) {
  const file = loadApprovals();
  if (!file.agents?.[agentId]?.allowlist) return false;
  const before = file.agents[agentId].allowlist.length;
  file.agents[agentId].allowlist = file.agents[agentId].allowlist.filter(e => e.id !== entryId);
  saveApprovals(file);
  return file.agents[agentId].allowlist.length < before;
}

module.exports = {
  ExecApprovalError,
  loadApprovals,
  saveApprovals,
  resolveEffectivePolicy,
  resolveMode,
  matchAllowlist,
  requiresApproval,
  isSafeCommand,
  isDangerousCommand,
  requestUserApproval,
  addAllowlistEntry,
  setSecurityPolicy,
  checkCommand,
  listAllowlist,
  removeAllowlistEntry,
  getApprovalsPath,
  DANGEROUS_PATTERNS,
  SAFE_COMMANDS,
};
