import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const TB = requireCjs('../src/utils/token-budget.js');

/**
 * Trimming by score or position can orphan either half of a tool exchange.
 * OpenAI rejects a `role:"tool"` message that does not answer a preceding
 * `tool_calls` message; Anthropic rejects a `tool_use` block with no matching
 * `tool_result`. Both trims must hand back a transcript a provider will accept.
 */
describe('repairToolPairing', () => {
  it('drops tool results whose announcing assistant message was trimmed away', () => {
    const repaired = TB.repairToolPairing([
      { role: 'system', content: 'sys' },
      { role: 'tool', tool_call_id: 'orphan', content: 'result with no parent' },
      { role: 'user', content: 'hi' },
    ]);
    expect(repaired.some(m => m.role === 'tool')).toBe(false);
    expect(repaired.map(m => m.role)).toEqual(['system', 'user']);
  });

  it('drops tool_calls that lost their results', () => {
    const repaired = TB.repairToolPairing([
      { role: 'assistant', content: 'working', tool_calls: [{ id: 'a', function: { name: 'read_file' } }] },
      { role: 'user', content: 'next' },
    ]);
    const assistant = repaired.find(m => m.role === 'assistant');
    expect(assistant.tool_calls).toBeUndefined();
    expect(assistant.content).toBe('working');
  });

  it('removes an assistant turn left with neither content nor answered calls', () => {
    const repaired = TB.repairToolPairing([
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', function: { name: 'read_file' } }] },
      { role: 'user', content: 'next' },
    ]);
    expect(repaired.map(m => m.role)).toEqual(['user']);
  });

  it('narrows a partially answered assistant turn to the answered calls', () => {
    const repaired = TB.repairToolPairing([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'a', function: { name: 'read_file' } },
          { id: 'b', function: { name: 'grep_search' } },
        ],
      },
      { role: 'tool', tool_call_id: 'b', content: 'ok' },
    ]);
    const assistant = repaired.find(m => m.role === 'assistant');
    expect(assistant.tool_calls.map(c => c.id)).toEqual(['b']);
  });

  it('leaves a complete exchange untouched', () => {
    const input = [
      { role: 'system', content: 'sys' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', function: { name: 'read_file' } }] },
      { role: 'tool', tool_call_id: 'a', content: 'ok' },
    ];
    expect(TB.repairToolPairing(input)).toEqual(input);
  });
});

describe('smartTrim / trimMessages keep transcripts provider-valid', () => {
  // Large enough that every preset (efficient…quality) has to drop messages,
  // so the pairing assertions below actually exercise a trimmed transcript.
  function longExchange(turns) {
    const messages = [{ role: 'system', content: 'sys' }];
    for (let i = 0; i < turns; i++) {
      messages.push({ role: 'user', content: `question ${i} `.repeat(400) });
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'read_file', arguments: '{}' } }],
      });
      messages.push({ role: 'tool', tool_call_id: `call_${i}`, content: `result ${i} `.repeat(400) });
      messages.push({ role: 'assistant', content: `answer ${i} `.repeat(400) });
    }
    return messages;
  }

  function assertPaired(messages) {
    const announced = new Set();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const c of msg.tool_calls) announced.add(c.id);
      }
      if (msg.role === 'tool') {
        expect(announced.has(msg.tool_call_id)).toBe(true);
      }
    }
    const answered = new Set(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id));
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const c of msg.tool_calls) expect(answered.has(c.id)).toBe(true);
      }
    }
  }

  it('smartTrim output has no orphaned tool calls or results', () => {
    const input = longExchange(40);
    const trimmed = TB.smartTrim(input);
    expect(trimmed.length).toBeLessThan(input.length);
    assertPaired(trimmed);
  });

  it('trimMessages output has no orphaned tool calls or results', () => {
    const trimmed = TB.trimMessages(longExchange(40));
    assertPaired(trimmed);
  });
});

describe('estimateMessageTokens / needsCompaction', () => {
  it('counts tool_calls, which carry no content but are still billed', () => {
    const withCalls = TB.estimateMessageTokens([
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', function: { name: 'read_file', arguments: '{"filePath":"a-fairly-long-path.txt"}' } }] },
    ]);
    const withoutCalls = TB.estimateMessageTokens([{ role: 'assistant', content: null }]);
    expect(withCalls).toBeGreaterThan(withoutCalls);
  });

  it('stays quiet for a short transcript and fires for one over budget', () => {
    const budget = { autoCompact: true, maxContextTokens: 1000, reservedTokens: 200 };
    expect(TB.needsCompaction([{ role: 'user', content: 'hi' }], budget)).toBe(false);
    const huge = [{ role: 'user', content: 'x'.repeat(40000) }];
    expect(TB.needsCompaction(huge, budget)).toBe(true);
  });

  it('never fires when auto-compact is turned off', () => {
    const budget = { autoCompact: false, maxContextTokens: 1000, reservedTokens: 200 };
    expect(TB.needsCompaction([{ role: 'user', content: 'x'.repeat(40000) }], budget)).toBe(false);
  });
});
