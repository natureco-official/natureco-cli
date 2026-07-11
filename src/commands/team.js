/**
 * natureco team — Multi-agent orkestrasyon (Phase 7)
 *
 * Birden fazla uzman agent'ı aynı görev üzerinde paralel çalıştır.
 * Her biri kendi system prompt'u ve tool setiyle bağımsız çalışır.
 *
 * Kullanım:
 *   natureco team list                 Mevcut agent tipleri
 *   natureco team status               Son çalışan agent'lar
 *   natureco team spawn <type> <task>  Tek agent çalıştır
 *   natureco team parallel <spec>      Paralel çalıştır (JSON)
 *
 * Örnek:
 *   natureco team spawn seo "natureco.me için anahtar kelime öner"
 *   natureco team parallel '[{"type":"seo","task":"..."}, {"type":"content","task":"..."}]'
 */

const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
const subAgent = require('../utils/sub-agent');
const audit = require('../utils/audit');

async function cmdList() {
  console.log('\n' + tui.styled(L('  🤖 Mevcut Agent Tipleri', '  🤖 Available Agent Types'), { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  const rows = Object.entries(subAgent.SYSTEM_PROMPTS).map(([type, prompt]) => ({
    type,
    prompt: prompt.length > 80 ? prompt.slice(0, 77) + '...' : prompt,
  }));
  console.log('\n' + tui.table(rows, [
    { key: 'type', label: L('Tip', 'Type'), minWidth: 14, render: r => tui.styled(r.type, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'prompt', label: L('Sistem Prompt', 'System Prompt'), minWidth: 50, render: r => tui.C.muted(r.prompt) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

async function cmdStatus() {
  const status = subAgent.getStatus();
  console.log('\n' + tui.styled(L('  📊 Sub-Agent İstatistikleri', '  📊 Sub-Agent Statistics'), { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Üst metrik kartı
  const w = 50;
  const lines = [];
  lines.push(tui.styled('  ╭' + '─'.repeat(w) + '╮', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted(L('Toplam      ', 'Total       ')) + tui.styled(String(status.total).padStart(8), { color: tui.PALETTE.text, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted(L('Çalışan     ', 'Running     ')) + tui.styled(String(status.running).padStart(8), { color: tui.PALETTE.warning, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted(L('Tamamlanan  ', 'Completed   ')) + tui.styled(String(status.completed).padStart(8), { color: tui.PALETTE.success, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted(L('Başarısız   ', 'Failed      ')) + tui.styled(String(status.failed).padStart(8), { color: tui.PALETTE.danger, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  ╰' + '─'.repeat(w) + '╯', { color: tui.PALETTE.border }));
  console.log('\n' + lines.join('\n'));

  if (status.agents.length > 0) {
    console.log('\n' + tui.styled(L('  📜 Son 10 Agent', '  📜 Last 10 Agents'), { color: tui.PALETTE.secondary, bold: true }));
    const rows = status.agents.slice(0, 10).map(a => {
      const icon = a.status === 'completed'
        ? tui.styled(' ✓ ', { bg: tui.PALETTE.success, color: '#000', bold: true })
        : a.status === 'failed'
        ? tui.styled(' ✗ ', { bg: tui.PALETTE.danger, color: '#000', bold: true })
        : tui.styled(' ⋯ ', { bg: tui.PALETTE.warning, color: '#000', bold: true });
      const dur = a.completedAt ? Math.round((new Date(a.completedAt) - new Date(a.startedAt)) / 100) / 10 : '-';
      return { icon, type: a.type, task: a.task.slice(0, 60), dur: dur + 's' };
    });
    console.log('\n' + tui.table(rows, [
      { key: 'icon', label: ' ', minWidth: 5 },
      { key: 'type', label: L('Tip', 'Type'), minWidth: 12, render: r => tui.styled(r.type, { color: tui.PALETTE.primary }) },
      { key: 'task', label: L('Görev', 'Task'), minWidth: 30, render: r => tui.C.muted(r.task) },
      { key: 'dur', label: L('Süre', 'Duration'), minWidth: 8, render: r => tui.C.text(r.dur) },
    ], { borderStyle: 'round', zebra: true }));
  }
  console.log('');
}

async function cmdSpawn(args) {
  const [type, ...taskParts] = args;
  const task = taskParts.join(' ');

  if (!type || !task) {
    console.log(chalk.red(L('\n  Kullanım: natureco team spawn <type> <task>\n', '\n  Usage: natureco team spawn <type> <task>\n')));
    console.log(chalk.gray(L('  Tipler: ', '  Types: ')) + Object.keys(subAgent.SYSTEM_PROMPTS).join(', '));
    console.log('');
    return;
  }
  if (!subAgent.SYSTEM_PROMPTS[type]) {
    console.log(chalk.red(`\n  ${L('Bilinmeyen agent tipi', 'Unknown agent type')}: ${type}`));
    console.log(chalk.gray(L('  Tipler: ', '  Types: ')) + Object.keys(subAgent.SYSTEM_PROMPTS).join(', ') + '\n');
    return;
  }

  console.log(chalk.cyan(`\n  🤖 ${type} agent ${L('başlatılıyor...', 'starting...')}\n`));
  console.log(chalk.gray(`  ${L('Görev', 'Task')}: ${task.slice(0, 100)}\n`));

  try {
    const { result, usage, duration } = await subAgent.spawnSubAgent(type, task);
    console.log(chalk.green(`  ✓ ${L('Tamamlandı', 'Completed')} (${duration}ms)\n`));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log(result);
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    if (usage?.total_tokens) {
      console.log(chalk.gray(`  Token: ${usage.total_tokens} (${usage.prompt_tokens} in, ${usage.completion_tokens} out)\n`));
    }
    audit.log(audit.ACTIONS.TOOL_CALL, { source: 'team', type, task: task.slice(0, 100) });
  } catch (e) {
    console.log(chalk.red(`\n  ❌ ${L('Hata', 'Error')}: ${e.message}\n`));
  }
}

async function cmdParallel(args) {
  const spec = args.join(' ');
  if (!spec) {
    console.log(chalk.red(L('\n  Kullanım: natureco team parallel \'<json-spec>\'\n', '\n  Usage: natureco team parallel \'<json-spec>\'\n')));
    console.log(chalk.gray(L('  Örnek: natureco team parallel \'[{"type":"seo","task":"..."},{"type":"content","task":"..."}]\'\n', '  Example: natureco team parallel \'[{"type":"seo","task":"..."},{"type":"content","task":"..."}]\'\n')));
    return;
  }

  let agents;
  try { agents = JSON.parse(spec); }
  catch (e) {
    console.log(chalk.red(`\n  ${L('Geçersiz JSON', 'Invalid JSON')}: ${e.message}\n`));
    return;
  }

  if (!Array.isArray(agents) || agents.length === 0) {
    console.log(chalk.red(L('\n  JSON array olmalı.\n', '\n  JSON must be an array.\n')));
    return;
  }

  console.log(chalk.cyan(`\n  🤝 ${agents.length} agent ${L('paralel başlatılıyor...', 'starting in parallel...')}\n`));

  try {
    const { results, failed } = await subAgent.spawnParallel(agents);
    console.log(chalk.green(`\n  ✓ ${results.length - failed.length}/${results.length} agent ${L('tamamlandı', 'completed')}\n`));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const a = agents[i];
      console.log(chalk.bold(`\n  ── Agent ${i+1}: ${a.type} ──`));
      if (r.status === 'fulfilled') {
        console.log(chalk.gray(`  ${L('Görev', 'Task')}: ${a.task.slice(0, 60)}`));
        console.log(chalk.green(L('  ✓ Sonuç:', '  ✓ Result:')));
        console.log('  ' + (r.value?.result || '').slice(0, 500));
      } else {
        console.log(chalk.red(`  ✗ ${L('Hata', 'Error')}: ${r.reason}`));
      }
    }
    console.log('');
  } catch (e) {
    console.log(chalk.red(`\n  ❌ ${L('Hata', 'Error')}: ${e.message}\n`));
  }
}

async function team(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow(L('\n  Kullanım:', '\n  Usage:')));
    console.log(chalk.gray(L('    natureco team list                  Agent tipleri', '    natureco team list                  Agent types')));
    console.log(chalk.gray(L('    natureco team status                Son çalışan agent\'lar', '    natureco team status                Recently run agents')));
    console.log(chalk.gray(L('    natureco team spawn <type> <task>   Tek agent çalıştır', '    natureco team spawn <type> <task>   Run a single agent')));
    console.log(chalk.gray(L('    natureco team parallel <json>       Paralel çalıştır', '    natureco team parallel <json>       Run in parallel')));
    console.log('');
    return;
  }
  if (action === 'list') return cmdList();
  if (action === 'status') return cmdStatus();
  if (action === 'spawn') return cmdSpawn(params);
  if (action === 'parallel') return cmdParallel(params);
  console.log(chalk.red(`\n  ${L('Bilinmeyen', 'Unknown')}: ${action}\n`));
}

module.exports = team;
