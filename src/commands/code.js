const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');
const { execSync, execFileSync } = require('child_process');
const inquirer = require('../utils/inquirer-wrapper');
const TB = require('../utils/token-budget');
const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const { getApiKey, getConfig } = require('../utils/config');
const { getBots, getProviderConfig, startMcpServers, sendMessageOpenAICompatible, streamProviderCompletion } = require('../utils/api');
const { getMemoryPrompt, loadMemory } = require('../utils/memory');
const { getAgentsPrompt } = require('../utils/agents');
const { createSession, addMessageToSession } = require('../utils/sessions');
const { addToHistory } = require('../utils/history');
const { getToolDefinitions, executeTool } = require('../utils/tool-runner');
const { AgentCore } = require('../utils/agent-core');
const { CodingSession } = require('../utils/coding-session');

const agentCore = new AgentCore({ maxIterations: 10 });

let rl = null;

async function confirmAction(message) {
  return new Promise(resolve => {
    rl.question(chalk.yellow(`⚠ ${message}\n[? ${L('Devam edilsin mi', 'Continue')}? (Y/n) `), answer => {
      const confirmed = !answer || answer.toLowerCase() === 'y';
      console.log(chalk.gray(`  ✓ ${L('Devam edilsin mi', 'Continue')}? ${confirmed ? 'Yes' : 'No'}`));
      resolve(confirmed);
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sep = () => chalk.gray('─'.repeat(process.stdout.columns || 120));

function centerText(text) {
  const width = process.stdout.columns || 120;
  return text.split('\n').map(line => {
    const padding = Math.max(0, Math.floor((width - line.length) / 2));
    return ' '.repeat(padding) + line;
  }).join('\n');
}

const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

function startSpinner(label) {
  let i = 0;
  return setInterval(() => {
    process.stdout.write(`\r  ${chalk.cyan(SPINNER_FRAMES[i++ % SPINNER_FRAMES.length])} ${chalk.gray(label)}`);
  }, 80);
}

function stopSpinner(timer, label, success = true) {
  clearInterval(timer);
  process.stdout.write(`\r  ${success ? chalk.green('✓') : chalk.red('✗')} ${chalk.cyan(label)}\n`);
}

// ── Proje indexing ────────────────────────────────────────────────────────────
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', 'target', '.wrangler']);

function scanDir(dir, maxDepth, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && depth > 0) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const rel = depth === 0 ? entry.name : path.join(path.relative(dir.split(path.sep).slice(0, -depth).join(path.sep) || dir, dir), entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      const sub = scanDir(path.join(dir, entry.name), maxDepth, depth + 1);
      results.push(...sub.map(f => entry.name + '/' + f));
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

async function indexProject(projectDir) {
  const index = {
    dir: projectDir,
    files: [],
    type: 'unknown',
    mainFiles: [],
    packageJson: null,
    gitBranch: null,
    gitStatus: null,
  };

  // Dosyaları tara (max 2 seviye, ignore listesi hariç)
  index.files = scanDir(projectDir, 2);

  // Proje tipini tespit et
  const fileSet = new Set(index.files);
  if (fileSet.has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      index.packageJson = {
        name: pkg.name || path.basename(projectDir),
        version: pkg.version || '0.0.0',
        scripts: pkg.scripts || {},
        dependencies: Object.keys(pkg.dependencies || {}).slice(0, 15),
      };
      if (deps.react || deps['react-dom']) index.type = 'react';
      else if (deps.next) index.type = 'nextjs';
      else if (deps.vue) index.type = 'vue';
      else if (deps.express || deps.fastify || deps.koa) index.type = 'node-server';
      else index.type = 'node';
    } catch {}
  } else if (fileSet.has('requirements.txt') || index.files.some(f => f.endsWith('.py'))) {
    index.type = 'python';
  } else if (fileSet.has('Cargo.toml')) {
    index.type = 'rust';
  } else if (fileSet.has('go.mod')) {
    index.type = 'go';
  } else if (index.files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
    index.type = 'typescript';
  }

  // Ana dosyaları bul
  const mainCandidates = [
    'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
    'server.js', 'server.ts', 'src/index.js', 'src/index.ts',
    'src/main.ts', 'src/App.tsx', 'src/app.tsx',
  ];
  index.mainFiles = mainCandidates.filter(f => fileSet.has(f));

  // Git bilgisi
  try {
    index.gitBranch = execSync('git branch --show-current', { cwd: projectDir, stdio: 'pipe' }).toString().trim();
    const statusRaw = execSync('git status --short', { cwd: projectDir, stdio: 'pipe' }).toString().trim();
    index.gitStatus = statusRaw ? statusRaw.split('\n').slice(0, 5) : [];
  } catch {}

  return index;
}

function buildIndexPrompt(index) {
  const lines = [
    `Proje Bilgisi:`,
    `- Tip: ${index.type.toUpperCase()}`,
    `- Dizin: ${index.dir}`,
    `- Dosyalar (${index.files.length} toplam): ${index.files.slice(0, 40).join(', ')}`,
    `- Ana dosyalar: ${index.mainFiles.join(', ') || 'bulunamadı'}`,
  ];
  if (index.packageJson) {
    lines.push(`- Paket: ${index.packageJson.name} v${index.packageJson.version}`);
    const scripts = Object.keys(index.packageJson.scripts);
    if (scripts.length) lines.push(`- Scripts: ${scripts.join(', ')}`);
    if (index.packageJson.dependencies.length) lines.push(`- Bağımlılıklar: ${index.packageJson.dependencies.join(', ')}`);
  }
  if (index.gitBranch) {
    lines.push(`- Git branch: ${index.gitBranch}`);
    lines.push(`- Değişiklikler: ${index.gitStatus?.length ? index.gitStatus.join(', ') : 'temiz'}`);
  }
  return lines.join('\n');
}

// ── Proje hafızası ────────────────────────────────────────────────────────────
function getProjectMemoryPath(workDir) {
  return path.join(workDir, '.natureco', 'project.md');
}

function loadProjectMemory(workDir) {
  try {
    const p = getProjectMemoryPath(workDir);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  } catch {}
  return null;
}

async function generateSummary(messages, providerConfig) {
  const recent = messages.filter(m => m.role !== 'system').slice(-12);
  if (!recent.length) return L('Bu session boş geçti.', 'This session was empty.');
  const prompt = `${L("Bu kod session'ını 3-5 madde halinde Türkçe özetle. Ne yapıldı, hangi dosyalar değiştirildi, hangi sorunlar çözüldü", 'Summarize this code session in 3-5 bullet points in English. What was done, which files changed, which issues were solved')}:\n${JSON.stringify(recent).slice(0, 3000)}`;
  try {
    const result = await sendMessageOpenAICompatible(providerConfig, [{ role: 'user', content: prompt }], []);
    return result.content || L('Özet oluşturulamadı.', 'Could not generate summary.');
  } catch {
    return L('Özet oluşturulamadı.', 'Could not generate summary.');
  }
}

async function saveProjectMemory(messages, providerConfig, workDir) {
  const sp = startSpinner(L('Proje hafızası güncelleniyor...', 'Updating project memory...'));
  const summary = await generateSummary(messages, providerConfig);
  stopSpinner(sp, L('Proje hafızası güncellendi', 'Project memory updated'), true);
  const memPath = getProjectMemoryPath(workDir);
  const dir = path.dirname(memPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = fs.existsSync(memPath) ? fs.readFileSync(memPath, 'utf8') : L('# Proje Hafızası\n', '# Project Memory\n');
  const entry = `\n## ${new Date().toLocaleDateString('tr-TR')} — ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n${summary}\n`;
  fs.writeFileSync(memPath, existing + entry);
}

// ── Git helpers ───────────────────────────────────────────────────────────────
async function generateCommitMessage(diff, providerConfig) {
  try {
    const result = await sendMessageOpenAICompatible(providerConfig, [
      { role: 'system', content: L('Sen bir git commit mesajı üreticisin. Conventional Commits formatında (feat/fix/refactor/chore vb.) kısa ve açıklayıcı bir commit mesajı yaz. Sadece mesajı yaz, başka hiçbir şey yazma.', 'You are a git commit message generator. Write a short, descriptive commit message in Conventional Commits format (feat/fix/refactor/chore etc.). Write only the message, nothing else.') },
      { role: 'user', content: `${L('Bu diff için commit mesajı üret', 'Generate a commit message for this diff')}:\n\n${diff}` },
    ], []);
    return (result.content || 'chore: update files').trim().replace(/^["']|["']$/g, '');
  } catch {
    return 'chore: update files';
  }
}


async function streamMessage(providerConfig, messages, tools) {
  const result = await streamProviderCompletion(providerConfig, messages, tools);
  if (!result) return { text: '', toolCalls: [] };
  if (result.type === 'text') {
    return { text: result.content, toolCalls: [] };
  }
  const toolCalls = result?.message?.tool_calls?.map(tc => ({
    id: tc.id,
    name: tc.function.name,
    input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
  })) || [];
  return { text: result?.message?.content || '', toolCalls };
}

// ── Tool execution ────────────────────────────────────────────────────────────
const DANGEROUS = [/\brm\b/, /\brmdir\b/, /\bdelete\b/i, /\bdrop\b/i, /\btruncate\b/i];

async function runToolCall(toolCall, stats, dryRun = false, codingSession = null) {
  const guard = agentCore.assess({ name: toolCall.name, input: toolCall.input });
  if (guard.blocked) return { success: false, error: guard.reason || `blocked_by_guardrails: ${toolCall.name}` };
  const inputPreview = JSON.stringify(toolCall.input).slice(0, 60);

  const needsConfirm =
    toolCall.name === 'write_file' ||
    (toolCall.name === 'bash' && DANGEROUS.some(re => re.test(toolCall.input.command || '')));

  const risk = codingSession?.riskSummary(toolCall);
  if (risk && risk.level !== 'low') console.log(chalk.gray(`  Risk: ${risk.level} (${risk.risks.join(', ')})`));

  // Dry-run: write_file'ı engelle, diff göster
  if (dryRun && toolCall.name === 'write_file') {
    let oldContent = '';
    try { oldContent = fs.readFileSync(toolCall.input.path, 'utf-8'); } catch {}
    const newContent = toolCall.input.content || '';
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    console.log(chalk.gray(`\n  📄 ${toolCall.input.path}`));
    newLines.forEach(line => {
      if (line && !oldLines.includes(line)) console.log(chalk.green('  + ' + line));
    });
    oldLines.forEach(line => {
      if (line && !newLines.includes(line)) console.log(chalk.red('  - ' + line));
    });
    console.log(chalk.yellow(L('\n  ⚠️  DRY RUN — dosya değiştirilmedi\n', '\n  ⚠️  DRY RUN — no file changed\n')));
    stats.filesChanged++;
    stats.changedFiles.push(toolCall.input.path || '?');
    stats.toolCallCount++;
    return { success: true, output: L('[DRY RUN] Değişiklik gösterildi, uygulanmadı', '[DRY RUN] Change shown, not applied') };
  }

  if (needsConfirm) {
    console.log(chalk.yellow(`\n  ⚠️  ${toolCall.name}: ${inputPreview}`));
    const ok = await confirmAction(L('Devam edilsin mi?', 'Continue?'));
    if (!ok) {
      console.log(chalk.gray(L('  İptal edildi.\n', '  Cancelled.\n')));
      return { success: false, output: L('Kullanıcı iptal etti.', 'User cancelled.') };
    }
  }

  const spinner = startSpinner(`${toolCall.name}  ${inputPreview}`);
  if (!dryRun && codingSession && (toolCall.name === 'write_file' || toolCall.name === 'edit_file')) {
    codingSession.capture(toolCall.input.path);
  }
  const result = await executeTool(toolCall.name, toolCall.input);
  agentCore.record({ name: toolCall.name, input: toolCall.input }, result);
  stopSpinner(spinner, toolCall.name, result.success !== false);

  if (result.success !== false) {
    if (toolCall.name === 'write_file') {
      stats.filesChanged++;
      stats.changedFiles.push(toolCall.input.path || '?');
      console.log(chalk.green(`  ✓ ${toolCall.input.path} ${L('güncellendi', 'updated')}`));
      if (stats.changedFiles.length === 1) {
        console.log(chalk.gray(`  💡 git add . && /commit ${L('ile kaydet', 'to save')}`));
      }
    }
    if (toolCall.name === 'bash') stats.commandsRun++;
    stats.toolCallCount++;
  }

  return result;
}

// ── Test runner ───────────────────────────────────────────────────────────────
async function runTests(projectIndex, conversationMessages, tools, providerConfig, displayBotName, workDir) {
  const testScript = projectIndex.packageJson?.scripts?.test;
  if (!testScript || testScript.includes('no test')) return;

  const confirmed = await confirmAction(L('🧪 Testleri çalıştıralım mı?', '🧪 Run the tests?'));
  if (!confirmed) return;

  console.log(chalk.gray(L('\n  npm test çalışıyor...\n', '\n  npm test running...\n')));
  try {
    const output = execSync('npm test', {
      cwd: workDir, timeout: 30000, stdio: 'pipe',
    }).toString();
    console.log(chalk.green(L('  ✅ Testler geçti!\n', '  ✅ Tests passed!\n')));
  } catch (err) {
    const errOutput = (err.stdout?.toString() || err.message || '').slice(0, 500);
    console.log(chalk.red(L('  ❌ Test hatası:\n', '  ❌ Test error:\n')));
    console.log(chalk.gray('  ' + errOutput.split('\n').join('\n  ')));
    console.log();

    const fix = await confirmAction(L('Agent test hatasını düzeltsin mi?', 'Let the agent fix the test error?'));
    if (fix) {
      return `${L('Test hatası oluştu', 'A test error occurred')}:\n${errOutput}\n${L('Bu hatayı düzelt.', 'Fix this error.')}`;
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function code(targetFile, options = {}) {
  const codingSession = new CodingSession();
  const workDir = options.dir || process.cwd();
  const apiKey = getApiKey();
  const config = getConfig();
  const version = require('../../package.json').version;

  // ── Bot seçimi ──────────────────────────────────────────────────────────────
  let botList;
  try {
    botList = await getBots(apiKey || config.providerApiKey || '');
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }

  if (!botList?.bots?.length) {
    console.log(chalk.gray('No bots found.\n'));
    process.exit(1);
  }

  let bot;
  if (config.botName) {
    bot = botList.bots.find(b => b.name?.toLowerCase() === config.botName.toLowerCase());
  }
  if (!bot) {
    process.stdin.resume();
    const { selectedBot } = await inquirer.prompt([{
      type: 'list', name: 'selectedBot', message: L('Bot seçin:', 'Select bot:'),
      choices: botList.bots.map(b => ({ name: b.name, value: b.id })),
    }]);
    bot = botList.bots.find(b => b.id === selectedBot);
  }

  const mem = loadMemory(bot.id);
  const displayBotName = mem.botName || bot.name || 'NatureCo';
  const userName = mem.name || config.userName || 'User';
  const providerConfig = getProviderConfig();

  if (!providerConfig) {
    console.log(chalk.red(L('\n❌ Provider yapılandırılmamış. natureco config set providerUrl ...\n', '\n❌ Provider not configured. natureco config set providerUrl ...\n')));
    process.exit(1);
  }

  const shortModel = providerConfig.model.split('/').pop().split('-').slice(0, 3).join('-');

  // ── Proje indexing ───────────────────────────────────────────────────────────
  const indexSpinner = startSpinner(L('Proje indexleniyor...', 'Indexing project...'));
  const projectIndex = await indexProject(workDir);
  stopSpinner(indexSpinner, `${projectIndex.type.toUpperCase()} ${L('projesi', 'project')} — ${projectIndex.files.length} ${L('dosya', 'files')}`, true);

  // ── Sistem prompt ────────────────────────────────────────────────────────────
  const agentsPrompt = getAgentsPrompt();
  const memoryPrompt = getMemoryPrompt(bot.id);
  const indexPrompt = buildIndexPrompt(projectIndex);

  let systemPrompt = (_gl() === 'en' ? `You are the NatureCo Code Agent — a powerful AI coding assistant.
Actually work in the user's project: read files, change them, run commands.
ALWAYS explain every step in English. Say what you'll do before making changes.
Catch and fix errors. Give a summary when done.
User: ${userName}

${indexPrompt}` : `Sen NatureCo Code Agent'sın — güçlü bir AI coding asistanı.
Kullanıcının projesinde gerçekten çalış: dosyaları oku, değiştir, komutları çalıştır.
Her adımı Türkçe açıkla. Değişiklik yapmadan önce ne yapacağını söyle.
Hataları yakala ve düzelt. İş bitince özet sun.
Kullanıcı: ${userName}

${indexPrompt}`);

  if (agentsPrompt) systemPrompt += `\n\n## Project Instructions\n${agentsPrompt}`;
  if (memoryPrompt) systemPrompt += '\n\n' + memoryPrompt;

  // ── Proje hafızası ────────────────────────────────────────────────────────
  const projectMemory = loadProjectMemory(workDir);
  if (projectMemory) {
    systemPrompt += `\n\n## Proje Geçmişi (.natureco/project.md)\n${TB.trimProjectMemory(projectMemory)}`;
  }

  // Hedef dosya varsa context'e ekle
  if (targetFile) {
    try {
      const content = fs.readFileSync(path.resolve(targetFile), 'utf-8');
      systemPrompt += `\n\n## ${L('Odak Dosyası', 'Focus File')}: ${targetFile}\n\`\`\`\n${TB.trimFileContent(content)}\n\`\`\``;
    } catch {
      console.log(chalk.yellow(`  ⚠️  ${targetFile} ${L('okunamadı', 'could not be read')}\n`));
    }
  }

  // ── Session ──────────────────────────────────────────────────────────────────
  const session = createSession(bot.id, bot.name);
  const conversationMessages = [{ role: 'system', content: systemPrompt }];
  const stats = { filesChanged: 0, commandsRun: 0, toolCallCount: 0, messageCount: 0, changedFiles: [] };

  await startMcpServers().catch(() => {});

  const localTools = getToolDefinitions();
  const tools = localTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));

  // ── Header ──────────────────────────────────────────────────────────────────
  console.clear();
  const codeLogo = [
    '███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗',
    '████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔════╝ ██╔═══██╗',
    '██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║      ██║   ██║',
    '██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║      ██║   ██║',
    '██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╗ ╚██████╔╝',
    '╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝',
    '',
    '█▀▀ █▀█ █▀▄ █▀▀',
    '█▄▄ █▄█ █▄▀ ██▄',
  ].join('\n');
  console.log(centerText(chalk.green(codeLogo)));
  console.log();
  console.log(centerText(chalk.cyan(`(\\_/)  ${displayBotName} ${L('hazır', 'ready')}`) + chalk.gray(`  ·  v${version}`)));
  console.log(sep());
  console.log(centerText(chalk.gray(`📁 ${projectIndex.type.toUpperCase()} ${L('projesi', 'project')}  ·  ${projectIndex.files.length} ${L('dosya', 'files')}`)));
  if (projectIndex.gitBranch) {
    const changes = projectIndex.gitStatus?.length || 0;
    console.log(centerText(chalk.gray(`🌿 ${projectIndex.gitBranch}  ·  ${changes} ${L('değişiklik', 'changes')}`)));
  }
  if (targetFile) console.log(centerText(chalk.gray(`📄 ${targetFile}`)));
  if (projectMemory) console.log(centerText(chalk.gray(`📋 ${L('Proje hafızası yüklendi', 'Project memory loaded')}`)));
  console.log(centerText(chalk.gray(`${shortModel}  ·  /help  ·  Ctrl+C ${L('çıkış', 'exit')}`)));
  console.log(sep());
  console.log();

  // ── Session özeti ─────────────────────────────────────────────────────────
  function showSummary() {
    const w = process.stdout.columns || 120;
    console.log(chalk.gray('\n' + '─'.repeat(w)));
    console.log(chalk.gray(L('  Agent Session Özeti', '  Agent Session Summary')));
    if (options.dryRun) console.log(chalk.yellow(L('  ⚠️  DRY RUN — hiçbir dosya değiştirilmedi', '  ⚠️  DRY RUN — no files changed')));
    console.log(chalk.gray('─'.repeat(w)));
    console.log(`  ${chalk.green('✓')} ${stats.filesChanged} ${L('dosya değiştirildi', 'files changed')}`);
    console.log(`  ${chalk.green('✓')} ${stats.commandsRun} ${L('komut çalıştırıldı', 'commands run')}`);
    console.log(`  ${chalk.green('✓')} ${stats.toolCallCount} ${L('tool çağrısı yapıldı', 'tool calls made')}`);
    console.log(`  ${chalk.cyan('◉')} ${stats.messageCount} ${L('mesaj', 'messages')}`);
    if (stats.changedFiles.length > 0) {
      console.log();
      console.log(chalk.cyan(`  📝 ${L('Değiştirilen dosyalar', 'Changed files')} (${stats.changedFiles.length}):`));
      stats.changedFiles.forEach(f => console.log(chalk.white(`     ${f}`)));
    }
    console.log(chalk.gray('─'.repeat(w)));
    console.log();
  }

  // ── Komut çalıştır + hata döngüsü ───────────────────────────────────────────
  async function runAndFix(cmd) {
    console.log(chalk.gray(`\n  ▶ ${cmd} ${L('çalıştırılıyor...', 'running...')}\n`));
    try {
      const output = execSync(cmd, {
        cwd: workDir, timeout: 30000, stdio: 'pipe',
      }).toString();
      console.log(chalk.green(L('  ✓ Başarılı:', '  ✓ Success:')));
      console.log(chalk.gray('  ' + output.slice(0, 500).split('\n').join('\n  ')));
      console.log();
    } catch (err) {
      const errorOutput = (err.stderr?.toString() || err.stdout?.toString() || err.message || '').slice(0, 500);
      console.log(chalk.red(L('  ✗ Hata:', '  ✗ Error:')));
      console.log(chalk.gray('  ' + errorOutput.split('\n').join('\n  ')));
      console.log();

      const fix = await confirmAction(L('Hatayı otomatik düzeltmemi ister misin?', 'Want me to auto-fix the error?'));
      if (fix) {
        const fixMessage = `${L('Şu komut çalıştırıldı', 'This command was run')}: ${cmd}\n${L('Hata oluştu', 'An error occurred')}:\n${errorOutput}\n${L('Bu hatayı analiz et ve düzelt.', 'Analyze and fix this error.')}`;
        console.log(chalk.cyan(L('\n  Düzeltiliyor...\n', '\n  Fixing...\n')));
        await handleMessage(fixMessage);
      }
    }
  }

  // ── Mesaj gönder + tool loop ──────────────────────────────────────────────
  async function handleMessage(userMessage) {
    userMessage = userMessage.trim();
    if (!userMessage) return;

    if (userMessage.startsWith('/')) {
      const [cmd] = userMessage.slice(1).split(' ');
      switch (cmd.toLowerCase()) {
        case 'help':
          console.log(chalk.yellow(L('Code Agent Komutları:', 'Code Agent Commands:')));
          [
            ['/clear',   L('Ekranı temizle', 'Clear the screen')],
            ['/summary', L('Session özetini göster ve kaydet', 'Show and save session summary')],
            ['/memory',  L('Proje hafızasını göster', 'Show project memory')],
            ['/done',    L('Bitir ve özet göster', 'Finish and show summary')],
            ['/index',   L('Projeyi yeniden indexle', 'Re-index the project')],
            ['/run <cmd>',L('Komutu çalıştır, hata varsa düzelt', 'Run command, fix errors if any')],
            ['/test',    L('Testleri çalıştır, hata varsa düzelt', 'Run tests, fix errors if any')],
            ['/git',     L('Git durumu ve son commitler', 'Git status and recent commits')],
            ['/commit',  L('Staged değişiklikleri AI ile commit et', 'Commit staged changes with AI')],
            ['/undo',    L('Son dosya değişikliğini geri al', 'Undo the last file change')],
            ['/retry',   L('Son isteği yeniden çalıştır', 'Retry the last request')],
            ['/compact', L('Konuşma bağlamını sıkıştır', 'Compact conversation context')],
            ['/help',    L('Bu yardım', 'This help')],
          ].forEach(([c, d]) => console.log('  ' + chalk.cyan(c.padEnd(12)) + chalk.gray(d)));
          console.log(chalk.gray('  Ctrl+C'.padEnd(14) + L('Çıkış', 'Exit')));
          console.log();
          return;
        case 'clear':
          console.clear();
          return;
        case 'undo': {
          const undone = codingSession.undo();
          console.log(undone.ok ? chalk.green(`  ✓ ${undone.path}`) : chalk.yellow(`  ${undone.error}`));
          return;
        }
        case 'compact': {
          const compacted = codingSession.compact(conversationMessages);
          conversationMessages.splice(0, conversationMessages.length, ...compacted.messages);
          console.log(chalk.green(`  ✓ Context compacted: ${compacted.before} → ${compacted.after}`));
          return;
        }
        case 'retry': {
          const previous = codingSession.retryMessage();
          if (!previous) console.log(chalk.yellow(L('  Tekrarlanacak istek yok.', '  No request to retry.')));
          else await handleMessage(previous);
          return;
        }
        case 'summary':
        case 'done': {
          const sum = await generateSummary(conversationMessages, providerConfig);
          console.log(chalk.yellow(L('\n  📝 Session Özeti:', '\n  📝 Session Summary:')));
          console.log(chalk.white('  ' + sum.split('\n').join('\n  ')));
          console.log();
          showSummary();
          if (cmd === 'done') process.exit(0);
          return;
        }
        case 'memory': {
          const mem = loadProjectMemory();
          if (mem) {
            console.log(chalk.yellow(L('\n  📋 Proje Hafızası:', '\n  📋 Project Memory:')));
            console.log(chalk.gray('  ' + mem.slice(0, 1500).split('\n').join('\n  ')));
          } else {
            console.log(chalk.gray(L('\n  Henüz proje hafızası yok. /done ile kaydet.\n', '\n  No project memory yet. Save with /done.\n')));
          }
          return;
        }
        case 'index': {
          const sp = startSpinner(L('Proje yeniden indexleniyor...', 'Re-indexing project...'));
          const newIndex = await indexProject(workDir);
          stopSpinner(sp, `${newIndex.files.length} ${L('dosya indexlendi', 'files indexed')}`, true);
          // Sistem prompt'u güncelle
          conversationMessages[0].content = conversationMessages[0].content.replace(
            /Proje Bilgisi:[\s\S]*?(?=\n\n|$)/,
            buildIndexPrompt(newIndex)
          );
          return;
        }
        case 'run': {
          const runCmd = userMessage.slice(4).trim() || 'node index.js';
          await runAndFix(runCmd);
          return;
        }
        case 'test': {
          const testCmd = projectIndex.packageJson?.scripts?.test
            ? 'npm test'
            : projectIndex.type === 'python' ? 'python -m pytest' : null;
          if (!testCmd) {
            console.log(chalk.red(L('  Test komutu bulunamadı.\n', '  Test command not found.\n')));
            return;
          }
          await runAndFix(testCmd);
          return;
        }
        case 'git': {
          try {
            const status = execSync('git status --short', { cwd: workDir, stdio: 'pipe' }).toString().trim();
            const log = execSync('git log --oneline -5', { cwd: workDir, stdio: 'pipe' }).toString().trim();
            console.log(chalk.yellow(L('\n  Git Durumu:', '\n  Git Status:')));
            console.log(status ? chalk.gray('  ' + status.split('\n').join('\n  ')) : chalk.gray(L('  temiz', '  clean')));
            console.log(chalk.yellow(L('\n  Son Commitler:', '\n  Recent Commits:')));
            console.log(chalk.gray('  ' + log.split('\n').join('\n  ')));
            console.log();
          } catch (e) {
            console.log(chalk.red(L('  Git bulunamadı veya bu dizin bir git repo değil.\n', '  Git not found or this is not a git repo.\n')));
          }
          return;
        }
        case 'commit': {
          try {
            const diff = execSync('git diff --staged', { cwd: workDir, stdio: 'pipe' }).toString();
            if (!diff.trim()) {
              console.log(chalk.red(L('\n  Staged değişiklik yok.', '\n  No staged changes.')));
              console.log(chalk.gray(L('  Önce: git add .\n', '  First: git add .\n')));
              return;
            }
            const sp = startSpinner(L('Commit mesajı üretiliyor...', 'Generating commit message...'));
            const commitMsg = await generateCommitMessage(diff.slice(0, 2000), providerConfig);
            stopSpinner(sp, L('Commit mesajı hazır', 'Commit message ready'), true);
            console.log(chalk.cyan(`\n  ${L('Önerilen', 'Suggested')}: ${chalk.white(commitMsg)}\n`));
            const ok = await confirmAction(L('Commit edilsin mi?', 'Commit?'));
            if (ok) {
              execFileSync('git', ['commit', '-m', commitMsg], { cwd: workDir, stdio: 'pipe' });
              console.log(chalk.green(L('  ✓ Commit yapıldı!\n', '  ✓ Committed!\n')));
            } else {
              console.log(chalk.gray(L('  İptal edildi.\n', '  Cancelled.\n')));
            }
          } catch (e) {
            console.log(chalk.red(`  ${L('Git hatası', 'Git error')}: ${e.message}\n`));
          }
          return;
        }
        default:
          console.log(chalk.red(`${L('Bilinmeyen komut', 'Unknown command')}: /${cmd}\n`));
          return;
      }
    }

    stats.messageCount++;
    codingSession.rememberUserMessage(userMessage);
    console.log(chalk.white('You  ') + userMessage);
    conversationMessages.push({ role: 'user', content: userMessage });

    const prevFilesChanged = stats.filesChanged;

    // ── Streaming + tool loop (max 20 iter) ──────────────────────────────────
    let iter = 0;
    while (iter < 20) {
      iter++;

      let streamResult;
      try {
        process.stdout.write(chalk.cyan(`${displayBotName}  `));
        streamResult = await streamMessage(providerConfig, conversationMessages, tools);
      } catch (err) {
        console.log(chalk.red(`\nError: ${err.message}\n`));
        conversationMessages.pop();
        return;
      }

      if (!streamResult) {
        console.log(chalk.red('\nNo response received\n'));
        conversationMessages.pop();
        return;
      }

      const assistantMsg = { role: 'assistant', content: streamResult.text || '' };
      if (streamResult.toolCalls?.length) {
        assistantMsg.tool_calls = streamResult.toolCalls.map(tc => ({
          id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }));
      }
      conversationMessages.push(assistantMsg);

      if (!streamResult.toolCalls?.length) {
        if (!streamResult.text) {
          console.log(chalk.yellow(L('\n  ⚠️ Model cevap vermedi, tekrar deneyin.\n', '\n  ⚠️ Model did not respond, try again.\n')));
        }
        break;
      }

      console.log(chalk.yellow(`\n🔧 ${streamResult?.toolCalls?.length ?? 0} ${L('tool çalıştırılıyor...', 'running tools...')}\n`));

      for (let ti = 0; ti < streamResult.toolCalls.length; ti++) {
        const toolCall = streamResult.toolCalls[ti];
        const result = await runToolCall(toolCall, stats, options.dryRun, codingSession);
        const resultStr = result.success !== false
          ? (result.output || JSON.stringify(result))
          : `${L('Hata', 'Error')}: ${result.error}`;

        const matchedId = assistantMsg.tool_calls?.[ti]?.id || toolCall.id;
        conversationMessages.push({
          role: 'tool',
          tool_call_id: matchedId,
          name: toolCall.name,
          content: resultStr.slice(0, 3000),
        });
      }

      console.log();
    }

    try {
      const lastAssistant = [...conversationMessages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant?.content) {
        addToHistory(bot.id, userMessage, lastAssistant.content, null);
        addMessageToSession(bot.id, session.id, userMessage, lastAssistant.content);
      }

      if (stats.filesChanged > prevFilesChanged && projectIndex.packageJson?.scripts?.test) {
        const fixPrompt = await runTests(projectIndex, conversationMessages, tools, providerConfig, displayBotName, workDir);
        if (fixPrompt) {
          await handleMessage(fixPrompt);
        }
      }
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${L('Kayıt hatası', 'Save error')}: ${err.message}\n`));
    }
  }

  // ── Input loop — readline herhangi bir sebepten kapanırsa yeniden oluştur ───

  function createRl() {
    if (rl) {
      try { rl.removeAllListeners(); rl.close(); } catch {}
    }
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.on('SIGINT', async () => {
      console.log('\n');
      rl.pause();
      if (conversationMessages.filter(m => m.role === 'user').length > 0) {
        try {
          const save = await confirmAction(L("Bu session'ı proje hafızasına kaydet?", 'Save this session to project memory?'));
          if (save) await saveProjectMemory(conversationMessages, providerConfig, workDir);
        } catch {}
      }
      showSummary();
      process.exit(0);
    });

    rl.on('close', () => {});
  }

  async function promptLoop() {
    while (true) {
      let msg;
      try {
        msg = await new Promise(resolve => {
          rl.question(chalk.gray('> '), resolve);
        });
      } catch {
        continue;
      }

      process.stdout.write('\x1b[1A\x1b[2K');

      const trimmed = msg.trim();
      if (!trimmed) continue;
      if (['exit', 'quit', 'çıkış', 'q'].includes(trimmed.toLowerCase())) {
        process.exit(0);
      }

      try {
        await handleMessage(trimmed);
      } catch (err) {
        console.error(chalk.red('Error: ' + err.message));
      }
    }
  }

  createRl();
  promptLoop();
}

module.exports = code;
