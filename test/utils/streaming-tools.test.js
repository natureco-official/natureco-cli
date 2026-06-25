/**
 * Lock the streaming tool-call delta accumulator behavior. This is the
 * exact bug pattern called out in the MiniMax provider lessons skill —
 * if these tests fail, REPL and api.js tool calling break across all
 * OpenAI-compatible providers (OpenAI, Groq, MiniMax, DeepSeek, …).
 */
import { describe, it, expect } from 'vitest';
const {
  accumulateToolCallDeltas,
  finalizeToolCalls,
  parseToolArgs,
} = require('../../src/utils/streaming-tools');

describe('accumulateToolCallDeltas', () => {
  it('handles the standard 3-chunk OpenAI shape (id, name, args parts)', () => {
    const buf = [];
    // chunk 1: id + name appear first
    accumulateToolCallDeltas(buf, [
      { index: 0, id: 'call_abc', function: { name: 'get_weather', arguments: '' } },
    ]);
    // chunk 2: first half of args
    accumulateToolCallDeltas(buf, [
      { index: 0, function: { arguments: '{"city":"Ist' } },
    ]);
    // chunk 3: rest of args
    accumulateToolCallDeltas(buf, [
      { index: 0, function: { arguments: 'anbul"}' } },
    ]);
    expect(buf[0].id).toBe('call_abc');
    expect(buf[0].function.name).toBe('get_weather');
    expect(buf[0].function.arguments).toBe('{"city":"Istanbul"}');
  });

  it('accumulates multiple tool calls in parallel (different indexes)', () => {
    const buf = [];
    accumulateToolCallDeltas(buf, [
      { index: 0, id: 'a', function: { name: 'foo', arguments: '{"x":' } },
      { index: 1, id: 'b', function: { name: 'bar', arguments: '{"y":' } },
    ]);
    accumulateToolCallDeltas(buf, [
      { index: 0, function: { arguments: '1}' } },
      { index: 1, function: { arguments: '2}' } },
    ]);
    expect(buf[0].function.arguments).toBe('{"x":1}');
    expect(buf[1].function.arguments).toBe('{"y":2}');
  });

  it('tolerates a name that arrives in pieces (MiniMax has been seen to do this)', () => {
    const buf = [];
    accumulateToolCallDeltas(buf, [{ index: 0, function: { name: 'get_' } }]);
    accumulateToolCallDeltas(buf, [{ index: 0, function: { name: 'weather' } }]);
    expect(buf[0].function.name).toBe('get_weather');
  });

  it('skips entries with no numeric index instead of throwing', () => {
    const buf = [];
    accumulateToolCallDeltas(buf, [
      { id: 'noindex' },
      { index: 0, function: { name: 'ok' } },
    ]);
    expect(buf[0].function.name).toBe('ok');
    expect(buf.filter(Boolean).length).toBe(1);
  });

  it('returns the buffer unchanged when deltas is not an array', () => {
    const buf = [{ index: 0, id: 'x', type: 'function', function: { name: 'n', arguments: '' } }];
    accumulateToolCallDeltas(buf, undefined);
    accumulateToolCallDeltas(buf, null);
    accumulateToolCallDeltas(buf, {});
    expect(buf).toHaveLength(1);
    expect(buf[0].function.name).toBe('n');
  });
});

describe('finalizeToolCalls', () => {
  it('emits OpenAI-shaped {id,type,function} entries', () => {
    const buf = [];
    accumulateToolCallDeltas(buf, [
      { index: 0, id: 'c1', function: { name: 'f', arguments: '{}' } },
    ]);
    const out = finalizeToolCalls(buf);
    expect(out).toEqual([
      { id: 'c1', type: 'function', function: { name: 'f', arguments: '{}' } },
    ]);
  });

  it('synthesizes an id when the provider never sent one', () => {
    const buf = [];
    accumulateToolCallDeltas(buf, [{ index: 0, function: { name: 'f', arguments: '{}' } }]);
    const out = finalizeToolCalls(buf);
    expect(out[0].id).toMatch(/^call_\d+_0$/);
  });

  it('drops incomplete entries (no function name)', () => {
    const buf = [];
    accumulateToolCallDeltas(buf, [{ index: 0, id: 'c1', function: { arguments: '{}' } }]);
    expect(finalizeToolCalls(buf)).toEqual([]);
  });
});

describe('parseToolArgs', () => {
  it('parses valid JSON', () => {
    expect(parseToolArgs('{"a":1}')).toEqual({ a: 1 });
  });
  it('returns {} on missing/empty/invalid input', () => {
    expect(parseToolArgs('')).toEqual({});
    expect(parseToolArgs(undefined)).toEqual({});
    expect(parseToolArgs('not json')).toEqual({});
  });
});
