import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodingSession } from '../../src/utils/coding-session.js';

const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('coding session controls', () => {
  test('captures and atomically restores a changed file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-session-'));
    dirs.push(dir);
    const file = path.join(dir, 'a.txt');
    fs.writeFileSync(file, 'before');
    const session = new CodingSession();
    session.capture(file);
    fs.writeFileSync(file, 'after');
    expect(session.undo()).toMatchObject({ ok: true, path: file, restored: true });
    expect(fs.readFileSync(file, 'utf8')).toBe('before');
  });

  test('undo removes a file that did not exist before capture', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-session-'));
    dirs.push(dir);
    const file = path.join(dir, 'new.txt');
    const session = new CodingSession();
    session.capture(file);
    fs.writeFileSync(file, 'new');
    expect(session.undo()).toMatchObject({ ok: true, restored: false });
    expect(fs.existsSync(file)).toBe(false);
  });

  test('tracks retry input and summarizes risk', () => {
    const session = new CodingSession();
    session.rememberUserMessage('fix tests');
    session.rememberUserMessage('/compact');
    expect(session.retryMessage()).toBe('fix tests');
    expect(session.riskSummary({ name: 'bash', input: { command: 'rm old.txt' } }))
      .toEqual({ level: 'high', risks: ['command-execution', 'destructive'] });
  });
});
