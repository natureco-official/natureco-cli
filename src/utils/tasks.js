/**
 * tasks — Background task management (Claude Code: TaskCreate/TaskList/TaskStop)
 *
 * Tasks run as child processes with status tracking.
 * Tools: CreateTask, ListTasks, StopTask, GetTaskResult
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const TASKS_FILE = path.join(os.homedir(), '.natureco', 'tasks.json');

class TaskManager {
  constructor() {
    this.tasks = new Map();
    this._load();
  }

  create(command, opts = {}) {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const task = {
      id,
      command,
      status: 'running',
      createdAt: Date.now(),
      completedAt: null,
      exitCode: null,
      stdout: '',
      stderr: '',
      cwd: opts.cwd || process.cwd(),
    };
    this.tasks.set(id, task);
    this._save();

    const proc = spawn(command, [], {
      shell: true,
      cwd: task.cwd,
      timeout: opts.timeout || 300000,
      env: { ...process.env, ...opts.env },
    });

    proc.stdout.on('data', data => { task.stdout += data.toString(); });
    proc.stderr.on('data', data => { task.stderr += data.toString(); });
    proc.on('close', code => {
      task.status = code === 0 ? 'completed' : 'failed';
      task.exitCode = code;
      task.completedAt = Date.now();
      this._save();
    });
    proc.on('error', err => {
      task.status = 'failed';
      task.stderr += err.message;
      task.completedAt = Date.now();
      this._save();
    });

    task._process = proc;
    return { id, status: 'running' };
  }

  list() {
    return Array.from(this.tasks.values()).map(t => ({
      id: t.id,
      status: t.status,
      command: t.command.slice(0, 80),
      createdAt: t.createdAt,
      completedAt: t.completedAt,
    }));
  }

  get(id) {
    const task = this.tasks.get(id);
    if (!task) return null;
    return {
      id: task.id,
      command: task.command,
      status: task.status,
      stdout: task.stdout,
      stderr: task.stderr,
      exitCode: task.exitCode,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    };
  }

  stop(id) {
    const task = this.tasks.get(id);
    if (!task || task.status !== 'running') return { error: 'Task not found or not running' };
    if (task._process) {
      task._process.kill('SIGTERM');
      setTimeout(() => { if (task._process) task._process.kill('SIGKILL'); }, 5000);
    }
    task.status = 'stopped';
    task.completedAt = Date.now();
    this._save();
    return { id, status: 'stopped' };
  }

  _save() {
    try {
      const data = Array.from(this.tasks.values()).map(t => ({
        id: t.id, command: t.command, status: t.status,
        createdAt: t.createdAt, completedAt: t.completedAt,
        exitCode: t.exitCode, stdout: t.stdout, stderr: t.stderr,
      }));
      const dir = path.dirname(TASKS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2));
    } catch {}
  }

  _load() {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        for (const t of data) {
          this.tasks.set(t.id, { ...t, _process: null });
        }
      }
    } catch {}
  }
}

let _instance = null;
function getTaskManager() {
  if (!_instance) _instance = new TaskManager();
  return _instance;
}

module.exports = { TaskManager, getTaskManager };
