const { loadToolManifest } = require('../../src/utils/tool-manifest');

describe('status command tool count', () => {
  it('derives the tool count from the manifest, matching the real executable tool count', async () => {
    const status = require('../../src/commands/status');
    const manifestCount = loadToolManifest().size;
    expect(manifestCount).toBe(91);

    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
      await status(['run']);
    } finally {
      console.log = originalLog;
    }
    const output = logs.join('\n');
    expect(output).toContain(`Tools            ${manifestCount}`);
    expect(output).not.toContain('Tools            92');
  });
});
