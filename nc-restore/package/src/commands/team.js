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
const tui = require('../utils/tui');
const subAgent = require('../utils/sub-agent');
const audit = require('../utils/audit');

async function cmdList() {
  console.log('\n' + tui.styled('  🤖 Mevcut Agent Tipleri', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  const rows = Object.entries(subAgent.SYSTEM_PROMPTS).map(([type, prompt]) => ({
    type,
    prompt: prompt.length > 80 ? prompt.slice(0, 77) + '...' : prompt,
  }));
  console.log('\n' + tui.table(rows, [
    { key: 'type', label: 'Tip', minWidth: 14, render: r => tui.styled(r.type, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'prompt', label: 'Sistem Prompt', minWidth: 50, render: r => tui.C.muted(r.prompt) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

async function cmdStatus() {
  const status = subAgent.getStatus();
  console.log('\n' + tui.styled('  📊 Sub-Agent İstatistikleri', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Üst metrik kartı
  const w = 50;
  const lines = [];
  lines.push(tui.styled('  ╭' + '─'.repeat(w) + '╮', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted('Toplam      ') + tui.styled(String(status.total).padStart(8), { color: tui.PALETTE.text, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted('Çalışan     ') + tui.styled(String(status.running).padStart(8), { color: tui.PALETTE.warning, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted('Tamamlanan  ') + tui.styled(String(status.completed).padStart(8), { color: tui.PALETTE.success, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted('Başarısız   ') + tui.styled(String(status.failed).padStart(8), { color: tui.PALETTE.danger, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  ╰' + '─'.repeat(w) + '╯', { color: tui.PALETTE.border }));
  console.log('\n' + lines.join('\n'));

  if (status.agents.length > 0) {
    console.log('\n' + tui.styled('  📜 Son 10 Agent', { color: tui.PALETTE.secondary, bold: true }));
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
      { key: 'type', label: 'Tip', minWidth: 12, render: r => tui.styled(r.type, { color: tui.PALETTE.primary }) },
      { key: 'task', label: 'Görev', minWidth: 30, render: r => tui.C.muted(r.task) },
      { key: 'dur', label: 'Süre', minWidth: 8, render: r => tui.C.text(r.dur) },
    ], { borderStyle: 'round', zebra: true }));
  }
  console.log('');
}

async function cmdSpawn(args) {
  const [type, ...taskParts] = args;
  const task = taskParts.join(' ');

  if (!type || !task) {
    console.log(chalk.red('\n  Kullanım: natureco team spawn <type> <task>\n'));
    console.log(chalk.gray('  Tipler: ') + Object.keys(subAgent.SYSTEM_PROMPTS).join(', '));
    console.log('');
    return;
  }
  if (!subAgent.SYSTEM_PROMPTS[type]) {
    console.log(chalk.red(`\n  Bilinmeyen agent tipi: ${type}`));
    console.log(chalk.gray('  Tipler: ') + Object.keys(subAgent.SYSTEM_PROMPTS).join(', ') + '\n');
    return;
  }

  console.log(chalk.cyan(`\n  🤖 ${type} agent başlatılıyor...\n`));
  console.log(chalk.gray(`  Görev: ${task.slice(0, 100)}\n`));

  try {
    const { result, usage, duration } = await subAgent.spawnSubAgent(type, task);
    console.log(chalk.green(`  ✓ Tamamlandı (${duration}ms)\n`));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log(result);
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    if (usage?.total_tokens) {
      console.log(chalk.gray(`  Token: ${usage.total_tokens} (${usage.prompt_tokens} in, ${usage.completion_tokens} out)\n`));
    }
    audit.log(audit.ACTIONS.TOOL_CALL, { source: 'team', type, task: task.slice(0, 100) });
  } catch (e) {
    console.log(chalk.red(`\n  ❌ Hata: ${e.message}\n`));
  }
}

async function cmdParallel(args) {
  const spec = args.join(' ');
  if (!spec) {
    console.log(chalk.red('\n  Kullanım: natureco team parallel \'<json-spec>\'\n'));
    console.log(chalk.gray('  Örnek: natureco team parallel \'[{"type":"seo","task":"..."},{"type":"content","task":"..."}]\'\n'));
    return;
  }

  let agents;
  try { agents = JSON.parse(spec); }
  catch (e) {
    console.log(chalk.red(`\n  Geçersiz JSON: ${e.message}\n`));
    return;
  }

  if (!Array.isArray(agents) || agents.length === 0) {
    console.log(chalk.red('\n  JSON array olmalı.\n'));
    return;
  }

  console.log(chalk.cyan(`\n  🤝 ${agents.length} agent paralel başlatılıyor...\n`));

  try {
    const { results, failed } = await subAgent.spawnParallel(agents);
    console.log(chalk.green(`\n  ✓ ${results.length - failed.length}/${results.length} agent tamamlandı\n`));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const a = agents[i];
      console.log(chalk.bold(`\n  ── Agent ${i+1}: ${a.type} ──`));
      if (r.status === 'fulfilled') {
        console.log(chalk.gray(`  Görev: ${a.task.slice(0, 60)}`));
        console.log(chalk.green('  ✓ Sonuç:'));
        console.log('  ' + (r.value?.result || '').slice(0, 500));
      } else {
        console.log(chalk.red(`  ✗ Hata: ${r.reason}`));
      }
    }
    console.log('');
  } catch (e) {
    console.log(chalk.red(`\n  ❌ Hata: ${e.message}\n`));
  }
}

async function team(args) {
  const [action, ...params] = args || [];
  if (!action || action === 'help') {
    console.log(chalk.yellow('\n  Kullanım:'));
    console.log(chalk.gray('    natureco team list                  Agent tipleri'));
    console.log(chalk.gray('    natureco team status                Son çalışan agent\'lar'));
    console.log(chalk.gray('    natureco team spawn <type> <task>   Tek agent çalıştır'));
    console.log(chalk.gray('    natureco team parallel <json>       Paralel çalıştır'));
    console.log('');
    return;
  }
  if (action === 'list') return cmdList();
  if (action === 'status') return cmdStatus();
  if (action === 'spawn') return cmdSpawn(params);
  if (action === 'parallel') return cmdParallel(params);
  console.log(chalk.red(`\n  Bilinmeyen: ${action}\n`));
}

module.exports = team;
