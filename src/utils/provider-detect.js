/**
 * Provider detection — single source of truth for "given a base URL
 * (and optionally a model name) which provider family is this?"
 *
 * v5.22.0: Delegates real detection to model-provider.js's detectFamily.
 * Keeps convenience predicates (isAnthropic, isMiniMax, etc.) and
 * buildChatEndpoint for backward compatibility.
 */

const { detectFamily } = require('./model-provider');

/**
 * Canonical detection — delegates to model-provider.
 * @param {string} providerUrl
 * @param {string} [model]
 * @returns {string}
 */
function detectProvider(providerUrl, model) {
  return detectFamily(providerUrl, model);
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

function isGemini(url) {
  const u = (url || '').toLowerCase();
  return u.includes('generativelanguage.googleapis.com') || u.includes('gemini');
}

/**
 * Build the correct chat completions endpoint for a given provider URL.
 * Handles MiniMax (non-standard path), Gemini (OpenAI-compat path under /openai/),
 * and standard OpenAI-compatible providers.
 */
function buildChatEndpoint(providerUrl) {
  const base = (providerUrl || '').replace(/\/+$/, '');
  if (isMiniMax(base)) return `${base}/v1/text/chatcompletion_v2`;
  if (isGemini(base)) return `${base}/openai/chat/completions`;
  return `${base}/chat/completions`;
}

module.exports = {
  detectProvider,
  isAnthropic,
  isGroq,
  isMiniMax,
  isOllama,
  isGemini,
  buildChatEndpoint,
};
