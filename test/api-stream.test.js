import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const {
  streamOpenAICompletion,
  streamAnthropicCompletion,
} = requireCjs('../src/utils/api.js');

const encoder = new TextEncoder();
function responseFromChunks(chunks) {
  let index = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true };
            return { done: false, value: encoder.encode(chunks[index++]) };
          },
        };
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('provider streaming transport', () => {
  it('(f) OpenAI emits normalized text/tool/usage/done events and writes no stdout', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n',
      'data: {"choices":[{"delta":{"content":"lo","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_","arguments":"{\\"p"}}]}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"file","arguments":"ath\\":\\"x\\"}"}}]}}],"usage":{"prompt_tokens":2,"completion_tokens":3}}\n',
      'data: [DONE]\n',
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responseFromChunks(chunks)));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const events = [];
    const message = await streamOpenAICompletion(
      { url: 'https://api.openai.com/v1', apiKey: 'key', model: 'gpt-test' },
      [{ role: 'user', content: 'go' }],
      [],
      { onEvent: event => events.push(event) },
    );
    expect(events.filter(event => event.type === 'text_delta').map(event => event.text).join('')).toBe('hello');
    expect(events.some(event => event.type === 'tool_call_delta')).toBe(true);
    expect(events.some(event => event.type === 'usage')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(message).toMatchObject({
      role: 'assistant',
      content: 'hello',
      tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: '{"path":"x"}' } }],
    });
    expect(stdout).not.toHaveBeenCalled();
  });

  it('(f) Anthropic buffers split SSE, converts history, and accumulates tool-use', async () => {
    const payload = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":4}}}\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi "}}\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_1","name":"read_file","input":{}}}\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"a.txt\\"}"}}\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}\n',
      'data: {"type":"message_delta","usage":{"output_tokens":5}}\n',
    ].join('');
    const chunks = [payload.slice(0, 37), payload.slice(37, 143), payload.slice(143)];
    let requestBody;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return responseFromChunks(chunks);
    }));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const events = [];
    const message = await streamAnthropicCompletion(
      { url: 'https://api.anthropic.com', apiKey: 'key', model: 'claude-test', isAnthropic: true },
      [
        { role: 'system', content: 'Be useful.' },
        { role: 'assistant', content: 'Calling.', tool_calls: [{ id: 'old', type: 'function', function: { name: 'read_file', arguments: '{"path":"old"}' } }] },
        { role: 'tool', tool_call_id: 'old', content: 'old contents' },
        { role: 'user', content: 'Again.' },
      ],
      [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } } }],
      { onEvent: event => events.push(event) },
    );
    expect(requestBody.messages.some(item => item.role === 'system')).toBe(false);
    expect(JSON.stringify(requestBody.messages)).toContain('tool_use');
    expect(JSON.stringify(requestBody.messages)).toContain('tool_result');
    expect(requestBody.tools[0]).toMatchObject({ name: 'read_file', input_schema: { type: 'object' } });
    expect(events.filter(event => event.type === 'text_delta').map(event => event.text).join('')).toBe('Hi there');
    expect(events.some(event => event.type === 'tool_call_delta')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(message).toMatchObject({
      role: 'assistant',
      content: 'Hi there',
      tool_calls: [{ id: 'tool_1', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }],
    });
    expect(stdout).not.toHaveBeenCalled();
  });
});
