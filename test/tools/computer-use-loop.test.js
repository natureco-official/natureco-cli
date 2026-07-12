const { executeAction } = require('../../src/tools/computer_use_loop');

describe('computer_use_loop macOS actions', () => {
  it('exposes the action executor for platform regression coverage', () => {
    expect(typeof executeAction).toBe('function');
  });

  it('rejects an unknown action instead of reporting success', () => {
    expect(executeAction('not-real', {})).toEqual({ success: false, error: 'Unknown action: not-real' });
  });
});
