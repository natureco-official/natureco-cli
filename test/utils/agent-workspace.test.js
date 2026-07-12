const { AgentWorkspaceManager } = require('../../src/utils/agent-workspace');

describe('isolated agent workspace', () => {
  test('runs task in isolated worktree and discards by default', async () => {
    const calls = [];
    const fake = {
      enter: ({ id }) => { calls.push(['enter', id]); return { worktreeDir: `/tmp/${id}` }; },
      exit: options => { calls.push(['exit', options]); return { merged: options.merge }; },
    };
    const manager = new AgentWorkspaceManager({ createWorktree: () => fake });
    const result = await manager.run('a1', async ctx => ({ cwd: ctx.cwd }));
    expect(result).toMatchObject({ ok: true, result: { cwd: '/tmp/agent-a1' }, merged: false });
    expect(calls).toEqual([['enter', 'agent-a1'], ['exit', { merge: false }]]);
  });

  test('cleans up without merge when task fails', async () => {
    const exits = [];
    const manager = new AgentWorkspaceManager({ createWorktree: () => ({ enter: () => ({ worktreeDir: '/tmp/x' }), exit: opts => exits.push(opts) }) });
    const result = await manager.run('a2', async () => { throw new Error('boom'); }, { merge: true });
    expect(result).toMatchObject({ ok: false, error: 'boom', merged: false });
    expect(exits).toEqual([{ merge: false }]);
  });
});
