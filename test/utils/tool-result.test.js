const { standardToolResult } = require('../../src/utils/tool-result');

describe('standard tool result', () => {
  test('normalizes success into the stable contract', () => {
    expect(standardToolResult({ success: true, output: 'ok' }, { durationMs: 3 }))
      .toEqual({ ok: true, data: { success: true, output: 'ok' }, error: null, warnings: [], artifacts: [], metrics: { durationMs: 3 } });
  });
  test('normalizes legacy errors', () => {
    expect(standardToolResult({ success: false, error: 'boom' })).toMatchObject({ ok: false, data: null, error: 'boom' });
  });
});
