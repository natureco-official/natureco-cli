const { executeThroughGateway } = require('../../src/utils/tool-execution-gateway');

describe('tool execution gateway', () => {
  test('runs checks in order and post-processes success', async () => {
    const order = [];
    const output = await executeThroughGateway({
      toolName: 'demo', args: { value: 3 },
      resolveTool: () => { order.push('resolve'); return { execute: async args => { order.push('execute'); return args.value * 2; } }; },
      checkAvailability: () => { order.push('availability'); return true; },
      policyChecks: [() => { order.push('policy'); return true; }],
      postProcess: ({ result }) => { order.push('post'); return result + 1; },
    });
    expect(order).toEqual(['resolve', 'availability', 'policy', 'execute', 'post']);
    expect(output).toEqual({ result: 7 });
  });

  test('never executes a tool denied by policy', async () => {
    let calls = 0;
    const execute = async () => { calls++; };
    const output = await executeThroughGateway({
      toolName: 'danger', resolveTool: () => ({ execute }),
      policyChecks: [() => ({ allowed: false, reason: 'blocked' })],
    });
    expect(calls).toBe(0);
    expect(output).toEqual({ error: 'blocked' });
  });

  test('normalizes missing tools and execution failures', async () => {
    await expect(executeThroughGateway({ toolName: 'missing', resolveTool: () => null }))
      .resolves.toEqual({ error: 'Tool bulunamadı: missing' });
    await expect(executeThroughGateway({
      toolName: 'broken', resolveTool: () => ({ execute: async () => { throw new Error('boom'); } }),
    })).resolves.toEqual({ error: 'boom' });
  });

  test('blocks sensitive paths before execution unless explicitly allowed', async () => {
    let calls = 0;
    const options = {
      toolName: 'read_file', args: { path: '~/.ssh/id_rsa' },
      resolveTool: () => ({ execute: async () => { calls++; return 'secret'; } }),
    };
    const blocked = await executeThroughGateway(options);
    expect(blocked.error).toMatch(/Hassas dosya yolu/);
    expect(calls).toBe(0);

    const allowed = await executeThroughGateway({ ...options, allowSensitivePaths: true });
    expect(allowed).toEqual({ result: 'secret' });
    expect(calls).toBe(1);
  });

  test('validates the manifest schema before execution and can return the standard contract', async () => {
    let calls = 0;
    const tool = {
      inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      execute: async args => { calls++; return { success: true, output: args.name }; },
    };
    const invalid = await executeThroughGateway({ toolName: 'demo', args: {}, resolveTool: () => tool });
    expect(invalid.error).toMatch(/Geçersiz araç argümanları/);
    expect(calls).toBe(0);
    const valid = await executeThroughGateway({ toolName: 'demo', args: { name: 'ok' }, resolveTool: () => tool, standardResult: true });
    expect(valid).toMatchObject({ ok: true, error: null, metrics: { tool: 'demo' } });
  });
});
