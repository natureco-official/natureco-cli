import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('CLI startup boundaries', () => {
  it('keeps help side-effect free and command modules lazy', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-help-'));
    roots.push(root);
    const bin = path.resolve(__dirname, '../bin/natureco.js');
    const result = spawnSync(process.execPath, [bin, 'help'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: root,
        USERPROFILE: root,
        NATURECO_NO_UPDATE_CHECK: '1',
        FORCE_COLOR: '0',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('NatureCo CLI');
    expect(fs.existsSync(path.join(root, '.natureco'))).toBe(false);

    const source = fs.readFileSync(bin, 'utf8');
    expect(source).toContain("const login = lazyCommand('../src/commands/login')");
    expect(source).not.toMatch(/const login = require\('\.\.\/src\/commands\/login'\)/);
  });
});
