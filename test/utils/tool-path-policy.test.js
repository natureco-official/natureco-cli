const { assessToolPath, expandPath } = require('../../src/utils/tool-path-policy');

describe('tool path policy', () => {
  test('blocks credential reads and persistence writes', () => {
    expect(assessToolPath('read_file', { path: '~/.npmrc' }).allowed).toBe(false);
    expect(assessToolPath('write_file', { path: '~/.ssh/authorized_keys' }).allowed).toBe(false);
    expect(assessToolPath('edit_file', { path: '~/.aws/credentials' }).allowed).toBe(false);
  });

  test('allows ordinary project files and irrelevant tool paths', () => {
    expect(assessToolPath('read_file', { path: './src/app.js' }).allowed).toBe(true);
    expect(assessToolPath('list_dir', { path: '~/.ssh' }).allowed).toBe(true);
    expect(expandPath('~/project')).toMatch(/project$/);
  });
});
