'use strict';

function estimateTokens(content) {
  if (!content) return 0;
  return Math.ceil(String(content).length / 4);
}

function prepareConversationHistory(messages, options = {}) {
  if (!Array.isArray(messages)) return [];

  if (typeof options === 'number') options = { maxMessages: options };
  const maxMessages = Math.max(1, options.maxMessages || 20);
  const maxTokens = Math.max(1, options.maxTokens || 2048);

  const candidates = messages
    .filter(message =>
      message &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim()
    )
    .slice(-maxMessages);

  const selected = [];
  let remainingTokens = maxTokens;

  for (let i = candidates.length - 1; i >= 0 && remainingTokens > 0; i--) {
    const message = candidates[i];
    const content = message.content.trim();
    const contentTokens = estimateTokens(content);
    if (contentTokens <= remainingTokens) {
      selected.unshift({ role: message.role, content });
      remainingTokens -= contentTokens;
      continue;
    }

    // Preserve the newest oversized turn, but never let a generated file or
    // verbose tool summary consume the entire next request's context budget.
    if (selected.length === 0) {
      const maxChars = Math.max(4, remainingTokens * 4);
      selected.unshift({
        role: message.role,
        content: content.slice(0, Math.max(0, maxChars - 36)) + '\n[... context truncated ...]',
      });
    }
    break;
  }

  return selected;
}

module.exports = { estimateTokens, prepareConversationHistory };
