/**
 * effort-levels — Effort level control (Claude Code: low/medium/high)
 *
 * Controls token budget, iteration limits, and tool breadth:
 *   low:    quick answers, 2 tool iterations, 1024 max_tokens, minimal tools
 *   medium: balanced, 5 iterations, 2048 max_tokens, standard tools (default)
 *   high:   thorough, 12 iterations, 4096 max_tokens, all tools
 */

const LEVELS = { low: 'low', medium: 'medium', high: 'high' };

const CONFIG = {
  low: {
    maxTokens: 1024,
    maxToolIterations: 2,
    temperature: 0.1,
    toolBreadth: 'minimal',
  },
  medium: {
    maxTokens: 2048,
    maxToolIterations: 5,
    temperature: 0.3,
    toolBreadth: 'standard',
  },
  high: {
    maxTokens: 4096,
    maxToolIterations: 12,
    temperature: 0.5,
    toolBreadth: 'all',
  },
};

function getLevel(cfg = {}) {
  const level = (cfg.effort || cfg.effortLevel || 'medium').toLowerCase();
  return LEVELS[level] || 'medium';
}

function getConfig(level) {
  return CONFIG[level] || CONFIG.medium;
}

module.exports = { LEVELS, CONFIG, getLevel, getConfig };
