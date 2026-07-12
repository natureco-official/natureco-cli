import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SkillLifecycle } from '../../src/utils/skill-lifecycle.js';

const dirs = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const content = (name, body) => `---\nname: ${name}\ndescription: test skill\n---\n\n${body}\n`;

describe('skill lifecycle', () => {
  test('requires approval and passing validation before promotion', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-skills-')); dirs.push(root);
    const lifecycle = new SkillLifecycle(root);
    const staged = lifecycle.stage({ name: 'test-skill', content: content('test-skill', 'v1'), evidence: { count: 3 } });
    expect(staged.ok).toBe(true);
    await expect(lifecycle.promote(staged.candidate, { approved: false })).resolves.toMatchObject({ ok: false });
    await expect(lifecycle.promote(staged.candidate, { approved: true, userId: 'owner' }, async () => ({ ok: false }))).resolves.toMatchObject({ ok: false });
    const promoted = await lifecycle.promote(staged.candidate, { approved: true, userId: 'owner' }, async () => ({ ok: true, tests: 2 }));
    expect(promoted).toMatchObject({ ok: true, version: 1 });
  });

  test('versions updates and rolls back only with approval', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-skills-')); dirs.push(root);
    const lifecycle = new SkillLifecycle(root);
    const approve = { approved: true, userId: 'owner' };
    const first = lifecycle.stage({ name: 'test-skill', content: content('test-skill', 'v1') }).candidate;
    const second = lifecycle.stage({ name: 'test-skill', content: content('test-skill', 'v2') }).candidate;
    await lifecycle.promote(first, approve); await lifecycle.promote(second, approve);
    expect(fs.readFileSync(path.join(root, 'test-skill', 'SKILL.md'), 'utf8')).toContain('v2');
    expect(lifecycle.rollback('test-skill', 1, { approved: false }).ok).toBe(false);
    expect(lifecycle.rollback('test-skill', 1, approve)).toMatchObject({ ok: true, version: 1 });
    expect(fs.readFileSync(path.join(root, 'test-skill', 'SKILL.md'), 'utf8')).toContain('v1');
  });
});
