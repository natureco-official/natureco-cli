/**
 * tool-hooks — Pattern-based pre/post tool execution hooks (Claude Code style)
 *
 * Hooks defined in config under `toolHooks` key:
 *   pre:  { "ToolName(pattern)": "allow" | "deny" | "ask" }
 *   post: { "ToolName(pattern)": "notify" | "record" }
 *
 * Pattern syntax:
 *   Bash(git *)        — Bash tool, args start with "git"
 *   Read(src/**)       — Read tool, path starts with "src/"
 *   Write(.env*)       — Write tool, path starts with ".env"
 *   Edit(*)            — Edit tool, any path
 *   *                  — All tools
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function loadRules() {
  const rules = { pre: [], post: [] };
  try {
    const cfgPath = path.join(os.homedir(), '.natureco', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.toolHooks) {
        if (cfg.toolHooks.pre) {
          for (const [pattern, action] of Object.entries(cfg.toolHooks.pre)) {
            rules.pre.push(parseRule(pattern, action));
          }
        }
        if (cfg.toolHooks.post) {
          for (const [pattern, action] of Object.entries(cfg.toolHooks.post)) {
            rules.post.push(parseRule(pattern, action));
          }
        }
      }
    }
  } catch {}
  // Check project-level hooks.json
  try {
    const projectCfg = path.join(process.cwd(), '.natureco', 'hooks.json');
    if (fs.existsSync(projectCfg)) {
      const pCfg = JSON.parse(fs.readFileSync(projectCfg, 'utf8'));
      if (pCfg.pre) {
        for (const [pattern, action] of Object.entries(pCfg.pre)) {
          rules.pre.push(parseRule(pattern, action));
        }
      }
      if (pCfg.post) {
        for (const [pattern, action] of Object.entries(pCfg.post)) {
          rules.post.push(parseRule(pattern, action));
        }
      }
    }
  } catch {}
  return rules;
}

function parseRule(pattern, action) {
  // Pattern: ToolName(glob) or * for all
  const match = pattern.match(/^(\*|[a-zA-Z_]+)\((.+)\)$/);
  let toolName = '*';
  let glob = '*';
  if (match) {
    toolName = match[1];
    glob = match[2];
  } else if (pattern !== '*') {
    toolName = pattern;
  }
  return { toolName, glob, action, raw: pattern };
}

function matchGlob(str, glob) {
  if (glob === '*') return true;
  // Both * and ** match .* since we're matching flat arg strings, not file paths
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$').test(str);
}

function flattenArgs(args) {
  if (typeof args === 'string') return args;
  if (args === null || args === undefined) return '';
  const parts = [];
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) parts.push(...v.filter(x => typeof x === 'string'));
    else if (typeof v === 'object' && v !== null) parts.push(JSON.stringify(v));
  }
  return parts.join(' ');
}

function matchRule(rule, toolName, args) {
  if (rule.toolName !== '*' && rule.toolName !== toolName) return false;
  // Try matching against flattened args first, then tool name
  const flat = flattenArgs(args);
  return matchGlob(flat, rule.glob) || matchGlob(toolName, rule.glob);
}

/**
 * Check pre-hooks before tool execution.
 * Returns { action: 'allow'|'deny'|'ask', rule, reason }
 */
function checkPreHooks(toolName, args) {
  const rules = loadRules();
  for (const rule of rules.pre) {
    if (matchRule(rule, toolName, args)) {
      if (rule.action === 'deny') {
        return { action: 'deny', rule, reason: `Hook engelledi: ${rule.raw}` };
      }
      if (rule.action === 'ask') {
        return { action: 'ask', rule, reason: `Hook onay gerektiriyor: ${rule.raw}` };
      }
      if (rule.action === 'allow') {
        return { action: 'allow', rule, reason: '' };
      }
    }
  }
  return { action: 'allow', rule: null, reason: '' };
}

/**
 * Run post-hooks after tool execution.
 * Returns enriched result or original.
 */
function runPostHooks(toolName, args, result) {
  const rules = loadRules();
  for (const rule of rules.post) {
    if (matchRule(rule, toolName, args)) {
      try {
        const hook = require(path.join(os.homedir(), '.natureco', 'hooks', rule.action));
        if (typeof hook === 'function') {
          return hook({ toolName, args, result }) || result;
        }
      } catch {}
    }
  }
  return result;
}

/**
 * Convert args to string for CLI permission display.
 */
function permissionSummary(rule, toolName, args) {
  const argsStr = Object.entries(args || {})
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(', ');
  return `${toolName}(${argsStr}) — ${rule.raw}`;
}

module.exports = { checkPreHooks, runPostHooks, loadRules, matchGlob, matchRule, permissionSummary, flattenArgs };
