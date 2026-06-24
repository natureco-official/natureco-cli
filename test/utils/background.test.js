import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_HOME = path.join(os.tmpdir(), `natureco-bg-test-${Date.now()}`);

describe('background tasks', () => {
  let mod;

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(TEST_HOME);
    vi.resetModules();
    if (!fs.existsSync(TEST_HOME)) {
      fs.mkdirSync(TEST_HOME, { recursive: true });
    }
    mod = require('../../src/utils/background');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(TEST_HOME)) {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  describe('createTask', () => {
    it('should create a task with defaults', () => {
      const task = mod.createTask({ message: 'hello world' });
      expect(task.id).toBeTruthy();
      expect(task.status).toBe('queued');
      expect(task.runtime).toBe('cli');
      expect(task.message).toBe('hello world');
      expect(task.createdAt).toBeTruthy();
      expect(task.botName).toBe('default');
      expect(task.notifyPolicy).toBe('done_only');
      expect(task.startedAt).toBeNull();
      expect(task.endedAt).toBeNull();
      expect(task.error).toBeNull();
    });

    it('should set a custom runtime', () => {
      const task = mod.createTask({ runtime: 'cron', message: 'cron job' });
      expect(task.runtime).toBe('cron');
    });

    it('should store metadata', () => {
      const task = mod.createTask({ message: 'meta', metadata: { foo: 'bar' } });
      expect(task.metadata.foo).toBe('bar');
    });
  });

  describe('getTask', () => {
    it('should return null for non-existent task', () => {
      expect(mod.getTask('nonexistent')).toBeNull();
    });

    it('should find a task by id', () => {
      const task = mod.createTask({ message: 'find me' });
      const found = mod.getTask(task.id);
      expect(found.id).toBe(task.id);
      expect(found.message).toBe('find me');
    });
  });

  describe('updateTask', () => {
    it('should set startedAt when transitioning to running', () => {
      const task = mod.createTask({ message: 'run' });
      const updated = mod.updateTask(task.id, { status: 'running' });
      expect(updated.startedAt).toBeTruthy();
      expect(updated.status).toBe('running');
    });

    it('should set endedAt and cleanupAfter on terminal status', () => {
      const task = mod.createTask({ message: 'finish' });
      const updated = mod.updateTask(task.id, { status: 'succeeded', result: 'done' });
      expect(updated.endedAt).toBeTruthy();
      expect(updated.cleanupAfter).toBeTruthy();
      expect(new Date(updated.cleanupAfter).getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null for non-existent id', () => {
      expect(mod.updateTask('no-such-id', { status: 'running' })).toBeNull();
    });

    it('should preserve startedAt if already set', () => {
      const task = mod.createTask({ message: 'preserve started' });
      const first = mod.updateTask(task.id, { status: 'running' });
      const startedAt = first.startedAt;

      const second = mod.updateTask(task.id, { status: 'running' });
      expect(second.startedAt).toBe(startedAt);
    });

    it('should not overwrite endedAt if already set', () => {
      const task = mod.createTask({ message: 'already ended' });
      const first = mod.updateTask(task.id, { status: 'succeeded' });
      const endedAt = first.endedAt;

      const second = mod.updateTask(task.id, { status: 'failed' });
      expect(second.endedAt).toBe(endedAt);
    });
  });

  describe('cancelTask', () => {
    it('should cancel a queued task', () => {
      const task = mod.createTask({ message: 'cancel me' });
      const cancelled = mod.cancelTask(task.id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('should return task if already terminal', () => {
      const task = mod.createTask({ message: 'already done' });
      mod.updateTask(task.id, { status: 'succeeded' });
      const result = mod.cancelTask(task.id);
      expect(result.status).toBe('succeeded');
    });

    it('should return null for non-existent task', () => {
      expect(mod.cancelTask('no-such-id')).toBeNull();
    });
  });

  describe('getTasksBySession', () => {
    it('should return tasks matching session key', () => {
      const task1 = mod.createTask({ message: 't1', requesterSessionKey: 'session-1' });
      const task2 = mod.createTask({ message: 't2', childSessionKey: 'session-1' });
      mod.createTask({ message: 't3', requesterSessionKey: 'session-2' });

      const results = mod.getTasksBySession('session-1');
      expect(results.length).toBe(2);
      expect(results.map(t => t.id)).toContain(task1.id);
      expect(results.map(t => t.id)).toContain(task2.id);
    });
  });

  describe('listTasks', () => {
    it('should filter by runtime', () => {
      mod.createTask({ runtime: 'cli', message: 'cli task' });
      mod.createTask({ runtime: 'subagent', message: 'agent task' });

      const cliTasks = mod.listTasks({ runtime: 'cli' });
      expect(cliTasks.length).toBe(1);
      expect(cliTasks[0].runtime).toBe('cli');
    });

    it('should filter by status', () => {
      mod.createTask({ message: 'queued task' });
      const runningTask = mod.createTask({ message: 'running task' });
      mod.updateTask(runningTask.id, { status: 'running' });

      const running = mod.listTasks({ status: 'running' });
      expect(running.length).toBe(1);

      const queued = mod.listTasks({ status: 'queued' });
      expect(queued.length).toBe(1);
    });

    it('should limit results', () => {
      mod.createTask({ message: 't1' });
      mod.createTask({ message: 't2' });
      mod.createTask({ message: 't3' });

      const limited = mod.listTasks({ limit: 2 });
      expect(limited.length).toBe(2);
    });
  });

  describe('auditTasks', () => {
    it('should find stale queued tasks', () => {
      mod.createTask({ message: 'stale' });

      const tasksFile = path.join(TEST_HOME, '.natureco', 'tasks.json');
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      tasks[0].createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      fs.writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

      const findings = mod.auditTasks();
      const stale = findings.find(f => f.code === 'stale_queued');
      expect(stale).toBeTruthy();
      expect(stale.severity).toBe('warn');
    });

    it('should find stale running tasks', () => {
      const task = mod.createTask({ message: 'stale running' });
      mod.updateTask(task.id, { status: 'running' });

      const tasksFile = path.join(TEST_HOME, '.natureco', 'tasks.json');
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      const idx = tasks.findIndex(t => t.id === task.id);
      tasks[idx].startedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
      fs.writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

      const findings = mod.auditTasks();
      const stale = findings.find(f => f.code === 'stale_running');
      expect(stale).toBeTruthy();
      expect(stale.severity).toBe('error');
    });

    it('should flag missing cleanup timestamps', () => {
      const task = mod.createTask({ message: 'no cleanup' });
      mod.updateTask(task.id, { status: 'succeeded' });

      const tasksFile = path.join(TEST_HOME, '.natureco', 'tasks.json');
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      const idx = tasks.findIndex(t => t.id === task.id);
      delete tasks[idx].cleanupAfter;
      fs.writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

      const findings = mod.auditTasks();
      const missing = findings.find(f => f.code === 'missing_cleanup');
      expect(missing).toBeTruthy();
    });

    it('should flag inconsistent timestamps', () => {
      const task = mod.createTask({ message: 'inconsistent' });
      mod.updateTask(task.id, { status: 'failed' });

      const tasksFile = path.join(TEST_HOME, '.natureco', 'tasks.json');
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      const idx = tasks.findIndex(t => t.id === task.id);
      tasks[idx].startedAt = new Date(Date.now() + 10000).toISOString();
      fs.writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

      const findings = mod.auditTasks();
      const inconsistent = findings.find(f => f.code === 'inconsistent_timestamps');
      expect(inconsistent).toBeTruthy();
    });
  });

  describe('maintenanceTasks', () => {
    it('should reconcile stale queued tasks as lost (dry-run)', () => {
      mod.createTask({ message: 'stale for maintenance' });
      const tasksFile = path.join(TEST_HOME, '.natureco', 'tasks.json');
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      tasks[0].createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      fs.writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

      const result = mod.maintenanceTasks(true);
      expect(result.reconciled).toBeGreaterThanOrEqual(1);

      const stillQueued = mod.getTask(tasks[0].id);
      expect(stillQueued.status).toBe('queued');
    });

    it('should reconcile stale queued tasks as lost (apply)', () => {
      const task = mod.createTask({ message: 'stale for apply' });
      const tasksFile = path.join(TEST_HOME, '.natureco', 'tasks.json');
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      tasks[0].createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      fs.writeFileSync(tasksFile, JSON.stringify(tasks), 'utf-8');

      mod.maintenanceTasks(false);
      const updated = mod.getTask(task.id);
      expect(updated.status).toBe('lost');
      expect(updated.endedAt).toBeTruthy();
    });
  });

  describe('getTaskSummary', () => {
    it('should return zeros for empty tasks', () => {
      const summary = mod.getTaskSummary();
      expect(summary.total).toBe(0);
      expect(summary.active).toBe(0);
      expect(summary.failures).toBe(0);
      expect(summary.byRuntime.cli).toBe(0);
    });

    it('should count tasks correctly', () => {
      mod.createTask({ runtime: 'cli', message: 't1' });
      const task2 = mod.createTask({ runtime: 'subagent', message: 't2' });
      mod.updateTask(task2.id, { status: 'running' });
      const task3 = mod.createTask({ runtime: 'cli', message: 't3' });
      mod.updateTask(task3.id, { status: 'running' });
      const task4 = mod.createTask({ runtime: 'cron', message: 't4' });
      mod.updateTask(task4.id, { status: 'failed' });

      const summary = mod.getTaskSummary();
      expect(summary.total).toBe(4);
      expect(summary.active).toBe(3);
      expect(summary.failures).toBe(1);
      expect(summary.byRuntime.cli).toBe(2);
      expect(summary.byRuntime.subagent).toBe(1);
      expect(summary.byRuntime.cron).toBe(1);
    });
  });

  describe('constants', () => {
    it('should export correct statuses', () => {
      expect(mod.TASK_STATUSES).toContain('queued');
      expect(mod.TASK_STATUSES).toContain('running');
      expect(mod.TASK_STATUSES).toContain('succeeded');
      expect(mod.TASK_STATUSES).toContain('failed');
      expect(mod.TASK_STATUSES).toContain('timed_out');
      expect(mod.TASK_STATUSES).toContain('cancelled');
      expect(mod.TASK_STATUSES).toContain('lost');
    });

    it('should export correct terminal statuses', () => {
      expect(mod.TERMINAL_STATUSES).toContain('succeeded');
      expect(mod.TERMINAL_STATUSES).toContain('failed');
      expect(mod.TERMINAL_STATUSES).toContain('cancelled');
      expect(mod.TERMINAL_STATUSES).not.toContain('queued');
    });

    it('should export runtime and notify types', () => {
      expect(mod.RUNTIME_TYPES).toContain('cli');
      expect(mod.RUNTIME_TYPES).toContain('acp');
      expect(mod.NOTIFY_POLICIES).toContain('silent');
    });
  });
});
