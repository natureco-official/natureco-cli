const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('./inquirer-wrapper');

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
  const toolsDir = path.join(__dirname, '..', 'tools');
  const tools = {};

  if (!fs.existsSync(toolsDir)) return tools;

  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const tool = require(path.join(toolsDir, file));
      if (tool.name && tool.execute) tools[tool.name] = tool;
    } catch (err) {
      console.error(chalk.red(`Failed to load tool ${file}:`, err.message));
    }
  }
  return tools;
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

// ── Execute a single tool ─────────────────────────────────────────────────────
async function executeTool(toolName, params, opts = {}) {
  const safeParams = params ?? {};
  const tools = loadTools();
  const tool = tools[toolName];
  const agentMode = opts.agentMode || false;

  if (!tool) {
    return { success: false, error: `Tool '${toolName}' not found` };
  }

  const label = `${toolName}${safeParams.path ? ' — ' + safeParams.path : safeParams.command ? ' — ' + safeParams.command : ''}`;

  // ── Onay mekanizması (write_file ve tehlikeli bash) ───────────────────────
  if (agentMode) {
    const needsConfirm =
      toolName === 'write_file' ||
      (toolName === 'bash' && /\b(rm|mv|cp|chmod|chown|dd|mkfs|truncate)\b/.test(safeParams.command || ''));

    if (needsConfirm) {
      if (toolName === 'write_file') {
        // Diff göster
        let oldContent = '';
        try { oldContent = fs.readFileSync(path.resolve(safeParams.path), 'utf-8'); } catch {}
        showDiff(oldContent, safeParams.content || '', safeParams.path);
      } else {
        console.log(chalk.yellow(`\n  🖥️  Komut: ${chalk.white(safeParams.command)}\n`));
      }

      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow(`  ${toolName === 'write_file' ? `✏️  ${safeParams.path} dosyası değiştirilecek` : '⚠️  Bu komut çalıştırılacak'}. Onaylıyor musun?`),
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
  try {
    const result = await tool.execute(safeParams);
    stopSpinner(spinner, label, result.success !== false);

    // İstatistik güncelle
    if (result.success !== false) {
      if (toolName === 'write_file') filesChanged++;
      if (toolName === 'bash') commandsRun++;
    }

    return result;
  } catch (error) {
    stopSpinner(spinner, label, false);
    return { success: false, error: error.message };
  }
}

// ── Execute multiple tool calls ───────────────────────────────────────────────
async function executeToolCalls(toolCalls, opts = {}) {
  const results = [];
  for (const call of toolCalls) {
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
};
