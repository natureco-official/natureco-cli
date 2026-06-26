/**
 * Tool Guardrails — Hermes-style ToolCallGuardrailController
 *
 * Port of agent/tool_guardrails.py
 *
 * Two-tier: warnings (soft, allows execution) and blocks (hard stop).
 * Idempotent tools tracked by result hash to detect no-progress loops.
 */

const crypto = require('crypto');

const IDEMPOTENT_TOOLS = new Set([
  'read_file', 'file_search', 'grep_search',
  'web_search', 'web_readability', 'duckduckgo_search',
  'exa_search', 'searxng_search', 'firecrawl',
  'memory_search', 'memory', 'list_dir',
  'browser', // browser snapshots are idempotent
]);

const MUTATING_TOOLS = new Set([
  'bash', 'shell_command', 'write_file', 'edit_file',
  'browser', 'memory', 'skill_manage', 'git',
  'delegate_task', 'llm_task', 'cron_create',
  'calendar_add', 'reminder_add', 'canvas',
  'image_generation', 'video_generation', 'music_generation',
  'text_to_speech', 'speech_to_text',
  'mac_alarm', 'mac_app_open', 'mac_app_quit', 'mac_notify',
  'phone_control', 'todo_write', 'plan',
  'notes_add', 'notebook_edit', 'plugin',
  'soul',
]);

class ToolGuardrails {
  constructor(opts = {}) {
    this.warningsEnabled = opts.warningsEnabled !== false;
    this.hardStopEnabled = opts.hardStopEnabled || false;
    this.exactFailureWarnAfter = opts.exactFailureWarnAfter || 2;
    this.exactFailureBlockAfter = opts.exactFailureBlockAfter || 5;
    this.sameToolFailureWarnAfter = opts.sameToolFailureWarnAfter || 3;
    this.sameToolFailureHaltAfter = opts.sameToolFailureHaltAfter || 8;
    this.noProgressWarnAfter = opts.noProgressWarnAfter || 2;
    this.noProgressBlockAfter = opts.noProgressBlockAfter || 5;
    this.reset();
  }

  reset() {
    this._exactFailureCounts = new Map();  // argsHash -> count
    this._sameToolFailureCounts = new Map(); // toolName -> count
    this._noProgress = new Map();           // argsHash -> { resultHash, count }
    this._haltDecision = null;
    this.iteration = 0;
  }

  startIteration() {
    this.iteration++;
  }

  get haltDecision() {
    return this._haltDecision;
  }

  /**
   * Before-call check — returns { action, code, message, allowsExecution, shouldHalt }
   */
  beforeCall(toolName, toolArgs) {
    const argsKey = this._argsKey(toolArgs);
    const sig = this._signature(toolName, toolArgs);

    if (!this.hardStopEnabled) {
      return { action: 'allow', code: 'allow', message: '', allowsExecution: true, shouldHalt: false, signature: sig };
    }

    // 1. Exact failure threshold
    const exactCount = this._exactFailureCounts.get(sig) || 0;
    if (exactCount >= this.exactFailureBlockAfter) {
      const decision = {
        action: 'block', code: 'repeated_exact_failure_block',
        message: `Blocked ${toolName}: the same tool call failed ${exactCount} times with identical arguments. Stop retrying it unchanged; change strategy or explain the blocker.`,
        toolName, count: exactCount, signature: sig,
        allowsExecution: false, shouldHalt: true,
      };
      this._haltDecision = decision;
      return decision;
    }

    // 2. Idempotent no-progress
    if (this._isIdempotent(toolName)) {
      const record = this._noProgress.get(sig);
      if (record && record.count >= this.noProgressBlockAfter) {
        const decision = {
          action: 'block', code: 'idempotent_no_progress_block',
          message: `Blocked ${toolName}: this read-only call returned the same result ${record.count} times. Stop repeating it unchanged; use the result already provided or try a different query.`,
          toolName, count: record.count, signature: sig,
          allowsExecution: false, shouldHalt: true,
        };
        this._haltDecision = decision;
        return decision;
      }
    }

    return { action: 'allow', code: 'allow', message: '', allowsExecution: true, shouldHalt: false, signature: sig };
  }

  /**
   * After-call recording — detects failures and no-progress patterns.
   * Returns a decision (warn or allow).
   */
  afterCall(toolName, toolArgs, result, { failed } = {}) {
    const sig = this._signature(toolName, toolArgs);

    if (failed) {
      // Track exact (same args) failures
      const exactCount = (this._exactFailureCounts.get(sig) || 0) + 1;
      this._exactFailureCounts.set(sig, exactCount);
      this._noProgress.delete(sig);

      // Track same-tool (any args) failures
      const sameCount = (this._sameToolFailureCounts.get(toolName) || 0) + 1;
      this._sameToolFailureCounts.set(toolName, sameCount);

      // Hard stop: same-tool threshold
      if (this.hardStopEnabled && sameCount >= this.sameToolFailureHaltAfter) {
        const decision = {
          action: 'halt', code: 'same_tool_failure_halt',
          message: `Stopped ${toolName}: it failed ${sameCount} times this turn. Stop retrying the same failing tool path and choose a different approach.`,
          toolName, count: sameCount, signature: sig,
          allowsExecution: false, shouldHalt: true,
        };
        this._haltDecision = decision;
        return decision;
      }

      // Warning: exact failure
      if (this.warningsEnabled && exactCount >= this.exactFailureWarnAfter) {
        return {
          action: 'warn', code: 'repeated_exact_failure_warning',
          message: `${toolName} has failed ${exactCount} times with identical arguments. This looks like a loop; inspect the error and change strategy instead of retrying it unchanged.`,
          toolName, count: exactCount, signature: sig,
          allowsExecution: true, shouldHalt: false,
        };
      }

      // Warning: same-tool failure
      if (this.warningsEnabled && sameCount >= this.sameToolFailureWarnAfter) {
        return {
          action: 'warn', code: 'same_tool_failure_warning',
          message: `${toolName} has failed ${sameCount} times this turn. This looks like a loop. Do not switch to text-only replies; keep using tools, but diagnose before retrying.`,
          toolName, count: sameCount, signature: sig,
          allowsExecution: true, shouldHalt: false,
        };
      }

      return { action: 'allow', code: 'allow', message: '', allowsExecution: true, shouldHalt: false, signature: sig, count: exactCount };
    }

    // Success: clear failure counters
    this._exactFailureCounts.delete(sig);
    this._sameToolFailureCounts.delete(toolName);

    // Idempotent: track same-result repetition
    if (!this._isIdempotent(toolName)) {
      this._noProgress.delete(sig);
      return { action: 'allow', code: 'allow', message: '', allowsExecution: true, shouldHalt: false, signature: sig };
    }

    const resultHash = this._resultHash(result);
    const previous = this._noProgress.get(sig);
    let repeatCount = 1;
    if (previous && previous.resultHash === resultHash) {
      repeatCount = previous.count + 1;
    }
    this._noProgress.set(sig, { resultHash, count: repeatCount });

    if (this.warningsEnabled && repeatCount >= this.noProgressWarnAfter) {
      return {
        action: 'warn', code: 'idempotent_no_progress_warning',
        message: `${toolName} returned the same result ${repeatCount} times. Use the result already provided or change the query instead of repeating it unchanged.`,
        toolName, count: repeatCount, signature: sig,
        allowsExecution: true, shouldHalt: false,
      };
    }

    return { action: 'allow', code: 'allow', message: '', allowsExecution: true, shouldHalt: false, signature: sig, count: repeatCount };
  }

  /**
   * Legacy check method (used by current processToolCalls).
   */
  check(toolName, toolArgs) {
    const decision = this.beforeCall(toolName, toolArgs);
    if (!decision.allowsExecution) {
      return { blocked: true, reason: decision.message };
    }
    return { blocked: false };
  }

  /**
   * Legacy record method (used by current processToolCalls).
   */
  record(toolName, toolArgs, success) {
    this.afterCall(toolName, toolArgs, JSON.stringify({ success }), { failed: !success });
  }

  /**
   * Returns true if no tool has succeeded this iteration.
   */
  isNoProgress() {
    return this._noProgress.size > 0 && [...this._exactFailureCounts.values()].some(c => c > 0);
  }

  _isIdempotent(toolName) {
    if (MUTATING_TOOLS.has(toolName)) return false;
    return IDEMPOTENT_TOOLS.has(toolName);
  }

  _signature(toolName, args) {
    return `${toolName}::${this._argsKey(args)}`;
  }

  _argsKey(args) {
    if (!args || typeof args !== 'object') return String(args);
    return JSON.stringify(args, Object.keys(args).sort());
  }

  _resultHash(result) {
    if (!result) return '';
    try {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const canonical = JSON.stringify(parsed, Object.keys(parsed || {}).sort());
      return crypto.createHash('sha256').update(canonical).digest('hex');
    } catch {
      return crypto.createHash('sha256').update(String(result)).digest('hex');
    }
  }
}

/**
 * Build a synthetic tool result for a blocked tool call.
 */
function guardrailSyntheticResult(decision) {
  return JSON.stringify({
    error: decision.message,
    guardrail: {
      action: decision.action,
      code: decision.code,
      message: decision.message,
      tool_name: decision.toolName,
      count: decision.count,
    },
  });
}

/**
 * Append guardrail guidance to an existing tool result.
 */
function appendGuardrailGuidance(result, decision) {
  if (decision.action !== 'warn' && decision.action !== 'halt') return result;
  if (!decision.message) return result;
  const label = decision.action === 'halt' ? 'Tool loop hard stop' : 'Tool loop warning';
  const suffix = `\n\n[${label}: ${decision.code}; count=${decision.count}; ${decision.message}]`;
  return (result || '') + suffix;
}

module.exports = { ToolGuardrails, guardrailSyntheticResult, appendGuardrailGuidance };
