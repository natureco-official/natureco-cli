import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { executeTool } = requireCjs('../src/utils/tool-runner.js');
const TB = requireCjs('../src/utils/token-budget.js');

/**
 * `natureco chat` / `ask` / `run` / channels all execute through
 * tool-runner.executeTool. That path consulted permission rules and pre-hooks
 * only — and both default to "allow" when the user has configured nothing — so
 * a destructive command reached the shell with no prompt and no refusal. The
 * risk table existed, but only the `code` agent ever called it.
 */
describe('tool-runner applies the shared risk assessment', () => {
  it('refuses a destructive shell command in a non-interactive call', async () => {
    const result = await executeTool('bash', { command: 'rm -rf /tmp/nc-should-not-run' }, { agentMode: false });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/refused in a non-interactive call|etkileşimsiz çağrıda reddedildi/i);
  });

  it('refuses the Windows equivalent too', async () => {
    const result = await executeTool('bash', { command: 'Remove-Item -Recurse -Force C:\\data' }, { agentMode: false });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/refused in a non-interactive call|etkileşimsiz çağrıda reddedildi/i);
  });

  it('refuses a write to a sensitive path', async () => {
    const result = await executeTool('write_file', { path: '.env', content: 'SECRET=1' }, { agentMode: false });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/refused in a non-interactive call|etkileşimsiz çağrıda reddedildi/i);
  });

  it('lets an ordinary call through to normal resolution', async () => {
    // Not refused for risk — it gets as far as tool lookup, which is the proof
    // the gate did not fire on a harmless call.
    const result = await executeTool('definitely_not_a_real_tool', { command: 'npm test' }, { agentMode: false });
    expect(result.error).toMatch(/not found/i);
  });
});

/**
 * The chat loop called `TB.trimMessages(messages)` as a bare statement. It is a
 * pure function returning a new array, so the result was thrown away and the
 * transcript was never trimmed — and it ran after the loop, too late to help.
 */
describe('trimMessages is a pure function, so its result must be used', () => {
  it('does not mutate the array it is given', () => {
    const messages = [{ role: 'system', content: 'sys' }];
    for (let i = 0; i < 60; i++) {
      messages.push({ role: 'user', content: `q${i} `.repeat(200) });
      messages.push({ role: 'assistant', content: `a${i} `.repeat(200) });
    }
    const originalLength = messages.length;
    const trimmed = TB.trimMessages(messages);

    expect(trimmed.length).toBeLessThan(originalLength);
    // The caller must splice the result in; ignoring the return value is a no-op.
    expect(messages.length).toBe(originalLength);
  });
});

/**
 * NATURECO_FORCE=1 is the documented "I know what I am doing" opt-out. It must
 * ALLOW without prompting — not be confused with a non-TTY origin, which
 * refuses.
 */
describe('NATURECO_FORCE opt-out', () => {
  it('lets a risky call through instead of refusing it', async () => {
    const previous = process.env.NATURECO_FORCE;
    process.env.NATURECO_FORCE = '1';
    try {
      const result = await executeTool('definitely_not_a_real_tool', { command: 'rm -rf /tmp/x' }, { agentMode: false });
      // Past the risk gate: it fails on tool lookup, not on approval.
      expect(result.error).toMatch(/not found/i);
    } finally {
      if (previous === undefined) delete process.env.NATURECO_FORCE;
      else process.env.NATURECO_FORCE = previous;
    }
  });
});
