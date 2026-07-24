import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const codeV5 = requireCjs('../src/commands/code_v5.js');
const {
  processToolCalls,
  runTransactionalRound,
  streamAssistantReply,
} = codeV5._presentation;

function abortError() {
  const error = new Error('interrupted');
  error.name = 'AbortError';
  return error;
}

function call(id, name) {
  return {
    id,
    type: 'function',
    function: { name, arguments: '{}' },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Rock D2 transactional interrupt', () => {
  it('(a,e) aborts a stream, stops token consumption, runs reader cleanup, and settles', async () => {
    let reads = 0;
    let cancelled = 0;
    let pendingRead;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => ({
      ok: true,
      body: {
        getReader: () => ({
          read() {
            reads++;
            if (reads === 1) {
              return Promise.resolve({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n'),
              });
            }
            return new Promise(resolve => { pendingRead = resolve; });
          },
          cancel() {
            cancelled++;
            pendingRead?.({ done: true });
            return Promise.resolve();
          },
        }),
      },
      signal: init.signal,
    })));
    const controller = new AbortController();
    const output = { isTTY: false, value: '', write(chunk) { this.value += String(chunk); } };
    const turn = streamAssistantReply(
      'https://api.openai.com/v1',
      'key',
      'gpt-test',
      [{ role: 'user', content: 'go' }],
      [],
      { signal: controller.signal, output, isTTY: false },
    );
    await vi.waitFor(() => expect(output.value).toBe('partial'));
    controller.abort(abortError());
    await expect(turn).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(1);
    expect(reads).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('(b) rolls partial assistant text and an orphanable tool-call/result set back to the boundary', async () => {
    const messages = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'prior user turn' },
    ];
    const controller = new AbortController();
    const round = runTransactionalRound(messages, async signal => {
      messages.push({ role: 'assistant', content: 'partial' });
      messages.push({ role: 'assistant', content: null, tool_calls: [call('one', 'read_file')] });
      messages.push({ role: 'tool', tool_call_id: 'one', content: 'partial result' });
      controller.abort(abortError());
      signal.throwIfAborted();
    }, { signal: controller.signal });
    await expect(round).rejects.toMatchObject({ name: 'AbortError' });
    expect(messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'prior user turn' },
    ]);
  });

  it('(c,e) awaits a non-cancellable tool before rollback and never emits a late card', async () => {
    let settleTool;
    let effect = 'running';
    const tools = [{
      name: 'read_file',
      parameters: { type: 'object', properties: {} },
      execute: () => new Promise(resolve => {
        settleTool = () => {
          effect = 'settled';
          resolve('contents');
        };
      }),
    }];
    const messages = [{ role: 'user', content: 'read' }];
    const controller = new AbortController();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    let resolved = false;
    const round = runTransactionalRound(messages, signal => processToolCalls(
      { content: null, tool_calls: [call('one', 'read_file')] },
      {},
      tools,
      messages,
      undefined,
      { signal, activeTools: new Set() },
    ), { signal: controller.signal }).catch(error => {
      resolved = true;
      throw error;
    });
    await vi.waitFor(() => expect(settleTool).toBeTypeOf('function'));
    controller.abort(abortError());
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(effect).toBe('running');
    settleTool();
    await expect(round).rejects.toMatchObject({ name: 'AbortError' });
    expect(effect).toBe('settled');
    expect(messages).toEqual([{ role: 'user', content: 'read' }]);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('(d,e) awaits every member of an interrupted parallel batch and rolls back all results', async () => {
    const effects = [];
    const releases = {};
    const tools = ['read_file', 'file_search'].map(name => ({
      name,
      parameters: { type: 'object', properties: {} },
      execute: () => new Promise(resolve => {
        releases[name] = () => {
          effects.push(name);
          resolve(name);
        };
      }),
    }));
    const messages = [{ role: 'user', content: 'parallel' }];
    const controller = new AbortController();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const round = runTransactionalRound(messages, signal => processToolCalls(
      { content: null, tool_calls: [call('one', 'read_file'), call('two', 'file_search')] },
      {},
      tools,
      messages,
      undefined,
      { signal, activeTools: new Set() },
    ), { signal: controller.signal });
    await vi.waitFor(() => expect(Object.keys(releases)).toHaveLength(2));
    controller.abort(abortError());
    releases.read_file();
    await Promise.resolve();
    expect(effects).toEqual(['read_file']);
    releases.file_search();
    await expect(round).rejects.toMatchObject({ name: 'AbortError' });
    expect(effects.sort()).toEqual(['file_search', 'read_file']);
    expect(messages).toEqual([{ role: 'user', content: 'parallel' }]);
  });
});
