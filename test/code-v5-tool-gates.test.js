import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const codeV5 = requireCjs('../src/commands/code_v5.js');
const { processToolCalls } = codeV5._presentation;
const { getPlanMode } = requireCjs('../src/utils/plan-mode.js');

function call(id, name, args = {}) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

/**
 * Every gate in processToolCalls used to `return` on refusal, which dropped the
 * assistant turn AND every tool result. The transcript then looked exactly like
 * the one that produced the refused call, so the next round re-issued it and
 * the user was re-prompted until the iteration cap.
 */
describe('code_v5 tool gates answer every announced call', () => {
  let stdout;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const pm = getPlanMode();
    if (pm.isActive?.()) pm.exit('cleanup');
    stdout?.mockRestore?.();
  });

  it('records the assistant turn and an error result when plan mode blocks a call', async () => {
    const pm = getPlanMode();
    pm.enter();

    const messages = [{ role: 'user', content: 'write it' }];
    const reply = { content: null, tool_calls: [call('c1', 'write_file', { filePath: 'x.txt', content: 'hi' })] };

    await processToolCalls(reply, {}, [], messages, null, {});

    const assistant = messages.find(m => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant.tool_calls).toHaveLength(1);

    const answer = messages.find(m => m.role === 'tool' && m.tool_call_id === 'c1');
    expect(answer).toBeDefined();
    expect(answer.content).toMatch(/^ERROR:/);
  });

  it('runs the allowed calls in a batch even when a sibling is refused', async () => {
    const pm = getPlanMode();
    pm.enter();

    const executed = [];
    const tools = [{
      name: 'read_file',
      description: 'read',
      parameters: { type: 'object', properties: {} },
      execute: async () => { executed.push('read_file'); return 'file contents'; },
    }];

    const messages = [{ role: 'user', content: 'read then write' }];
    const reply = {
      content: null,
      tool_calls: [
        call('c1', 'read_file', { filePath: 'a.txt' }),
        call('c2', 'write_file', { filePath: 'b.txt', content: 'x' }),
      ],
    };

    await processToolCalls(reply, {}, tools, messages, null, {});

    // A refusal on the write must not cancel the read that was announced with it.
    expect(executed).toEqual(['read_file']);

    const answers = messages.filter(m => m.role === 'tool');
    expect(answers.map(m => m.tool_call_id)).toEqual(['c1', 'c2']);
    expect(answers[0].content).not.toMatch(/^ERROR:/);
    expect(answers[1].content).toMatch(/^ERROR:/);
  });

  it('answers in the order the model announced the calls', async () => {
    const tools = [
      {
        name: 'read_file', description: 'read',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'parallel-safe result',
      },
      {
        name: 'todo_write', description: 'todo',
        parameters: { type: 'object', properties: {} },
        execute: async () => 'sequential result',
      },
    ];

    const messages = [{ role: 'user', content: 'both' }];
    // todo_write is sequential, read_file is parallel-safe: the two used to be
    // appended in execution order, not announcement order.
    const reply = {
      content: null,
      tool_calls: [call('seq', 'todo_write'), call('par', 'read_file')],
    };

    await processToolCalls(reply, {}, tools, messages, null, {});

    expect(messages.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(['seq', 'par']);
  });

  it('refuses mutating tools under --dry-run and still answers the call', async () => {
    let ran = false;
    const tools = [{
      name: 'write_file', description: 'write',
      parameters: { type: 'object', properties: {} },
      execute: async () => { ran = true; return 'written'; },
    }];

    const messages = [{ role: 'user', content: 'write' }];
    const reply = { content: null, tool_calls: [call('c1', 'write_file', { filePath: 'x.txt', content: 'hi' })] };

    await processToolCalls(reply, {}, tools, messages, null, { dryRun: true });

    expect(ran).toBe(false);
    const answer = messages.find(m => m.role === 'tool' && m.tool_call_id === 'c1');
    expect(answer.content).toMatch(/DRY RUN/i);
  });

  it('reports unparsable tool arguments back to the model instead of guessing {}', async () => {
    const messages = [{ role: 'user', content: 'go' }];
    const reply = {
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{not json' } }],
    };

    await processToolCalls(reply, {}, [], messages, null, {});

    const answer = messages.find(m => m.role === 'tool' && m.tool_call_id === 'c1');
    expect(answer.content).toMatch(/JSON/i);
  });
});
