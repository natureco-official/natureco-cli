const { spawn } = require('child_process');
const path = require('path');

const ASYNC_TASKS = new Map();

async function asyncDelegation(params) {
  const { action, taskId, prompt, toolset, model } = params;

  if (action === 'start') {
    if (!prompt) return { success: false, error: 'prompt gerekli' };
    const id = taskId || `async_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const naturecoBin = process.argv[1] || 'natureco';
    const args = ['ask', prompt];
    if (model) args.push('--model', model);
    if (toolset) args.push('--toolset', toolset);

    const child = spawn(process.execPath, [naturecoBin, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, NATURECO_ASYNC: '1' },
    });

    let output = '';
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => output += d);

    const task = { id, prompt, model, toolset, status: 'running', startedAt: new Date().toISOString(), child, output: '' };
    ASYNC_TASKS.set(id, task);

    child.on('close', (code) => {
      task.status = code === 0 ? 'completed' : 'failed';
      task.exitCode = code;
      task.output = output.slice(0, 5000);
      task.completedAt = new Date().toISOString();
    });

    child.unref();

    return { success: true, taskId: id, status: 'running', message: 'Async gorev baslatildi: ' + id };
  }

  if (action === 'status') {
    if (!taskId) {
      const tasks = [];
      for (const [id, t] of ASYNC_TASKS) {
        tasks.push({ id, status: t.status, prompt: t.prompt?.slice(0, 100), startedAt: t.startedAt, completedAt: t.completedAt });
      }
      return { success: true, tasks };
    }
    const task = ASYNC_TASKS.get(taskId);
    if (!task) return { success: false, error: 'Gorev bulunamadi: ' + taskId };
    return { success: true, taskId, status: task.status, output: task.output, startedAt: task.startedAt, completedAt: task.completedAt, exitCode: task.exitCode };
  }

  if (action === 'cancel') {
    if (!taskId) return { success: false, error: 'taskId gerekli' };
    const task = ASYNC_TASKS.get(taskId);
    if (!task) return { success: false, error: 'Gorev bulunamadi' };
    try { task.child.kill(); } catch {}
    task.status = 'cancelled';
    return { success: true, taskId, status: 'cancelled' };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (start, status, cancel)' };
}

module.exports = {
  name: 'async_delegation',
  description: 'Arkaplanda async gorev calistirma: start/status/cancel. Uzun suren islemler icin.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'start, status, cancel', enum: ['start', 'status', 'cancel'] },
      taskId: { type: 'string', description: 'Gorev ID (status/cancel icin gerekli)' },
      prompt: { type: 'string', description: '(start) Gorev promptu' },
      toolset: { type: 'string', description: '(start) Kullanilacak toolset' },
      model: { type: 'string', description: '(start) Model adi' },
    },
    required: ['action'],
  },
  async execute(params) { return await asyncDelegation(params); },
};
