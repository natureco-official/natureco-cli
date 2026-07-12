const { loadToolManifest } = require('../../src/utils/tool-manifest');

describe('single tool manifest', () => {
  test('contains executable tools with one schema shape', () => {
    const manifest = loadToolManifest({ refresh: true });
    expect(manifest.size).toBeGreaterThan(50);
    for (const [name, tool] of manifest) {
      expect(tool.name).toBe(name);
      expect(typeof tool.execute).toBe('function');
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });
});
