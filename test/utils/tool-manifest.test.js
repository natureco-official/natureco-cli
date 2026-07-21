const { loadToolManifest } = require('../../src/utils/tool-manifest');
const fs = require('fs');
const path = require('path');

describe('single tool manifest', () => {
  test('contains executable tools with one schema shape', () => {
    const manifest = loadToolManifest({ refresh: true });
    expect(manifest.size).toBe(91);
    for (const [name, tool] of manifest) {
      expect(tool.name).toBe(name);
      expect(typeof tool.execute).toBe('function');
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  test('all executable built-in tool files export inputSchema directly', () => {
    const toolsDir = path.join(__dirname, '..', '..', 'src', 'tools');
    const files = fs.readdirSync(toolsDir).filter(file => file.endsWith('.js')).sort();
    const executable = [];
    for (const file of files) {
      const mod = require(path.join(toolsDir, file));
      if (typeof (mod.execute || mod.default?.execute) !== 'function') continue;
      executable.push(file);
      expect(Object.hasOwn(mod, 'inputSchema'), file).toBe(true);
      expect(Object.hasOwn(mod, 'parameters'), file).toBe(false);
    }
    expect(files).toHaveLength(92);
    expect(executable).toHaveLength(91);
  });

  test('workflow uses the manifest tool list and excludes internal helpers', () => {
    const manifest = loadToolManifest({ refresh: true });
    const names = require('../../src/tools/workflow')._internal.allToolNames();
    expect(names).toEqual(Array.from(manifest.keys()));
    expect(names).toHaveLength(91);
    expect(names).not.toContain('agentic-runner');
  });
});
