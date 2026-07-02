/**
 * exec-approvals.json holds the command allowlist that natureco
 * auto-executes WITHOUT prompting. On a shared machine, default 0644
 * lets any local account read it (leaks automation surface) or — worse —
 * write to it before another `chown`/ACL fix lands. Pin owner-only.
 *
 * Skipped on Windows (POSIX mode bits don't apply).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const isPosix = process.platform !== 'win32';

let tmpHome;
let originalHome;
let originalUserProfile;
let approvals;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-approvals-'));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  // Windows'ta os.homedir() USERPROFILE okur — ikisini de override et
  process.env.USERPROFILE = tmpHome;
  delete require.cache[require.resolve('../../src/utils/approvals')];
  approvals = require('../../src/utils/approvals');
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (tmpHome && fs.existsSync(tmpHome)) {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

describe('approvals file permissions', () => {
  it.skipIf(!isPosix)('writes exec-approvals.json with mode 0o600 (owner-only)', () => {
    approvals.saveApprovals({ version: 1, defaults: { security: 'full', ask: 'off' }, agents: {} });
    const stat = fs.statSync(approvals.APPROVALS_FILE);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it.skipIf(!isPosix)('writes ~/.natureco dir with mode 0o700 (owner-only)', () => {
    approvals.saveApprovals({ version: 1 });
    const dir = path.dirname(approvals.APPROVALS_FILE);
    const stat = fs.statSync(dir);
    expect(stat.mode & 0o777).toBe(0o700);
  });

  it.skipIf(!isPosix)('tightens a pre-existing world-readable approvals file on next save', () => {
    // Simulate a legacy 0644 file from before the fix
    fs.mkdirSync(path.dirname(approvals.APPROVALS_FILE), { recursive: true });
    fs.writeFileSync(approvals.APPROVALS_FILE, '{"version":1,"agents":{}}', { mode: 0o644 });
    expect(fs.statSync(approvals.APPROVALS_FILE).mode & 0o777).toBe(0o644);
    approvals.saveApprovals({ version: 1, agents: { x: {} } });
    expect(fs.statSync(approvals.APPROVALS_FILE).mode & 0o777).toBe(0o600);
  });

  it('round-trips the same data after save+load', () => {
    const data = {
      version: 1,
      defaults: { security: 'allowlist', ask: 'on-miss' },
      agents: {
        'agent-1': {
          allowlist: [{ id: 'x', pattern: '^ls$', source: 'manual', lastUsedAt: '2026-06-25T00:00:00Z' }],
        },
      },
    };
    approvals.saveApprovals(data);
    expect(approvals.loadApprovals()).toEqual(data);
  });

  it('returns empty defaults when the file does not exist', () => {
    const got = approvals.loadApprovals();
    expect(got).toEqual({ version: 1, defaults: { security: 'full', ask: 'off' }, agents: {} });
  });

  it('returns empty defaults instead of throwing on a corrupted file', () => {
    fs.mkdirSync(path.dirname(approvals.APPROVALS_FILE), { recursive: true });
    fs.writeFileSync(approvals.APPROVALS_FILE, '{not json');
    expect(approvals.loadApprovals().version).toBe(1);
  });
});
