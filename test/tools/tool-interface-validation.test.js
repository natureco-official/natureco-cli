const { execFileSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

describe('tool runtime input validation', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([{}, { task: '' }, { task: '   ' }])('sub_agent rejects a missing/empty task without a provider request: %j', async params => {
    const request = vi.spyOn(https, 'request');
    const result = JSON.parse(await require('../../src/tools/sub_agent').execute(params));
    expect(result).toEqual({ success: false, error: 'task required' });
    expect(request).not.toHaveBeenCalled();
  });

  it('skill_view returns a structured error for missing input', async () => {
    const result = JSON.parse(await require('../../src/tools/skill_view').execute({}));
    expect(result).toEqual({ success: false, error: 'name required' });
  });

  it('skills_autoload returns a structured error for missing input', async () => {
    await expect(require('../../src/tools/skills_autoload').execute({}))
      .resolves.toEqual({ success: false, error: 'message required' });
  });

  it('memory_provider registers built-ins and performs file add/search end-to-end', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-memory-provider-'));
    const script = `
      const tool = require('./src/tools/memory_provider');
      (async () => {
        const status = await tool.execute({ action: 'status', userId: 'audit-proof' });
        const add = await tool.execute({ action: 'add', userId: 'audit-proof', content: 'provider proof marker' });
        const search = await tool.execute({ action: 'search', userId: 'audit-proof', content: 'proof marker' });
        const missing = await tool.execute({ action: 'status', provider: 'not-installed' });
        await tool.execute({ action: 'clear', userId: 'audit-proof' });
        process.stdout.write(JSON.stringify({ status, add, search, missing }));
      })().catch(error => { console.error(error); process.exit(1); });
    `;
    try {
      const stdout = execFileSync(process.execPath, ['-e', script], {
        cwd: path.join(__dirname, '..', '..'),
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, NATURECO_MEMORY_PROVIDER: '' },
        encoding: 'utf8',
      });
      const result = JSON.parse(stdout);
      expect(result.status).toMatchObject({ active: 'file', userId: 'audit-proof' });
      expect(result.status.available).toEqual(expect.arrayContaining(['file', 'mem0', 'supermemory']));
      expect(result.add).toMatchObject({ success: true, message: 'Memory added' });
      expect(result.search).toMatchObject({ success: true });
      expect(result.search.results).toEqual(expect.arrayContaining([
        expect.objectContaining({ content: 'provider proof marker' }),
      ]));
      expect(result.missing).toEqual({ success: false, error: 'Memory provider not available: not-installed' });
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
