/**
 * todo_write — upgraded to Claude Code TaskCreate semantics while
 * keeping the v5.6.x call shape working byte-for-byte. These tests
 * lock in both halves of the contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpHome;
let originalHome;
let mod;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-todo-'));
  originalHome = process.env.HOME;
  process.env.HOME = tmpHome;
  delete require.cache[require.resolve('../../src/tools/todo_write')];
  mod = require('../../src/tools/todo_write');
});

afterEach(() => {
  process.env.HOME = originalHome;
  if (tmpHome && fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe('backwards compatibility — legacy {content, action: done} shape', () => {
  it('action=add with {content, priority} still works', async () => {
    const r = await mod.execute({ action: 'add', content: 'eski stil', priority: 'high' });
    expect(r.success).toBe(true);
    expect(r.todo.subject).toBe('eski stil');
    expect(r.todo.priority).toBe('high');
    expect(r.todo.status).toBe('pending');
  });

  it('action=done (without id) errors as before', async () => {
    const r = await mod.execute({ action: 'done' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/id gerekli/);
  });

  it('action=done completes the task and sets completedAt', async () => {
    const a = await mod.execute({ action: 'add', content: 'biti yapılacak' });
    const r = await mod.execute({ action: 'done', id: a.todo.id });
    expect(r.success).toBe(true);
    expect(r.todo.status).toBe('completed');
    expect(r.todo.completedAt).toBeTruthy();
  });

  it('action=list returns counts and the pending subset (excludes deleted)', async () => {
    await mod.execute({ action: 'add', content: 'a' });
    await mod.execute({ action: 'add', content: 'b' });
    const r = await mod.execute({ action: 'list' });
    expect(r.total).toBe(2);
    expect(r.pending).toBe(2);
    expect(r.todos).toHaveLength(2);
  });

  it('action=clear empties the file', async () => {
    await mod.execute({ action: 'add', content: 'x' });
    const r = await mod.execute({ action: 'clear' });
    expect(r.cleared).toBe(1);
    const list = await mod.execute({ action: 'list' });
    expect(list.total).toBe(0);
  });

  it('reads legacy on-disk format and normalizes missing fields', async () => {
    fs.mkdirSync(path.join(tmpHome, '.natureco'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.natureco', 'todos.json'),
      JSON.stringify([
        { id: 'old1', content: 'eski format', status: 'pending', priority: 'low', createdAt: '2026-01-01T00:00:00Z' },
      ]),
    );
    const r = await mod.execute({ action: 'list' });
    expect(r.todos).toHaveLength(1);
    expect(r.todos[0].subject).toBe('eski format');
    expect(r.todos[0].blockedBy).toEqual([]);
    expect(r.todos[0].metadata).toEqual({});
  });
});

describe('new TaskCreate-style features', () => {
  it('action=create accepts subject + description + activeForm + owner', async () => {
    const r = await mod.execute({
      action: 'create',
      subject: 'Testleri çalıştır',
      description: 'vitest run + lint:errors-only',
      activeForm: 'Testleri çalıştırıyor',
      owner: 'claude',
      metadata: { sprint: '5.7.1' },
    });
    expect(r.success).toBe(true);
    expect(r.todo.activeForm).toBe('Testleri çalıştırıyor');
    expect(r.todo.owner).toBe('claude');
    expect(r.todo.metadata).toEqual({ sprint: '5.7.1' });
  });

  it('action=start transitions pending → in_progress', async () => {
    const a = await mod.execute({ action: 'add', content: 'ilk görev' });
    const r = await mod.execute({ action: 'start', id: a.todo.id });
    expect(r.success).toBe(true);
    expect(r.todo.status).toBe('in_progress');
  });

  it('action=start refuses to start a blocked task', async () => {
    const a = await mod.execute({ action: 'add', content: 'önce bu' });
    const b = await mod.execute({ action: 'add', content: 'sonra bu', blockedBy: [a.todo.id] });
    const r = await mod.execute({ action: 'start', id: b.todo.id });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/bloklu/);
  });

  it('completing the blocker unblocks the dependent', async () => {
    const a = await mod.execute({ action: 'add', content: 'önce' });
    const b = await mod.execute({ action: 'add', content: 'sonra', blockedBy: [a.todo.id] });
    await mod.execute({ action: 'done', id: a.todo.id });
    const r = await mod.execute({ action: 'start', id: b.todo.id });
    expect(r.success).toBe(true);
    expect(r.todo.status).toBe('in_progress');
  });

  it('blocks: A → B creates a reverse blockedBy entry on B', async () => {
    const b = await mod.execute({ action: 'add', content: 'engellenen' });
    const a = await mod.execute({ action: 'add', content: 'engelleyici', blocks: [b.todo.id] });
    const list = await mod.execute({ action: 'list' });
    const updatedB = list.todos.find(t => t.id === b.todo.id);
    expect(updatedB.blockedBy).toContain(a.todo.id);
  });

  it('action=update mutates fields without resetting others', async () => {
    const a = await mod.execute({ action: 'add', content: 'orijinal' });
    const r = await mod.execute({
      action: 'update',
      id: a.todo.id,
      subject: 'değiştirilmiş',
      priority: 'high',
      activeForm: 'değiştiriyor',
      metadata: { tag: 'urgent' },
    });
    expect(r.todo.subject).toBe('değiştirilmiş');
    expect(r.todo.priority).toBe('high');
    expect(r.todo.activeForm).toBe('değiştiriyor');
    expect(r.todo.metadata.tag).toBe('urgent');
    expect(r.todo.status).toBe('pending'); // not touched
  });

  it('metadata key set to null deletes that key', async () => {
    const a = await mod.execute({ action: 'add', content: 'x', metadata: { foo: 'bar', baz: 'qux' } });
    await mod.execute({ action: 'update', id: a.todo.id, metadata: { foo: null } });
    const g = await mod.execute({ action: 'get', id: a.todo.id });
    expect(g.todo.metadata).toEqual({ baz: 'qux' });
  });

  it('action=reopen flips completed → pending', async () => {
    const a = await mod.execute({ action: 'add', content: 'biti' });
    await mod.execute({ action: 'done', id: a.todo.id });
    const r = await mod.execute({ action: 'reopen', id: a.todo.id });
    expect(r.todo.status).toBe('pending');
    expect(r.todo.completedAt).toBeNull();
  });

  it('list annotates currently_blocked accurately', async () => {
    const a = await mod.execute({ action: 'add', content: 'önce' });
    const b = await mod.execute({ action: 'add', content: 'sonra', blockedBy: [a.todo.id] });
    const list = await mod.execute({ action: 'list' });
    const wantBlocked = list.todos.find(t => t.id === b.todo.id);
    expect(wantBlocked.currently_blocked).toBe(true);
    await mod.execute({ action: 'done', id: a.todo.id });
    const list2 = await mod.execute({ action: 'list' });
    const stillThere = list2.todos.find(t => t.id === b.todo.id);
    expect(stillThere.currently_blocked).toBe(false);
  });

  it('action=delete cleans up dangling blockedBy refs in other todos', async () => {
    const a = await mod.execute({ action: 'add', content: 'önce' });
    const b = await mod.execute({ action: 'add', content: 'sonra', blockedBy: [a.todo.id] });
    await mod.execute({ action: 'delete', id: a.todo.id });
    const g = await mod.execute({ action: 'get', id: b.todo.id });
    expect(g.todo.blockedBy).toEqual([]); // dangling ref purged
  });
});

describe('persistence', () => {
  it('uses atomic write (no .tmp residue in ~/.natureco/)', async () => {
    await mod.execute({ action: 'add', content: 'test' });
    const dir = path.join(tmpHome, '.natureco');
    const entries = fs.readdirSync(dir);
    expect(entries.filter(e => e.includes('.tmp'))).toHaveLength(0);
    expect(entries).toContain('todos.json');
  });
});

describe('module shape', () => {
  it('preserves the natureco tool interface', () => {
    expect(mod.name).toBe('todo_write');
    expect(typeof mod.execute).toBe('function');
    expect(mod.inputSchema.properties).toHaveProperty('activeForm');
    expect(mod.inputSchema.properties).toHaveProperty('blockedBy');
    expect(mod.inputSchema.properties.action.enum).toContain('start');
  });
});
