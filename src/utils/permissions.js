/**
 * permissions — Granular tool-level allow/deny rules (Claude Code style)
 *
 * Config format (~/.natureco/config.json or .natureco/config.json):
 *   "permissions": {
 *     "Read(~/.ssh/**)": { "action": "deny", "reason": "SSH keys are sensitive" },
 *     "Read(~/.aws/**)": "deny",
 *     "Edit(.env*)": { "action": "ask", "reason": "Review env changes" },
 *     "Bash(npm *)": "ask",
 *     "Bash(rm *rf *)": "deny"
 *   }
 *
 * Resolution order (first match wins):
 *   1. Config permissions (deny > ask > allow)
 *   2. Built-in high-risk patterns (assessRisk in code_v5)
 *   3. Default: allow
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { matchGlob, flattenArgs } = require('./tool-hooks');

function loadPermissionRules() {
  const rules = [];
  const sources = [
    path.join(os.homedir(), '.natureco', 'config.json'),
    path.join(process.cwd(), '.natureco', 'config.json'),
  ];
  for (const cfgPath of sources) {
    try {
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg.permissions) {
          for (const [pattern, value] of Object.entries(cfg.permissions)) {
            const parsed = parsePermissionRule(pattern, value);
            if (parsed) rules.push(parsed);
          }
        }
      }
    } catch {}
  }
  return rules;
}

function parsePermissionRule(pattern, value) {
  const match = pattern.match(/^(\*|[a-zA-Z_]+)\((.+)\)$/);
  if (!match && pattern !== '*') return null;
  const toolName = match ? match[1] : '*';
  const glob = match ? match[2] : '*';

  let action, reason;
  if (typeof value === 'string') {
    action = value;
  } else if (value && typeof value === 'object') {
    action = value.action || 'ask';
    reason = value.reason;
  }
  if (!['allow', 'deny', 'ask'].includes(action)) action = 'ask';

  return { toolName, glob, action, reason, raw: pattern };
}

/**
 * Check permissions for a tool call.
 * Returns { action: 'allow'|'deny'|'ask', reason, rule }
 */
function checkPermission(toolName, args) {
  const rules = loadPermissionRules();
  const flat = flattenArgs(args);

  for (const rule of rules) {
    if (rule.toolName !== '*' && rule.toolName !== toolName) continue;
    const matchesGlob = rule.glob === '*' || matchGlob(flat, rule.glob) || matchGlob(toolName, rule.glob);
    if (!matchesGlob) continue;
    if (rule.action === 'deny') {
      return { action: 'deny', reason: rule.reason || `Engellendi: ${rule.raw}`, rule };
    }
    if (rule.action === 'ask') {
      return { action: 'ask', reason: rule.reason || `Onay gerekli: ${rule.raw}`, rule };
    }
    if (rule.action === 'allow') {
      return { action: 'allow', reason: '', rule };
    }
  }

  return { action: 'allow', reason: '', rule: null };
}

/**
 * Persistent permission approvals (session + disk cache).
 */
const _permSessionCache = new Map();

function loadPersistentApprovals() {
  try {
    const f = path.join(os.homedir(), '.natureco', 'perm-approvals.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  return {};
}

function savePersistentApproval(key) {
  try {
    const f = path.join(os.homedir(), '.natureco', 'perm-approvals.json');
    const data = loadPersistentApprovals();
    data[key] = { approved: true, at: Date.now() };
    const dir = path.dirname(f);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}

function isApproved(key) {
  if (_permSessionCache.get(key) === true) return true;
  const persistent = loadPersistentApprovals();
  if (persistent[key]?.approved) {
    _permSessionCache.set(key, true);
    return true;
  }
  return false;
}

function markApproved(key, persistent = false) {
  _permSessionCache.set(key, true);
  if (persistent) savePersistentApproval(key);
}

/**
 * Format a tool call for permission display.
 */
function formatPermissionPrompt(toolName, args, reason) {
  const parts = Object.entries(args || {}).map(([k, v]) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  });
  return `${toolName}(${parts.join(', ')})`;
}

module.exports = {
  checkPermission,
  loadPermissionRules,
  isApproved,
  markApproved,
  formatPermissionPrompt,
};
