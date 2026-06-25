/**
 * provider-detect — locks down the URL→provider mapping that previously
 * lived inline in api.js + setup.js. These tests double as a regression
 * guard for the URL fragments that 12 providers depend on.
 */
import { describe, it, expect } from 'vitest';

const {
  detectProvider,
  isAnthropic,
  isGroq,
  isMiniMax,
  isOllama,
} = require('../../src/utils/provider-detect');

describe('detectProvider — URL routing', () => {
  it.each([
    ['https://api.anthropic.com/v1', 'anthropic'],
    ['https://api.groq.com/openai/v1', 'groq'],
    ['https://openrouter.ai/api/v1', 'openrouter'],
    ['https://api.deepseek.com/v1', 'deepseek'],
    ['https://api.mistral.ai/v1', 'mistral'],
    ['https://api.together.xyz/v1', 'together'],
    ['https://api.fireworks.ai/inference/v1', 'fireworks'],
    ['https://api.perplexity.ai', 'perplexity'],
    ['http://localhost:11434/v1', 'ollama'],
    ['http://127.0.0.1:11434/v1', 'ollama'],
    ['https://api.minimax.io', 'minimax'],
    ['https://api.minimaxi.com', 'minimax'],
    ['https://api.openai.com/v1', 'openai'],
    ['', 'openai'],
    [undefined, 'openai'],
  ])('routes %p → %p', (url, expected) => {
    expect(detectProvider(url, '')).toBe(expected);
  });

  it('falls back to model-name hints when the URL is generic', () => {
    expect(detectProvider('https://api.example.com', 'claude-3-opus')).toBe('anthropic');
    expect(detectProvider('https://api.example.com', 'llama-3-70b')).toBe('groq');
    expect(detectProvider('https://api.example.com', 'mistral-large')).toBe('mistral');
    expect(detectProvider('https://api.example.com', 'deepseek-chat')).toBe('deepseek');
    expect(detectProvider('https://api.example.com', 'pplx-7b')).toBe('perplexity');
    expect(detectProvider('https://api.example.com', 'sonar-medium')).toBe('perplexity');
  });

  it('case-insensitive on both URL and model', () => {
    expect(detectProvider('HTTPS://API.ANTHROPIC.COM', 'CLAUDE-3')).toBe('anthropic');
    expect(detectProvider('https://API.MINIMAX.IO', '')).toBe('minimax');
  });
});

describe('isMiniMax — covers all three known prod hosts', () => {
  it.each([
    ['https://api.minimax.io', true],
    ['https://api.minimaxi.com', true],
    ['https://api.minimax.cn', true],
    ['https://API.MINIMAX.IO/v1', true],
    ['https://api.openai.com', false],
    ['', false],
    [undefined, false],
    [null, false],
  ])('isMiniMax(%p) → %p', (url, expected) => {
    expect(isMiniMax(url)).toBe(expected);
  });
});

describe('isAnthropic / isGroq / isOllama predicates', () => {
  it('isAnthropic matches anthropic.com only', () => {
    expect(isAnthropic('https://api.anthropic.com/v1')).toBe(true);
    expect(isAnthropic('https://api.openai.com')).toBe(false);
    expect(isAnthropic('')).toBe(false);
  });

  it('isGroq matches groq.com only', () => {
    expect(isGroq('https://api.groq.com/openai/v1')).toBe(true);
    expect(isGroq('https://api.openai.com')).toBe(false);
  });

  it('isOllama matches localhost / 127.0.0.1 / ollama', () => {
    expect(isOllama('http://localhost:11434/v1')).toBe(true);
    expect(isOllama('http://127.0.0.1:11434/v1')).toBe(true);
    expect(isOllama('https://ollama.example.com')).toBe(true);
    expect(isOllama('https://api.openai.com')).toBe(false);
  });
});
