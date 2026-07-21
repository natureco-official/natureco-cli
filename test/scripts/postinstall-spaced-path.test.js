const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('postinstall.js', () => {
  it('runs the doctor check correctly when the repo/home path contains a space', () => {
    const spacedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco postinstall '));
    try {
      const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/postinstall.js')], {
        cwd: path.resolve(__dirname, '../..'),
        env: { ...process.env, HOME: spacedHome, USERPROFILE: spacedHome, NATURECO_SKIP_POSTINSTALL: undefined },
        encoding: 'utf8',
        timeout: 30000,
      });
      const output = (result.stdout || '') + (result.stderr || '');
      expect(result.status).toBe(0);
      expect(output).not.toMatch(/is not recognized|command not found|ENOENT/i);
      expect(output).toContain('Sistem kontrolu');
    } finally {
      fs.rmSync(spacedHome, { recursive: true, force: true });
    }
  });
});
