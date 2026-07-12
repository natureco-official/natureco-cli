const { analyzeTestFailure, AutoFixLoop, fingerprint } = require('../../src/utils/test-failure-analyzer');

describe('test failure analyzer', () => {
  test('classifies Vitest assertions and source locations', () => {
    const result = analyzeTestFailure('Vitest\nFAIL test/a.test.js\nAssertionError: expected 1 to be 2\n (src/a.js:12:4)\n1 failed', 1);
    expect(result).toMatchObject({ ok: false, framework: 'vitest', failedCount: 1 });
    expect(result.findings.some(item => item.type === 'assertion')).toBe(true);
    expect(result.locations[0]).toMatchObject({ file: 'src/a.js', line: 12, column: 4 });
  });

  test('normalizes volatile numbers in fingerprints', () => {
    expect(fingerprint('failed in 120ms line 12')).toBe(fingerprint('failed in 900ms line 99'));
  });
});

describe('automatic fix loop', () => {
  test('runs fix and stops after tests pass', async () => {
    let runs = 0;
    const loop = new AutoFixLoop({ maxAttempts: 3 });
    const result = await loop.run({
      runTests: async () => (++runs === 1 ? { exitCode: 1, output: 'AssertionError: expected a to be b' } : { exitCode: 0, output: 'all passed' }),
      proposeFix: async () => ({ applied: true, patchId: 'p1' }),
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });

  test('stops when the same failure repeats', async () => {
    const loop = new AutoFixLoop({ maxAttempts: 5 });
    const result = await loop.run({
      runTests: async () => ({ exitCode: 1, output: 'TypeError: broken at line 123' }),
      proposeFix: async () => ({ applied: true }),
    });
    expect(result).toMatchObject({ ok: false, stopped: 'no-progress' });
    expect(result.attempts).toHaveLength(2);
  });
});
