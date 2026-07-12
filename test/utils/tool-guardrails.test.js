import { describe, expect, it } from 'vitest';
import guardrailModule from '../../src/utils/tool-guardrails.js';

const { ToolGuardrails } = guardrailModule;

describe('ToolGuardrails hard-stop lifecycle', () => {
  it('blocks an identical failing call after failures accumulate across iterations', () => {
    const guardrails = new ToolGuardrails({ hardStopEnabled: true, exactFailureBlockAfter: 2 });
    const args = { command: 'npm test' };

    guardrails.startIteration();
    guardrails.record('bash', args, false);
    guardrails.startIteration();
    guardrails.record('bash', args, false);

    const decision = guardrails.beforeCall('bash', args);
    expect(decision.allowsExecution).toBe(false);
    expect(decision.shouldHalt).toBe(true);
    expect(decision.code).toBe('repeated_exact_failure_block');
  });

  it('reset starts a clean user turn', () => {
    const guardrails = new ToolGuardrails({ hardStopEnabled: true, exactFailureBlockAfter: 1 });
    guardrails.record('read_file', { path: '/missing' }, false);
    expect(guardrails.beforeCall('read_file', { path: '/missing' }).allowsExecution).toBe(false);
    guardrails.reset();
    expect(guardrails.beforeCall('read_file', { path: '/missing' }).allowsExecution).toBe(true);
  });
});
