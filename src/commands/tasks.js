const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const F = require('../utils/format');
const { listTasks, getTask, cancelTask, auditTasks, maintenanceTasks, getTaskSummary, TASK_STATUSES, RUNTIME_TYPES } = require('../utils/background');
const { spawnSubAgent, spawnParallel, getStatus } = require('../utils/sub-agent');

function parseFlags(args) {
  return {
    json: args.includes('--json') || args.includes('-j'),
    apply: args.includes('--apply'),
    runtime: extractFlag(args, '--runtime'),
    status: extractFlag(args, '--status'),
    limit: parseInt(extractFlag(args, '--limit') || '50', 10),
    severity: extractFlag(args, '--severity'),
  };
}

function extractFlag(params, name) {
  const idx = params.indexOf(name);
  return idx >= 0 && idx + 1 < params.length ? params[idx + 1] : null;
}

const STATUS_ICONS = {
  queued: '⏳',
  running: '🔄',
  succeeded: '✅',
  failed: '❌',
  timed_out: '⏰',
  cancelled: '🚫',
  lost: '👻',
};

const STATUS_COLORS = {
  queued: chalk.yellow,
  running: chalk.cyan,
  succeeded: chalk.green,
  failed: chalk.red,
  timed_out: chalk.red,
  cancelled: chalk.gray,
  lost: chalk.magenta,
};

async function tasks(args) {
  const [action, ...params] = (args || []);
  const opts = parseFlags(params);

  if (!action || action === 'list') return listTasksHandler(opts);
  if (action === 'show') return showTaskHandler(params[0], opts);
  if (action === 'cancel') return cancelTaskHandler(params[0]);
  if (action === 'audit') return auditHandler(opts);
  if (action === 'maintenance') return maintenanceHandler(opts);
  if (action === 'flow' && params[0]) {
    const flowAction = params[0];
    const flowParams = params.slice(1);
    if (flowAction === 'list') return flowListHandler(parseFlags(flowParams));
    if (flowAction === 'show') return flowShowHandler(flowParams[0], parseFlags(flowParams));
    if (flowAction === 'cancel') return flowCancelHandler(flowParams[0]);
  }
  if (action === 'summary' || action === 'status') return summaryHandler(opts);
  if (action === 'notify') {
    const taskId = params[0];
    const notifyMsg = params.slice(1).join(' ');
    return notifyTaskHandler(taskId, notifyMsg);
  }
  if (action === 'delegate') return delegateHandler(params[0], params.slice(1).join(' '));
  if (action === 'delegate-parallel') return delegateParallelHandler(params.join(' '));
  if (action === 'sub-status') return subStatusHandler();

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco tasks [list|show|cancel|audit|maintenance|flow|summary|notify|delegate|delegate-parallel|sub-status]\n', '  Usage: natureco tasks [list|show|cancel|audit|maintenance|flow|summary|notify|delegate|delegate-parallel|sub-status]\n')));
  process.exit(1);
}

function listTasksHandler(opts) {
  const tasks = listTasks({ runtime: opts.runtime, status: opts.status, limit: opts.limit });

  if (opts.json) {
    console.log(JSON.stringify({ tasks, total: tasks.length, filters: { runtime: opts.runtime, status: opts.status } }, null, 2));
    return;
  }

  F.header('Background Tasks');

  if (tasks.length === 0) {
    F.meta(L('Hiç task bulunamadı.', 'No tasks found.'));
    if (opts.runtime) F.meta(L('Filtre: runtime=', 'Filter: runtime=') + opts.runtime);
    if (opts.status) F.meta(L('Filtre: status=', 'Filter: status=') + opts.status);
    return;
  }

  const rows = tasks.map(t => [
    t.id.slice(0, 12),
    (t.message || t.runtime || '').slice(0, 40),
    t.status,
    t.runtime || '—',
    getAgeString(t.createdAt)
  ]);
  F.table(['ID', 'Name', 'Status', 'Runtime', 'Time'], rows);

  const summary = getTaskSummary();
  F.meta(L('Toplam: ', 'Total: ') + tasks.length + L(' (gösterilen) | Aktif: ', ' (shown) | Active: ') + summary.active + L(' | Hata: ', ' | Errors: ') + summary.failures);
  F.meta(L('Filtre: --runtime <type> --status <status>', 'Filter: --runtime <type> --status <status>'));
  F.meta('JSON: natureco tasks list --json');
}

function showTaskHandler(id, opts) {
  if (!id) {
    F.error(L('Task ID gerekli', 'Task ID required'));
    F.meta(L('Kullanım: natureco tasks show <id>', 'Usage: natureco tasks show <id>'));
    process.exit(1);
  }

  const task = getTask(id);
  if (!task) {
    F.error(L('Task bulunamadı: ', 'Task not found: ') + id);
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  F.header('Task: ' + task.id);
  F.kv(L('Durum', 'Status'), task.status);
  F.kv('Runtime', task.runtime);
  F.kv('Bot', task.botName);
  if (task.message) F.kv(L('Mesaj', 'Message'), task.message);
  F.kv(L('Oluşturma', 'Created'), formatTime(task.createdAt));
  if (task.startedAt) F.kv(L('Başlangıç', 'Started'), formatTime(task.startedAt));
  if (task.endedAt) F.kv(L('Bitiş', 'Ended'), formatTime(task.endedAt));
  if (task.notifyPolicy) F.kv(L('Bildirim', 'Notification'), task.notifyPolicy);
  if (task.childSessionKey) F.kv(L('Çocuk', 'Child'), task.childSessionKey);
  if (task.runId) F.kv('Run ID', task.runId);

  if (task.result) {
    console.log('');
    F.kv(L('Sonuç', 'Result'), task.result);
  }
  if (task.error) {
    console.log('');
    F.kv(L('Hata', 'Error'), task.error);
  }
  if (task.cleanupAfter) {
    F.meta(L('Temizlik: ', 'Cleanup: ') + formatTime(task.cleanupAfter));
  }
  if (task.metadata && Object.keys(task.metadata).length > 0) {
    console.log('');
    F.meta('Metadata:');
    Object.entries(task.metadata).forEach(([k, v]) => F.meta(k + ': ' + v));
  }
}

function cancelTaskHandler(id) {
  if (!id) {
    F.error(L('Task ID gerekli', 'Task ID required'));
    F.meta(L('Kullanım: natureco tasks cancel <id>', 'Usage: natureco tasks cancel <id>'));
    process.exit(1);
  }

  const result = cancelTask(id);
  if (!result) {
    F.error(L('Task bulunamadı: ', 'Task not found: ') + id);
    process.exit(1);
  }

  if (result.status === 'cancelled') {
    F.success(L('Task iptal edildi: ', 'Task cancelled: ') + id);
  } else {
    F.warning(L('Task zaten terminal durumda: ', 'Task already in terminal state: ') + result.status);
  }
}

function auditHandler(opts) {
  const findings = auditTasks();

  if (opts.json) {
    console.log(JSON.stringify({ findings, total: findings.length }, null, 2));
    return;
  }

  F.header(L('Task Denetimi', 'Task Audit'));

  if (findings.length === 0) {
    F.success(L('Sorun bulunamadı.', 'No issues found.'));
    return;
  }

  let filtered = findings;
  if (opts.severity) {
    filtered = findings.filter(f => f.severity === opts.severity);
  }

  if (filtered.length === 0) {
    F.meta(L('Filtreye uygun bulgu yok (severity=', 'No findings match filter (severity=') + opts.severity + ')');
    return;
  }

  const rows = filtered.map(f => [
    f.id.slice(0, 12),
    f.code,
    f.severity,
    f.message.slice(0, 60)
  ]);
  F.table(['ID', 'Code', 'Severity', 'Message'], rows);

  F.meta(L('Toplam: ', 'Total: ') + filtered.length + L(' bulgu', ' findings'));
  F.meta(L('Bakım: natureco tasks maintenance --apply', 'Maintenance: natureco tasks maintenance --apply'));
}

function maintenanceHandler(opts) {
  F.header(L('Task Bakımı', 'Task Maintenance'));

  const dryRun = !opts.apply;
  const result = maintenanceTasks(dryRun);

  if (dryRun) {
    F.info(L('Kuru çalışma (--apply ile uygula)', 'Dry run (apply with --apply)'));
  }

  F.kv(L('Temizlenen', 'Pruned'), result.pruned);
  F.kv(L('Düzeltilen', 'Reconciled'), result.reconciled);
  F.kv(L('Etiketlenen', 'Labeled'), result.cleaned);
  F.kv(L('Kalan task', 'Remaining'), result.remaining);

  if (result.pruned > 0 || result.reconciled > 0 || result.cleaned > 0) {
    if (dryRun) {
      F.meta(L('Uygulamak için: natureco tasks maintenance --apply', 'To apply: natureco tasks maintenance --apply'));
    } else {
      F.success(L('Bakım uygulandı.', 'Maintenance applied.'));
    }
  } else {
    F.success(L('Bakım gerekmiyor.', 'No maintenance needed.'));
  }
}

function flowListHandler(opts) {
  const tasks = listTasks({ runtime: 'acp', limit: opts.limit || 50 });

  if (opts.json) {
    console.log(JSON.stringify({ flows: tasks, total: tasks.length }, null, 2));
    return;
  }

  F.header('Task Flow');

  if (tasks.length === 0) {
    F.meta(L('Task Flow kaydı yok.', 'No Task Flow records.'));
    return;
  }

  const rows = tasks.map(t => [
    t.id.slice(0, 12),
    t.status,
    t.message ? t.message.slice(0, 60) : '—'
  ]);
  F.table(['ID', 'Status', 'Message'], rows);

  F.meta(L('Toplam: ', 'Total: ') + tasks.length + ' flow');
}

function flowShowHandler(id, opts) {
  if (!id) {
    console.log(chalk.red(L('\n  ❌ Flow ID gerekli\n', '\n  ❌ Flow ID required\n')));
    process.exit(1);
  }
  return showTaskHandler(id, opts);
}

function flowCancelHandler(id) {
  if (!id) {
    console.log(chalk.red(L('\n  ❌ Flow ID gerekli\n', '\n  ❌ Flow ID required\n')));
    process.exit(1);
  }
  return cancelTaskHandler(id);
}

function summaryHandler(opts) {
  const summary = getTaskSummary();

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(L('\n  Task Özeti\n', '\n  Task Summary\n')));
  console.log(chalk.gray(L('  Aktif    : ', '  Active   : ')) + (summary.active > 0 ? chalk.yellow(summary.active) : chalk.green('0')));
  console.log(chalk.gray(L('  Hatalı   : ', '  Failed   : ')) + (summary.failures > 0 ? chalk.red(summary.failures) : chalk.green('0')));
  console.log(chalk.gray(L('  Toplam   : ', '  Total    : ')) + chalk.white(summary.total));
  console.log(chalk.gray(L('\n  Runtime Dağılımı', '\n  Runtime Distribution')));
  Object.entries(summary.byRuntime).forEach(([rt, count]) => {
    if (count > 0) console.log(chalk.gray(`    ${rt.padEnd(10)}: ${count}`));
  });
  console.log('');
}

function getAgeString(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}${L('s önce', 's ago')}`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}${L('dk önce', 'm ago')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}${L('sa önce', 'h ago')}`;
  const days = Math.floor(hr / 24);
  return `${days}${L('g önce', 'd ago')}`;
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleString(_gl() === 'en' ? 'en-US' : 'tr-TR');
}

function notifyTaskHandler(id, message) {
  if (!id) {
    F.error(L('Task ID gerekli', 'Task ID required'));
    F.meta(L('Kullanım: natureco tasks notify <id> [message]', 'Usage: natureco tasks notify <id> [message]'));
    process.exit(1);
  }
  const task = getTask(id);
  if (!task) {
    F.error(L('Task bulunamadı: ', 'Task not found: ') + id);
    process.exit(1);
  }
  F.header('Task Notification');
  F.kv('Task', id);
  F.kv('Message', message || '(default notification)');
  F.kv('Channel', task.notifyPolicy || 'done_only');
  F.success('Notification will be sent when task completes');
}

async function delegateHandler(type, task) {
  if (!type || !task) {
    F.error(L('Kullanım: natureco tasks delegate <type> <task>', 'Usage: natureco tasks delegate <type> <task>'));
    F.meta(L('Tipler: explore, general, review', 'Types: explore, general, review'));
    process.exit(1);
  }

  F.header('Sub-agent Delegate');
  F.kv('Type', type);
  F.kv('Task', task.slice(0, 80));

  try {
    const result = await spawnSubAgent(type, task);
    F.success(L('Sub-agent tamamlandı', 'Sub-agent completed'));
    F.divider();
    console.log(chalk.white(result.result));
    if (result.duration) {
      F.meta(`${L('Süre', 'Duration')}: ${(result.duration / 1000).toFixed(1)}s`);
    }
    if (result.usage) {
      F.meta(`Token: ${result.usage.prompt_tokens || result.usage.input_tokens || '?'} → ${result.usage.completion_tokens || result.usage.output_tokens || '?'}`);
    }
  } catch (err) {
    F.error(L('Sub-agent hatası: ', 'Sub-agent error: ') + err.message);
    process.exit(1);
  }
}

async function delegateParallelHandler(input) {
  if (!input) {
    F.error(L('Kullanım: natureco tasks delegate-parallel <type1> <task1> | <type2> <task2>', 'Usage: natureco tasks delegate-parallel <type1> <task1> | <type2> <task2>'));
    F.meta(L('Birden çok agent\'ı " | " (pipe) ile ayırın', 'Separate multiple agents with " | " (pipe)'));
    process.exit(1);
  }

  const parts = input.split(/\s+\|\s+/);
  if (parts.length < 2) {
    F.error(L('En az 2 agent belirtin, " | " ile ayırın', 'Specify at least 2 agents, separated by " | "'));
    process.exit(1);
  }

  const agents = parts.map(p => {
    const trimmed = p.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) throw new Error(`${L('Geçersiz agent', 'Invalid agent')}: "${trimmed}" (type + task ${L('gerekli', 'required')})`);
    return {
      type: trimmed.slice(0, spaceIdx),
      task: trimmed.slice(spaceIdx + 1).trim(),
    };
  });

  F.header('Parallel Sub-agents (' + agents.length + ')');
  agents.forEach(a => F.kv(a.type, a.task.slice(0, 60)));

  F.info(L('Çalıştırılıyor...', 'Running...'));

  const { results, failed } = await spawnParallel(agents);

  F.divider();

  results.forEach((r, i) => {
    const agent = agents[i];
    if (r.status === 'fulfilled') {
      F.success(`${agent.type} — ${L('tamamlandı', 'completed')} (${(r.value.duration / 1000).toFixed(1)}s)`);
    } else {
      F.error(`${agent.type} — ${L('hata', 'error')}: ${r.reason}`);
    }
  });

  if (failed.length > 0) {
    F.warning(`${failed.length}/${agents.length} agent ${L('başarısız', 'failed')}`);
  } else {
    F.success(L('Tüm agent' + (agents.length > 1 ? 'lar' : '') + ' tamamlandı', 'All agents completed'));
  }
}

function subStatusHandler() {
  const status = getStatus();

  if (status.total === 0) {
    F.header('Sub-agent Status');
    F.meta(L('Henüz sub-agent kaydı yok.', 'No sub-agent records yet.'));
    return;
  }

  F.header('Sub-agent Status');
  F.kv(L('Toplam', 'Total'), status.total);
  F.kv(L('Çalışan', 'Running'), String(status.running));
  F.kv(L('Tamamlanan', 'Completed'), String(status.completed));
  F.kv(L('Hatalı', 'Failed'), String(status.failed));

  if (status.agents.length > 0) {
    console.log('');
    const rows = status.agents.map(a => [
      a.id.slice(0, 10),
      a.type,
      a.status === 'completed' ? chalk.green('✓') : a.status === 'failed' ? chalk.red('✗') : chalk.cyan('⟳'),
      a.task.slice(0, 40),
      a.completedAt ? new Date(a.completedAt).toLocaleString(_gl() === 'en' ? 'en-US' : 'tr-TR') : '—',
    ]);
    F.table(['ID', 'Type', '', 'Task', 'Completed'], rows);
  }
}

module.exports = tasks;
