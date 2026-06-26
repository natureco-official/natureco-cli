/**
 * Threat Patterns — Shared prompt injection / exfiltration detection
 *
 * Port of Hermes tools/threat_patterns.py
 * Organized by ATTACK CLASS, not by source file.
 *
 * Scope:
 *   - "all"     — applied everywhere (classic injection, exfiltration)
 *   - "context" — applied to context files + memory + tool results
 *   - "strict"  — applied to memory writes + skill installs only
 *
 * Invisible / bidirectional unicode used in injection attacks
 */
const INVISIBLE_CHARS = new Set([
  '\u200b',  '\u200c',  '\u200d',  '\u2060',
  '\u2062',  '\u2063',  '\u2064',  '\ufeff',
  '\u202a',  '\u202b',  '\u202c',  '\u202d',
  '\u202e',  '\u2066',  '\u2067',  '\u2068',  '\u2069',
]);

// Each entry: [regex, patternId, scope]
const PATTERNS = [
  // ── Classic prompt injection ───────────────────────────
  [/ignore\s+(?:\w+\s+)*(previous|all|above|prior)\s+(?:\w+\s+)*instructions/i, 'prompt_injection', 'all'],
  [/system\s+prompt\s+override/i, 'sys_prompt_override', 'all'],
  [/disregard\s+(?:\w+\s+)*(your|all|any)\s+(?:\w+\s+)*(instructions|rules|guidelines)/i, 'disregard_rules', 'all'],
  [/act\s+as\s+(if|though)\s+(?:\w+\s+)*you\s+(?:\w+\s+)*(have\s+no|don't\s+have)\s+(?:\w+\s+)*(restrictions|limits|rules)/i, 'bypass_restrictions', 'all'],
  [/<!--[^>]*(?:ignore|override|system|secret|hidden)[^>]*-->/i, 'html_comment_injection', 'all'],
  [/<\s*div\s+style\s*=\s*["'][\s\S]*?display\s*:\s*none/i, 'hidden_div', 'all'],
  [/translate\s+.*\s+into\s+.*\s+and\s+(execute|run|eval)/i, 'translate_execute', 'all'],
  [/do\s+not\s+(?:\w+\s+)*tell\s+(?:\w+\s+)*the\s+user/i, 'deception_hide', 'all'],

  // ── Role-play / identity hijack ─────────────────────────
  [/you\s+are\s+(?:\w+\s+)*now\s+(?:a|an|the)\s+/i, 'role_hijack', 'context'],
  [/pretend\s+(?:\w+\s+)*(you\s+are|to\s+be)\s+/i, 'role_pretend', 'context'],
  [/output\s+(?:\w+\s+)*(system|initial)\s+prompt/i, 'leak_system_prompt', 'context'],
  [/(respond|answer|reply)\s+without\s+(?:\w+\s+)*(restrictions|limitations|filters|safety)/i, 'remove_filters', 'context'],
  [/you\s+have\s+been\s+(?:\w+\s+)*(updated|upgraded|patched)\s+to/i, 'fake_update', 'context'],
  [/\bname\s+yourself\s+\w+/i, 'identity_override', 'context'],

  // ── C2 / promptware ──────────────────────────────────
  [/register\s+(as\s+)?a?\s*node/i, 'c2_node_registration', 'context'],
  [/(heartbeat|beacon|check[\s-]?in)\s+(to|with)\s+/i, 'c2_heartbeat', 'context'],
  [/pull\s+(down\s+)?(?:new\s+)?task(?:ing|s)?\b/i, 'c2_task_pull', 'context'],
  [/connect\s+to\s+the\s+network\b/i, 'c2_network_connect', 'context'],
  [/you\s+must\s+(?:\w+\s+){0,3}(register|connect|report|beacon)\b/i, 'forced_action', 'context'],
  [/only\s+use\s+one[\s-]?liners?\b/i, 'anti_forensic_oneliner', 'context'],
  [/never\s+(?:\w+\s+)*(?:create|write)\s+(?:\w+\s+)*(?:script|file)\s+(?:\w+\s+)*disk/i, 'anti_forensic_disk', 'context'],
  [/unset\s+\w*(?:CLAUDE|CODEX|HERMES|AGENT|OPENAI|ANTHROPIC)\w*/i, 'env_var_unset_agent', 'context'],
  [/\b(?:cobalt\s*strike|sliver|havoc|mythic|metasploit|brainworm)\b/i, 'known_c2_framework', 'context'],

  // ── Exfiltration ──────────────────────────────────────
  [/curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, 'exfil_curl', 'all'],
  [/wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, 'exfil_wget', 'all'],
  [/cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i, 'read_secrets', 'all'],
  [/(send|post|upload|transmit)\s+.*\s+(to|at)\s+https?:\/\//i, 'send_to_url', 'strict'],
  [/(include|output|print|share)\s+(?:\w+\s+)*(conversation|chat\s+history|previous\s+messages|full\s+context|entire\s+context)/i, 'context_exfil', 'strict'],

  // ── Persistence / backdoor ────────────────────────────
  [/authorized_keys/i, 'ssh_backdoor', 'strict'],
  [/\$HOME[/\\]\.ssh|\~[/\\]\.ssh/i, 'ssh_access', 'strict'],
  [/\$HOME[/\\]\.hermes[/\\.]env|\~[/\\]\.hermes[/\\]\.env/i, 'hermes_env', 'strict'],
  [/(update|modify|edit|write|change|append|add\s+to)\s+.*(?:AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules)/i, 'agent_config_mod', 'strict'],
  [/(update|modify|edit|write|change|append|add\s+to)\s+.*\.hermes[/\\](config\.yaml|SOUL\.md)/i, 'hermes_config_mod', 'strict'],

  // ── Hardcoded secrets ─────────────────────────────────
  [/(?:api[_-]?key|token|secret|password)\s*[=:]\s*["\'][A-Za-z0-9+/=_-]{20,}/, 'hardcoded_secret', 'strict'],
];

/**
 * Scan content for injection patterns within a given scope.
 * Returns array of pattern IDs that matched, or empty array if clean.
 */
function scanForThreats(content, scope = 'all') {
  if (!content || typeof content !== 'string') return [];

  // Scan for invisible unicode characters
  const invisibleFound = [];
  for (const ch of content) {
    if (INVISIBLE_CHARS.has(ch) && !invisibleFound.includes(ch)) {
      invisibleFound.push(ch);
    }
  }

  const findings = [];

  for (const [regex, patternId, patternScope] of PATTERNS) {
    // Check if this pattern applies to the requested scope
    if (patternScope === scope || patternScope === 'all') {
      if (regex.test(content)) {
        findings.push(patternId);
      }
    }
  }

  // Check scope for invisible chars
  if (scope === 'strict' && invisibleFound.length > 0) {
    findings.push('invisible_unicode');
  }

  return findings;
}

module.exports = { scanForThreats, INVISIBLE_CHARS };
