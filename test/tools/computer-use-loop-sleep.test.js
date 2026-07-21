const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sleep } = require('../../src/tools/computer_use_loop');

describe('computer_use_loop delay mechanism', () => {
  it('sleep() is a pure-Node timer delay with no process dependency', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it('the source no longer depends on the Windows timeout command for delays', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/tools/computer_use_loop.js'), 'utf8');
    expect(source).not.toMatch(/timeout \/t/);
    expect(source).not.toContain("os.platform() === 'win32' ? 'timeout");
  });

  it('reproduces the real failure condition: works even with redirected/piped stdin', () => {
    // Windows' `timeout` command fails with "Input redirection is not supported" whenever the
    // calling process's stdin is piped/redirected rather than a real console handle — exactly
    // what happens here (spawnSync with stdin:'pipe'). This is the exact condition that broke
    // the old execSync('timeout /t 1 /nobreak >nul') call; the pure-Node sleep() has no such
    // dependency and must succeed identically here.
    const script = `
      const { sleep } = require(${JSON.stringify(path.resolve(__dirname, '../../src/tools/computer_use_loop.js'))});
      sleep(20).then(() => { process.stdout.write('SLEEP_OK'); });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('SLEEP_OK');
    expect(result.stderr).not.toMatch(/Input redirection is not supported|timeout/i);
  });
});
