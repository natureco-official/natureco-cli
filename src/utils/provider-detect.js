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
  let base = (providerUrl || '').replace(/\/+$/, '');
  if (isMiniMax(base)) {
    // Kullanıcı OpenAI alışkanlığıyla .../v1 girerse /v1/v1/... 404'üne düşmesin
    base = base.replace(/\/v1$/, '');
    return `${base}/v1/text/chatcompletion_v2`;
  }
  if (isGemini(base)) return `${base}/openai/chat/completions`;
  return `${base}/chat/completions`;
}

/**
 * Can this provider be trusted to emit OpenAI-style `tool_calls`?
 *
 * When it can, the agent loop talks to it directly. When it cannot, requests
 * are routed through the workflow tool's XML agentic runner, which costs an
 * extra classify/plan round trip per message.
 *
 * The check used to blanket-exclude MiniMax. That was right for M2.x, but
 * MiniMax-M2.5 emits well-formed tool_calls over the streaming endpoint —
 * verified end to end against read_file, http_request and code_execution — so
 * excluding it forced every MiniMax user down the expensive path for no reason.
 *
 * `nativeToolCalls: true|false` in config overrides the heuristic either way.
 *
 * @param {string} url
 * @param {string} [model]
 * @param {object} [config]
 */
function supportsNativeToolCalls(url, model, config = {}) {
  if (typeof config.nativeToolCalls === 'boolean') return config.nativeToolCalls;

  const u = (url || '').toLowerCase();
  const m = String(model || '');

  if (isMiniMax(u)) {
    // M2.5 and anything numbered above it; M2.0–M2.4 and unnumbered stay on the
    // XML path.
    const match = m.match(/M(\d+)(?:\.(\d+))?/i);
    if (!match) return false;
    const major = Number(match[1]);
    const minor = Number(match[2] || 0);
    return major > 2 || (major === 2 && minor >= 5);
  }

  // Gemini "thinking" returns empty at the low max_tokens the plan path uses;
  // Ollama/local and Groq remain unreliable for strict tool schemas.
  if (isGemini(u) || isOllama(u) || isGroq(u)) return false;
  return true;
}

module.exports = {
  detectProvider,
  isAnthropic,
  isGroq,
  isMiniMax,
  isOllama,
  isGemini,
  buildChatEndpoint,
  supportsNativeToolCalls,
};
