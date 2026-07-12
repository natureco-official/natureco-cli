const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('./inquirer-wrapper');
const { executeThroughGateway } = require('./tool-execution-gateway');
const { checkPermission } = require('./permissions');
const { checkPreHooks, runPostHooks } = require('./tool-hooks');
const { loadToolManifest } = require('./tool-manifest');

// ── Spinner ───────────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

function startSpinner(label) {
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${chalk.gray(label)}`);
  }, 80);
  return timer;
}

function stopSpinner(timer, label, success = true) {
  clearInterval(timer);
  if (success) {
    process.stdout.write(`\r${chalk.green('✓')} ${chalk.gray(label)}\n`);
  } else {
    process.stdout.write(`\r${chalk.red('✗')} ${chalk.gray(label)}\n`);
  }
}

// ── Diff view ─────────────────────────────────────────────────────────────────
function showDiff(oldContent, newContent, filepath) {
  const oldLines = (oldContent || '').split('\n');
  const newLines = newContent.split('\n');
  console.log(chalk.gray(`\n  📄 ${filepath}`));
  newLines.forEach(line => {
    if (line && !oldLines.includes(line)) {
      console.log(chalk.green('  + ' + line));
    }
  });
  oldLines.forEach(line => {
    if (line && !newLines.includes(line)) {
      console.log(chalk.red('  - ' + line));
    }
  });
  console.log();
}

// ── Session stats (module-level counters) ─────────────────────────────────────
let filesChanged = 0;
let commandsRun = 0;

function getSessionStats() {
  return { filesChanged, commandsRun };
}

function resetSessionStats() {
  filesChanged = 0;
  commandsRun = 0;
}

// ── Load tools ────────────────────────────────────────────────────────────────
function loadTools() {
  return Object.fromEntries([...loadToolManifest()].map(([name, entry]) => [name, {
    ...entry.module,
    name: entry.name,
    description: entry.description,
    inputSchema: entry.inputSchema,
    execute: entry.execute,
  }]));
}

function getToolDefinitions() {
  const tools = loadTools();
  return Object.values(tools)
    .filter(t => t.name !== 'canvas')
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
}

// ── Onay gerektiren araçlar ───────────────────────────────────────────────────
// v5.43: shell_command da bash gibi onay tetikler (aksi halde onay/güvenlik
// akışını atlayan ikinci bir arbitrary-shell yolu olurdu).
// v5.51.1 GÜVENLİK: edit_file eklendi — write_file diff+onay isterken, aynı riski
// taşıyan hedefli değişiklik (edit_file) onaysız geçiyordu (SELF.md kendini-onarma
// + Tek Beyin kanal erişimiyle birleşince kritik).
function needsConfirmation(toolName, params) {
  const p = params || {};
  return (
    toolName === 'write_file' ||
    toolName === 'edit_file' ||
    toolName === 'structural_patch' ||
    ((toolName === 'bash' || toolName === 'shell_command') && /\b(rm|mv|cp|chmod|chown|dd|mkfs|truncate)\b/.test(p.command || ''))
  );
}

// ── Execute a single tool ─────────────────────────────────────────────────────
async function executeTool(toolName, params, opts = {}) {
  const safeParams = params ?? {};
  const tools = loadTools();
  const tool = tools[toolName];
  const agentMode = opts.agentMode || false;
  if (!tool) {
    return { success: false, error: `Tool '${toolName}' not found` };
  }

  // Configured permission rules and pre-hooks are mandatory in every origin.
  // Interactive callers may approve `ask`; API/headless/channel callers must
  // fail closed because they cannot prove that a human approved the action.
  const permission = checkPermission(toolName, safeParams);
  const hook = checkPreHooks(toolName, safeParams);
  const policy = evaluatePolicyDecision(permission, hook, opts);
  const policyAsk = policy.needsApproval ? { reason: policy.reason } : null;
  if (!policy.allowed) {
    return {
      success: false,
      error: policy.needsApproval
        ? `Etkileşimsiz çağrıda kullanıcı onayı gerekiyor: ${policy.reason || toolName}`
        : policy.reason || 'Araç güvenlik politikasıyla engellendi.',
    };
  }

  const label = `${toolName}${safeParams.path ? ' — ' + safeParams.path : safeParams.command ? ' — ' + safeParams.command : ''}`;

  // ── Onay mekanizması (dosya değiştiren araçlar ve tehlikeli bash) ──────────
  if (agentMode) {
    if (policyAsk || needsConfirmation(toolName, safeParams)) {
      if (toolName === 'write_file') {
        // Diff göster
        let oldContent = '';
        try { oldContent = fs.readFileSync(path.resolve(safeParams.path), 'utf-8'); } catch {}
        showDiff(oldContent, safeParams.content || '', safeParams.path);
      } else if (toolName === 'edit_file') {
        // v5.51.1 GÜVENLİK: edit_file onay kapsamına alındı — hedefli old→new
        // diff'i göster (write_file'daki diff'in edit_file muadili).
        console.log(chalk.gray(`\n  📄 ${safeParams.path}`));
        for (const line of String(safeParams.old_string || '').split('\n')) {
          console.log(chalk.red('  - ' + line));
        }
        for (const line of String(safeParams.new_string || '').split('\n')) {
          console.log(chalk.green('  + ' + line));
        }
        if (safeParams.replace_all) console.log(chalk.yellow('  (replace_all: TÜM eşleşmeler değişecek)'));
        console.log();
      } else {
        console.log(chalk.yellow(`\n  🖥️  Komut: ${chalk.white(safeParams.command)}\n`));
      }

      const confirmMsg =
        policyAsk ? `🛡️  ${policyAsk.reason || toolName + ' için izin gerekli'}` :
        toolName === 'write_file' ? `✏️  ${safeParams.path} dosyası değiştirilecek` :
        toolName === 'edit_file' ? `✏️  ${safeParams.path} dosyasında değişiklik yapılacak` :
        '⚠️  Bu komut çalıştırılacak';
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`  ${confirmMsg}. Onaylıyor musun?`),
        default: true,
      }]);

      if (!confirm) {
        console.log(chalk.gray('  İptal edildi.\n'));
        return { success: false, error: 'Kullanıcı iptal etti.' };
      }
    }
  }

  // ── Spinner ile çalıştır ──────────────────────────────────────────────────
  const spinner = startSpinner(label);
  const result = await executeThroughGateway({
    toolName,
    args: safeParams,
    resolveTool: () => tool,
    postProcess: ({ result: value }) => runPostHooks(toolName, safeParams, value),
    normalizeSuccess: value => value,
    normalizeError: error => ({ success: false, error }),
    allowSensitivePaths: !!opts.allowSensitivePaths,
  });
  stopSpinner(spinner, label, result.success !== false);

  // İstatistik güncelle
  if (result.success !== false) {
    if (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'structural_patch') filesChanged++;
    if (toolName === 'bash' || toolName === 'shell_command') commandsRun++;
  }

  return result;
}

function evaluatePolicyDecision(permission, hook, opts = {}) {
  const decisions = [permission, hook].filter(Boolean);
  const denied = decisions.find(decision => decision.action === 'deny');
  if (denied) return { allowed: false, needsApproval: false, reason: denied.reason };
  const asked = decisions.find(decision => decision.action === 'ask');
  if (!asked) return { allowed: true, needsApproval: false };
  if (opts.agentMode) return { allowed: true, needsApproval: true, reason: asked.reason };
  if (opts.approvalMode === 'preapproved') return { allowed: true, needsApproval: false };
  return { allowed: false, needsApproval: true, reason: asked.reason };
}

// ── Execute multiple tool calls (parallel for independent, sequential for others) ──
const PARALLEL_SAFE_TOOLS = new Set(['read_file', 'file_search', 'grep_search', 'web_search', 'web_readability', 'duckduckgo_search', 'exa_search', 'searxng_search', 'firecrawl', 'memory_search', 'memory']);

async function executeToolCalls(toolCalls, opts = {}) {
  if (!toolCalls || toolCalls.length === 0) return [];

  // Group: parallel-safe vs sequential
  const safe = toolCalls.filter(c => PARALLEL_SAFE_TOOLS.has(c.name));
  const sequential = toolCalls.filter(c => !PARALLEL_SAFE_TOOLS.has(c.name));

  const results = [];

  // Run parallel-safe tools concurrently
  if (safe.length > 0) {
    const safeResults = await Promise.all(safe.map(async (call) => {
      const result = await executeTool(call.name, call.input, opts);
      return { id: call.id, name: call.name, result };
    }));
    results.push(...safeResults);
  }

  // Run sequential tools one at a time
  for (const call of sequential) {
    const result = await executeTool(call.name, call.input, opts);
    results.push({ id: call.id, name: call.name, result });
  }

  return results;
}

module.exports = {
  loadTools,
  getToolDefinitions,
  executeTool,
  executeToolCalls,
  getSessionStats,
  resetSessionStats,
  needsConfirmation,
  evaluatePolicyDecision,
};
