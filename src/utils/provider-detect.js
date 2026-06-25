/**
 * Provider detection — single source of truth for "given a base URL
 * (and optionally a model name) which provider family is this?"
 *
 * Previously this logic lived inline in three places:
 *   - src/utils/api.js  (the canonical detectProvider, exported only
 *     informally via its module surface)
 *   - src/commands/setup.js  (string contains checks against minimax /
 *     anthropic / groq, scattered through the OAuth + test flows)
 *   - src/utils/api.js  again, with `const isMiniMax = baseUrl.includes(
 *     'minimax.io') || baseUrl.includes('minimaxi.com') || baseUrl.includes(
 *     'minimax.cn')` repeated twice (lines 560 + 1017)
 *
 * Refactoring opportunity from the v5.7 audit. This module preserves
 * EXACTLY the same detection rules as the original detectProvider so
 * the migration is a behavioral no-op verifiable by tests.
 */

/**
 * Family of an inference provider.
 *
 * @typedef {'openai'|'anthropic'|'groq'|'openrouter'|'deepseek'|'mistral'
 *           |'together'|'fireworks'|'perplexity'|'ollama'|'minimax'} ProviderName
 */

/**
 * @param {string} providerUrl
 * @param {string} [model]
 * @returns {ProviderName}
 */
function detectProvider(providerUrl, model) {
  const url = (providerUrl || '').toLowerCase();
  const m = (model || '').toLowerCase();
  if (url.includes('anthropic.com') || m.includes('claude')) return 'anthropic';
  if (url.includes('groq.com') || m.includes('groq') || m.includes('llama-3') || m.includes('mixtral')) return 'groq';
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.deepseek.com') || m.includes('deepseek')) return 'deepseek';
  if (url.includes('mistral.ai') || m.includes('mistral') || m.includes('codestral')) return 'mistral';
  if (url.includes('together.xyz') || m.includes('together')) return 'together';
  if (url.includes('fireworks.ai') || m.includes('fireworks')) return 'fireworks';
  if (url.includes('perplexity.ai') || m.includes('pplx') || m.includes('sonar')) return 'perplexity';
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('ollama')) return 'ollama';
  if (url.includes('minimax.io') || url.includes('minimax')) return 'minimax';
  return 'openai';
}

/** Convenience predicates — each one short-circuits on hostname only. */
function isAnthropic(url) {
  return (url || '').toLowerCase().includes('anthropic.com');
}

function isGroq(url) {
  return (url || '').toLowerCase().includes('groq.com');
}

/**
 * MiniMax has three known production hosts:
 *   api.minimax.io    — global English-facing
 *   api.minimaxi.com  — China-facing
 *   api.minimax.cn    — legacy CN domain seen in some auth tokens
 */
function isMiniMax(url) {
  const u = (url || '').toLowerCase();
  return u.includes('minimax.io') || u.includes('minimaxi.com') || u.includes('minimax.cn');
}

function isOllama(url) {
  const u = (url || '').toLowerCase();
  return u.includes('localhost') || u.includes('127.0.0.1') || u.includes('ollama');
}

module.exports = {
  detectProvider,
  isAnthropic,
  isGroq,
  isMiniMax,
  isOllama,
};
