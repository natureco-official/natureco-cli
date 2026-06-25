/**
 * Anthropic `system` field handling. Sending undefined or '' to the
 * Messages API on recent revisions returns 400 "system: cannot be empty"
 * or, worse, succeeds but ignores any instruction the user put in their
 * (silently dropped) system message — yielding an "unanchored" model
 * that drifts from the bot personality.
 */
import { describe, it, expect } from 'vitest';

const { _internals } = require('../../src/utils/api');
const { extractSystemForAnthropic, DEFAULT_ANTHROPIC_SYSTEM, buildRequestBody } = _internals;

describe('extractSystemForAnthropic', () => {
  it('returns the system message content verbatim when present', () => {
    const msgs = [
      { role: 'system', content: 'You are Naruto-bot.' },
      { role: 'user', content: 'merhaba' },
    ];
    expect(extractSystemForAnthropic(msgs)).toBe('You are Naruto-bot.');
  });

  it('falls back to the non-empty default when no system message exists', () => {
    const msgs = [{ role: 'user', content: 'merhaba' }];
    expect(extractSystemForAnthropic(msgs)).toBe(DEFAULT_ANTHROPIC_SYSTEM);
    expect(DEFAULT_ANTHROPIC_SYSTEM.length).toBeGreaterThan(0);
  });

  it('falls back to the default when system content is an empty string', () => {
    const msgs = [
      { role: 'system', content: '' },
      { role: 'user', content: 'hi' },
    ];
    expect(extractSystemForAnthropic(msgs)).toBe(DEFAULT_ANTHROPIC_SYSTEM);
  });

  it('falls back to the default when system content is whitespace-only', () => {
    const msgs = [
      { role: 'system', content: '   \n\t  ' },
      { role: 'user', content: 'hi' },
    ];
    expect(extractSystemForAnthropic(msgs)).toBe(DEFAULT_ANTHROPIC_SYSTEM);
  });

  it('passes through Anthropic-style content blocks when system.content is an array', () => {
    const blocks = [{ type: 'text', text: 'Be concise.', cache_control: { type: 'ephemeral' } }];
    const msgs = [
      { role: 'system', content: blocks },
      { role: 'user', content: 'hi' },
    ];
    expect(extractSystemForAnthropic(msgs)).toEqual(blocks);
  });

  it('falls back to default when system content is an empty array', () => {
    const msgs = [
      { role: 'system', content: [] },
      { role: 'user', content: 'hi' },
    ];
    expect(extractSystemForAnthropic(msgs)).toBe(DEFAULT_ANTHROPIC_SYSTEM);
  });
});

describe('buildRequestBody (anthropic path)', () => {
  it('never emits a falsy system field', () => {
    const body = buildRequestBody([{ role: 'user', content: 'hi' }], 'claude-3-haiku', {}, 'anthropic');
    expect(body.system).toBeTruthy();
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(0);
  });

  it('strips the system message out of the messages array (Anthropic carries it as a sibling field)', () => {
    const body = buildRequestBody(
      [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hi' },
      ],
      'claude-3-haiku',
      {},
      'anthropic',
    );
    expect(body.messages.some(m => m.role === 'system')).toBe(false);
    expect(body.system).toBe('be terse');
  });

  it('leaves system messages in place for OpenAI-compatible providers', () => {
    const body = buildRequestBody(
      [
        { role: 'system', content: 'be terse' },
        { role: 'user', content: 'hi' },
      ],
      'gpt-4o',
      {},
      'openai',
    );
    // body.system should NOT exist for OpenAI; system stays in messages[]
    expect(body.system).toBeUndefined();
    expect(body.messages.some(m => m.role === 'system')).toBe(true);
  });
});
