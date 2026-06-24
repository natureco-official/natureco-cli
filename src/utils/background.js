const fs = require('fs');
const path = require('path');
const os = require('os');

const TASKS_FILE = path.join(os.homedir(), '.natureco', 'tasks.json');
const TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_QUEUED_MS = 10 * 60 * 1000;
const STALE_RUNNING_MS = 30 * 60 * 1000;
const LOST_GRACE_MS = 5 * 60 * 1000;

const TASK_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled', 'lost'];
const TERMINAL_STATUSES = ['succeeded', 'failed', 'timed_out', 'cancelled', 'lost'];
const RUNTIME_TYPES = ['cli', 'cron', 'subagent', 'acp'];
const NOTIFY_POLICIES = ['done_only', 'state_changes', 'silent'];

function ensureDir() {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadTasks() {
  ensureDir();
  if (!fs.existsSync(TASKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  ensureDir();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

function createTask(data) {
  const tasks = loadTasks();
  const task = {
    id: generateId(),
    status: 'queued',
    runtime: data.runtime || 'cli',
    message: data.message || '',
    botName: data.botName || 'default',
    childSessionKey: data.childSessionKey || null,
    requesterSessionKey: data.requesterSessionKey || null,
    runId: data.runId || null,
    notifyPolicy: data.notifyPolicy || 'done_only',
    createdAt: nowISO(),
    startedAt: null,
    endedAt: null,
    error: null,
    result: null,
    cleanupAfter: null,
    metadata: data.metadata || {},
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

function updateTask(id, updates) {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const now = nowISO();
  if (updates.status === 'running' && !tasks[idx].startedAt) {
    updates.startedAt = now;
  }
  if (updates.status && TERMINAL_STATUSES.includes(updates.status) && !tasks[idx].endedAt) {
    updates.endedAt = now;
    updates.cleanupAfter = new Date(Date.now() + TASK_RETENTION_MS).toISOString();
  }

  tasks[idx] = { ...tasks[idx], ...updates };
  saveTasks(tasks);
  return tasks[idx];
}

function getTask(id) {
  const tasks = loadTasks();
  return tasks.find(t => t.id === id) || null;
}

function getTasksBySession(sessionKey) {
  const tasks = loadTasks();
  return tasks.filter(t => t.requesterSessionKey === sessionKey || t.childSessionKey === sessionKey);
}

function cancelTask(id) {
  const task = getTask(id);
  if (!task) return null;
  if (TERMINAL_STATUSES.includes(task.status)) return task;
  return updateTask(id, { status: 'cancelled' });
}

function listTasks(options = {}) {
  let tasks = loadTasks();

  if (options.runtime) {
    tasks = tasks.filter(t => t.runtime === options.runtime);
  }
  if (options.status) {
    tasks = tasks.filter(t => t.status === options.status);
  }
  if (options.limit) {
    tasks = tasks.slice(0, options.limit);
  }

  return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function auditTasks() {
  const tasks = loadTasks();
  const now = Date.now();
  const findings = [];

  tasks.forEach(t => {
    const createdAt = new Date(t.createdAt).getTime();

    if (t.status === 'queued' && (now - createdAt) > STALE_QUEUED_MS) {
      findings.push({ id: t.id, severity: 'warn', code: 'stale_queued', message: `${Math.round((now - createdAt) / 1000)}s boyunca kuyrukta bekliyor` });
    }

    if (t.status === 'running' && t.startedAt) {
      const startedAt = new Date(t.startedAt).getTime();
      if ((now - startedAt) > STALE_RUNNING_MS) {
        findings.push({ id: t.id, severity: 'error', code: 'stale_running', message: `${Math.round((now - startedAt) / 1000)}s boyunca çalışıyor` });
      }
    }

    if (t.status === 'lost') {
      const sev = t.cleanupAfter && new Date(t.cleanupAfter).getTime() > now ? 'warn' : 'error';
      findings.push({ id: t.id, severity: sev, code: 'lost', message: `Runtime backing kayboldu` });
    }

    if (TERMINAL_STATUSES.includes(t.status) && !t.cleanupAfter) {
      findings.push({ id: t.id, severity: 'warn', code: 'missing_cleanup', message: 'Terminal task has no cleanup timestamp' });
    }

    if (t.endedAt && t.startedAt && new Date(t.endedAt) < new Date(t.startedAt)) {
      findings.push({ id: t.id, severity: 'warn', code: 'inconsistent_timestamps', message: 'Bitiş zamanı başlangıçtan önce' });
    }
  });

  return findings;
}

function maintenanceTasks(dryRun = true) {
  const tasks = loadTasks();
  const now = Date.now();
  const stats = { pruned: 0, reconciled: 0, cleaned: 0 };

  const remaining = tasks.filter(t => {
    if (t.cleanupAfter && new Date(t.cleanupAfter).getTime() < now) {
      if (!dryRun) stats.pruned++;
      return dryRun;
    }

    if (t.status === 'queued' && (now - new Date(t.createdAt).getTime()) > LOST_GRACE_MS) {
      if (!dryRun) {
        t.status = 'lost';
        t.endedAt = nowISO();
        t.cleanupAfter = new Date(now + TASK_RETENTION_MS).toISOString();
      }
      stats.reconciled++;
    }

    if (t.status === 'running' && t.startedAt && (now - new Date(t.startedAt).getTime()) > (STALE_RUNNING_MS + LOST_GRACE_MS)) {
      if (!dryRun) {
        t.status = 'lost';
        t.endedAt = nowISO();
        t.cleanupAfter = new Date(now + TASK_RETENTION_MS).toISOString();
      }
      stats.reconciled++;
    }

    if (TERMINAL_STATUSES.includes(t.status) && !t.cleanupAfter) {
      if (!dryRun) {
        t.cleanupAfter = new Date(now + TASK_RETENTION_MS).toISOString();
      }
      stats.cleaned++;
    }

    return true;
  });

  if (!dryRun) saveTasks(remaining);
  return { ...stats, remaining: dryRun ? remaining.length : remaining.length };
}

function getTaskSummary() {
  const tasks = loadTasks();
  const active = tasks.filter(t => t.status === 'queued' || t.status === 'running').length;
  const failures = tasks.filter(t => ['failed', 'timed_out', 'lost'].includes(t.status)).length;
  const byRuntime = {};
  RUNTIME_TYPES.forEach(r => { byRuntime[r] = tasks.filter(t => t.runtime === r).length; });
  return { active, failures, byRuntime, total: tasks.length };
}

module.exports = {
  createTask,
  updateTask,
  getTask,
  getTasksBySession,
  cancelTask,
  listTasks,
  auditTasks,
  maintenanceTasks,
  getTaskSummary,
  TASK_STATUSES,
  TERMINAL_STATUSES,
  RUNTIME_TYPES,
  NOTIFY_POLICIES,
};
