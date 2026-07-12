const { AgentCore } = require('../../src/utils/agent-core');

describe('shared agent core', () => {
  test('owns request and iteration lifecycle', () => {
    const core = new AgentCore({ maxIterations: 2 });
    core.startRequest();
    expect(core.startIteration()).toMatchObject({ iteration: 1, allowed: true });
    expect(core.startIteration()).toMatchObject({ iteration: 2, allowed: true });
    expect(core.startIteration()).toMatchObject({ iteration: 3, allowed: false });
  });

  test('parses OpenAI and normalized tool calls consistently', () => {
    const core = new AgentCore();
    const calls = core.parseToolCalls([
      { id: 'a', function: { name: 'read_file', arguments: '{"path":"x"}' } },
      { name: 'list_dir', input: { path: '.' } },
      { name: 'bad', args: '{oops' },
    ]);
    expect(calls[0]).toMatchObject({ id: 'a', name: 'read_file', input: { path: 'x' }, parseError: null });
    expect(calls[1]).toMatchObject({ name: 'list_dir', input: { path: '.' } });
    expect(core.assess(calls[2])).toMatchObject({ blocked: true });
  });

  test('records every result in the standard contract', () => {
    const core = new AgentCore();
    core.startRequest();
    core.startIteration();
    expect(core.record({ name: 'demo', input: {} }, { success: false, error: 'boom' }))
      .toMatchObject({ ok: false, data: null, error: 'boom', metrics: { tool: 'demo', iteration: 1 } });
  });
});
