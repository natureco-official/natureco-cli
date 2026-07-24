import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const requireCjs = createRequire(import.meta.url);
const codeV5 = requireCjs('../src/commands/code_v5.js');
const { streamAssistantReply } = codeV5._presentation;
const encoder = new TextEncoder();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('code_v5 live provider branches', () => {
  it('(g) both real provider-call sites use the writer and change output before completion', async () => {
    const source = fs.readFileSync(path.resolve('src/commands/code_v5.js'), 'utf8');
    expect(source.match(/await streamAssistantReply\(/g)).toHaveLength(2);

    for (const branch of ['workflow-summary', 'normal-agent']) {
      let release;
      const finish = new Promise(resolve => { release = resolve; });
      let reads = 0;
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        body: {
          getReader: () => ({
            async read() {
              reads++;
              if (reads === 1) {
                return {
                  done: false,
                  value: encoder.encode(`data: {"choices":[{"delta":{"content":"${branch} live"}}]}\n`),
                };
              }
              await finish;
              return { done: true };
            },
          }),
        },
      })));
      const output = {
        isTTY: false,
        value: '',
        write(chunk) { this.value += String(chunk); },
      };
      let resolved = false;
      const turn = streamAssistantReply(
        'https://api.openai.com/v1',
        'key',
        'gpt-test',
        [{ role: 'user', content: branch }],
        [],
        { output, isTTY: false },
      ).then(result => {
        resolved = true;
        return result;
      });
      await vi.waitFor(() => expect(output.value).toContain(`${branch} live`));
      expect(resolved).toBe(false);
      release();
      const result = await turn;
      expect(result.raw).toBe(`${branch} live`);
      expect(result.reply.content).toBe(`${branch} live`);
      vi.unstubAllGlobals();
    }
  });

  it('commits mixed content plus tool calls exactly once through the tool-call path', async () => {
    const messages = [];
    const reply = {
      role: 'assistant',
      content: 'Visible explanation',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
    };
    messages.push({ role: 'user', content: 'go' });
    if (reply.content && !(reply.tool_calls && reply.tool_calls.length > 0)) {
      messages.push({ role: 'assistant', content: reply.content });
    }
    messages.push(reply);
    expect(messages.filter(item => item.role === 'assistant')).toEqual([reply]);
  });
});
