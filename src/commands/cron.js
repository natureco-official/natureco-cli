const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CRONS_FILE = path.join(os.homedir(), '.natureco', 'crons.json');
const CRONS_RUNS_FILE = path.join(os.homedir(), '.natureco', 'cron-runs.json');

/**
 * Normalize WhatsApp number from JID format to clean phone number
 * "905422842631:49@s.whatsapp.net" → "+905422842631"
 */
function normalizeWhatsAppNumber(target) {
  if (!target) return target;
  // Extract digits from JID format
  const match = target.match(/^(\d+)/);
  return match ? '+' + match[1] : target;
}

function loadCrons() {
  try {
    if (!fs.existsSync(CRONS_FILE)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(CRONS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveCrons(crons) {
  const dir = path.dirname(CRONS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CRONS_FILE, JSON.stringify(crons, null, 2), 'utf-8');
}

async function cron(action, options) {
  if (!action || !['add', 'list', 'remove', 'get', 'edit', 'enable', 'disable', 'runs', 'run'].includes(action)) {
    console.log(chalk.red(L('\n❌ Geçersiz aksiyon\n', '\n❌ Invalid action\n')));
    console.log(chalk.gray(L('Kullanım:', 'Usage:')));
    console.log(chalk.cyan('  natureco cron add --name <name> --schedule <cron> --action <channel> --target <target> --prompt <prompt>'));
    console.log(chalk.cyan('  natureco cron list'));
    console.log(chalk.cyan('  natureco cron get <name>'));
    console.log(chalk.cyan('  natureco cron edit <name> [--name <name>] [--schedule <cron>] [--action <channel>] [--target <target>] [--prompt <prompt>]'));
    console.log(chalk.cyan('  natureco cron remove --name <name>'));
    console.log(chalk.cyan('  natureco cron enable <name>'));
    console.log(chalk.cyan('  natureco cron disable <name>'));
    console.log(chalk.cyan('  natureco cron runs <name>'));
    console.log(chalk.cyan('  natureco cron run <name>'));
    console.log(chalk.gray(L('\nÖrnek:', '\nExample:')));
    console.log(chalk.cyan(L('  natureco cron add --name "bitcoin-fiyat" --schedule "0 9 * * *" --action "whatsapp" --target "+905422842631" --prompt "Bugünkü Bitcoin fiyatını öğren ve kısaca bildir"\n', '  natureco cron add --name "bitcoin-price" --schedule "0 9 * * *" --action "whatsapp" --target "+905422842631" --prompt "Get today\'s Bitcoin price and report briefly"\n')));
    process.exit(1);
  }
  
  if (action === 'add') {
    await addCron(options);
  } else if (action === 'list') {
    listCrons();
  } else if (action === 'remove') {
    removeCron(options);
  } else if (action === 'get') {
    getCron(options);
  } else if (action === 'edit') {
    editCron(options);
  } else if (action === 'enable') {
    enableCron(options);
  } else if (action === 'disable') {
    disableCron(options);
  } else if (action === 'runs') {
    showRuns(options);
  } else if (action === 'run') {
    runCron(options);
  }
}

async function addCron(options) {
  const { name, schedule, action, target, prompt } = options;
  
  if (!name || !schedule || !action || !target || !prompt) {
    console.log(chalk.red(L('\n❌ Eksik parametre\n', '\n❌ Missing parameter\n')));
    console.log(chalk.gray(L('Gerekli parametreler: --name, --schedule, --action, --target, --prompt\n', 'Required parameters: --name, --schedule, --action, --target, --prompt\n')));
    process.exit(1);
  }
  
  if (!['whatsapp', 'telegram'].includes(action)) {
    console.log(chalk.red(L('\n❌ Geçersiz action. Sadece "whatsapp" veya "telegram" kullanılabilir\n', '\n❌ Invalid action. Only "whatsapp" or "telegram" can be used\n')));
    process.exit(1);
  }
  
  // Validate cron expression
  try {
    const nodeCron = require('node-cron');
    if (!nodeCron.validate(schedule)) {
      console.log(chalk.red(L('\n❌ Geçersiz cron ifadesi\n', '\n❌ Invalid cron expression\n')));
      console.log(chalk.gray(L('Örnek: "0 9 * * *" (her gün saat 09:00)\n', 'Example: "0 9 * * *" (every day at 09:00)\n')));
      process.exit(1);
    }
  } catch (err) {
    console.log(chalk.red(L('\n❌ node-cron yüklü değil\n', '\n❌ node-cron not installed\n')));
    console.log(chalk.yellow(L('Yüklemek için:', 'To install:')), chalk.cyan('npm install -g node-cron\n'));
    process.exit(1);
  }
  
  const crons = loadCrons();
  
  // Check if name already exists
  if (crons.find(c => c.name === name)) {
    console.log(chalk.red(L('\n❌ Bu isimde bir cron zaten var\n', '\n❌ A cron with this name already exists\n')));
    console.log(chalk.yellow(L('Önce silin:', 'Delete it first:')), chalk.cyan(`natureco cron remove --name "${name}"\n`));
    process.exit(1);
  }
  
  const newCron = {
    name,
    schedule,
    action,
    target,
    prompt,
    createdAt: new Date().toISOString(),
    enabled: true
  };
  
  crons.push(newCron);
  saveCrons(crons);
  
  console.log(chalk.green(L('\n✅ Cron eklendi!\n', '\n✅ Cron added!\n')));
  console.log(chalk.cyan(L('İsim:', 'Name:')), chalk.white(name));
  console.log(chalk.cyan(L('Zamanlama:', 'Schedule:')), chalk.white(schedule));
  console.log(chalk.cyan(L('Kanal:', 'Channel:')), chalk.white(action));
  console.log(chalk.cyan(L('Hedef:', 'Target:')), chalk.white(target));
  console.log(chalk.cyan('Prompt:'), chalk.white(prompt));
  console.log(chalk.gray(L('\nCron\'lar gateway başlatıldığında aktif olur.', '\nCrons become active when the gateway starts.')));
  console.log(chalk.gray(L('Gateway çalışıyorsa yeniden başlatın: natureco gateway stop && natureco gateway start\n', 'If the gateway is running, restart it: natureco gateway stop && natureco gateway start\n')));
}

function listCrons() {
  const crons = loadCrons();

  if (crons.length === 0) {
    console.log('\n' + tui.styled(L('  ⏰ Zamanlanmış Görevler', '  ⏰ Scheduled Tasks'), { color: tui.PALETTE.primary, bold: true }));
    console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
    console.log('\n  ' + tui.C.muted(L('Henüz cron tanımlı değil. Eklemek için:', 'No crons defined yet. To add:')));
    console.log('  ' + tui.C.brand(L('natureco cron add --name "görev" --schedule "0 9 * * *" --action telegram --prompt "..."', 'natureco cron add --name "task" --schedule "0 9 * * *" --action telegram --prompt "..."')));
    console.log('');
    return;
  }

  const { getConfig } = require('../utils/config');
  const config = getConfig();
  const defaultWhatsappTarget = normalizeWhatsAppNumber(config.whatsappPhone) || 'N/A';
  const defaultTelegramTarget = (config.telegramAllowedChats && config.telegramAllowedChats[0]) || 'N/A';

  const runs = loadRuns();
  const rows = crons.map(c => {
    let target = c.target;
    if (!target || target === 'undefined') {
      target = c.action === 'telegram' ? defaultTelegramTarget : defaultWhatsappTarget;
    } else if (c.action === 'whatsapp') {
      target = normalizeWhatsAppNumber(target);
    }
    const cronRuns = runs.filter(r => r.name === c.name);
    const lastRun = cronRuns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    return {
      name: c.name,
      schedule: c.schedule,
      status: c.enabled,
      target,
      lastRun: lastRun ? lastRun.timestamp.slice(0, 16).replace('T', ' ') : '—',
    };
  });

  console.log('\n' + tui.styled('  ⏰ Zamanlanmış Görevler (' + crons.length + ')', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  console.log('\n' + tui.table(rows, [
    { key: 'name', label: L('İsim', 'Name'), minWidth: 20, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'schedule', label: L('Zamanlama', 'Schedule'), minWidth: 18, render: r => tui.C.muted(r.schedule) },
    {
      key: 'status', label: L('Durum', 'Status'), minWidth: 10,
      render: r => r.status
        ? tui.styled(L('  ✓ Aktif ', '  ✓ Active '), { bg: tui.PALETTE.success, color: '#000', bold: true })
        : tui.styled(L(' ✗ Pasif ', ' ✗ Inactive '), { bg: tui.PALETTE.muted, color: '#000', bold: true }),
    },
    { key: 'target', label: L('Hedef', 'Target'), minWidth: 18, render: r => tui.C.text(r.target) },
    { key: 'lastRun', label: L('Son Çalışma', 'Last Run'), minWidth: 18, render: r => tui.C.muted(r.lastRun) },
  ], { borderStyle: 'round', zebra: true }));

  console.log('');
}

function removeCron(options) {
  const { name } = options;
  
  if (!name) {
    F.error(L('--name parametresi gerekli', '--name parameter required'));
    process.exit(1);
  }
  
  const crons = loadCrons();
  const index = crons.findIndex(c => c.name === name);
  
  if (index === -1) {
    F.error(L('Bu isimde bir cron bulunamadı', 'No cron found with this name'));
    process.exit(1);
  }
  
  crons.splice(index, 1);
  saveCrons(crons);
  
  F.success(L('Cron silindi!', 'Cron deleted!'));
  F.meta(L('Gateway çalışıyorsa yeniden başlatın: natureco gateway stop && natureco gateway start', 'If the gateway is running, restart it: natureco gateway stop && natureco gateway start'));
}

function getCron(options) {
  const { name } = options;
  if (!name) {
    F.error(L('Cron adı gerekli. Kullanım: natureco cron get <name>', 'Cron name required. Usage: natureco cron get <name>'));
    process.exit(1);
  }

  const crons = loadCrons();
  const cron = crons.find(c => c.name === name);
  if (!cron) {
    F.error('"' + name + L('" isminde bir cron bulunamadı', '" — no cron found with this name'));
    process.exit(1);
  }

  F.header('Cron: ' + cron.name);
  F.kv(L('İsim', 'Name'), cron.name);
  F.kv(L('Zamanlama', 'Schedule'), cron.schedule);
  F.kv(L('Kanal', 'Channel'), cron.action);
  F.kv(L('Hedef', 'Target'), cron.target);
  F.kv('Prompt', cron.prompt);
  F.kv(L('Oluşturulma', 'Created'), cron.createdAt);
  F.kv(L('Durum', 'Status'), cron.enabled ? L('Aktif', 'Active') : L('Pasif', 'Inactive'));
}

function editCron(options) {
  const { name, schedule, action, target, prompt } = options;
  const newName = options['newName'];

  if (!name) {
    F.error(L('Cron adı gerekli. Kullanım: natureco cron edit <name> [--name <newName>] [--schedule <cron>] [--action <channel>] [--target <target>] [--prompt <prompt>]', 'Cron name required. Usage: natureco cron edit <name> [--name <newName>] [--schedule <cron>] [--action <channel>] [--target <target>] [--prompt <prompt>]'));
    process.exit(1);
  }

  const crons = loadCrons();
  const cron = crons.find(c => c.name === name);
  if (!cron) {
    F.error('"' + name + L('" isminde bir cron bulunamadı', '" — no cron found with this name'));
    process.exit(1);
  }

  if (newName) cron.name = newName;
  if (schedule) {
    try {
      const nodeCron = require('node-cron');
      if (!nodeCron.validate(schedule)) {
        F.error(L('Geçersiz cron ifadesi', 'Invalid cron expression'));
        process.exit(1);
      }
    } catch (err) {
      F.error(L('node-cron yüklü değil', 'node-cron not installed'));
      process.exit(1);
    }
    cron.schedule = schedule;
  }
  if (action) {
    if (!['whatsapp', 'telegram'].includes(action)) {
      F.error(L('Geçersiz action. Sadece "whatsapp" veya "telegram" kullanılabilir', 'Invalid action. Only "whatsapp" or "telegram" can be used'));
      process.exit(1);
    }
    cron.action = action;
  }
  if (target) cron.target = target;
  if (prompt) cron.prompt = prompt;

  saveCrons(crons);

  F.success(L('Cron güncellendi!', 'Cron updated!'));
  F.kv(L('İsim', 'Name'), cron.name);
  F.kv(L('Zamanlama', 'Schedule'), cron.schedule);
  F.kv(L('Kanal', 'Channel'), cron.action);
  F.kv(L('Hedef', 'Target'), cron.target);
  F.kv('Prompt', cron.prompt);
  F.meta(L('Gateway çalışıyorsa yeniden başlatın: natureco gateway stop && natureco gateway start', 'If the gateway is running, restart it: natureco gateway stop && natureco gateway start'));
}

function enableCron(options) {
  const { name } = options;
  if (!name) {
    F.error(L('Cron adı gerekli. Kullanım: natureco cron enable <name>', 'Cron name required. Usage: natureco cron enable <name>'));
    process.exit(1);
  }

  const crons = loadCrons();
  const cron = crons.find(c => c.name === name);
  if (!cron) {
    F.error('"' + name + L('" isminde bir cron bulunamadı', '" — no cron found with this name'));
    process.exit(1);
  }

  if (cron.enabled) {
    F.warning('"' + name + L('" cron zaten aktif', '" cron already active'));
    return;
  }

  cron.enabled = true;
  saveCrons(crons);
  F.dot(true, name);
  F.success('"' + name + L('" cron aktifleştirildi', '" cron enabled'));
  F.meta(L('Gateway çalışıyorsa yeniden başlatın: natureco gateway stop && natureco gateway start', 'If the gateway is running, restart it: natureco gateway stop && natureco gateway start'));
}

function disableCron(options) {
  const { name } = options;
  if (!name) {
    F.error(L('Cron adı gerekli. Kullanım: natureco cron disable <name>', 'Cron name required. Usage: natureco cron disable <name>'));
    process.exit(1);
  }

  const crons = loadCrons();
  const cron = crons.find(c => c.name === name);
  if (!cron) {
    F.error('"' + name + L('" isminde bir cron bulunamadı', '" — no cron found with this name'));
    process.exit(1);
  }

  if (!cron.enabled) {
    F.warning('"' + name + L('" cron zaten pasif', '" cron already inactive'));
    return;
  }

  cron.enabled = false;
  saveCrons(crons);
  F.dot(false, name);
  F.success('"' + name + L('" cron pasifleştirildi', '" cron disabled'));
  F.meta(L('Gateway çalışıyorsa yeniden başlatın: natureco gateway stop && natureco gateway start', 'If the gateway is running, restart it: natureco gateway stop && natureco gateway start'));
}

function loadRuns() {
  try {
    if (!fs.existsSync(CRONS_RUNS_FILE)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(CRONS_RUNS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function showRuns(options) {
  const { name } = options;
  if (!name) {
    F.error(L('Cron adı gerekli. Kullanım: natureco cron runs <name>', 'Cron name required. Usage: natureco cron runs <name>'));
    process.exit(1);
  }

  const runs = loadRuns().filter(r => r.name === name);

  F.header('Cron Runs: ' + name);

  if (runs.length === 0) {
    F.meta('"' + name + L('" için kayıtlı çalışma geçmişi yok', '" — no run history recorded'));
    return;
  }

  const rows = runs.map(r => [
    r.timestamp,
    r.status,
    r.output ? r.output.substring(0, 60) : '—'
  ]);
  F.table(['Time', 'Status', 'Output'], rows);
}

function runCron(options) {
  const { name } = options;
  if (!name) {
    F.error(L('Cron adı gerekli. Kullanım: natureco cron run <name>', 'Cron name required. Usage: natureco cron run <name>'));
    process.exit(1);
  }

  const crons = loadCrons();
  const cron = crons.find(c => c.name === name);
  if (!cron) {
    F.error('"' + name + L('" isminde bir cron bulunamadı', '" — no cron found with this name'));
    process.exit(1);
  }

  const timestamp = new Date().toISOString();

  F.info('"' + name + L('" cron manuel olarak çalıştırılıyor...', '" cron running manually...'));
  F.kv(L('Zamanlama', 'Schedule'), cron.schedule);
  F.kv(L('Kanal', 'Channel'), cron.action);
  F.kv(L('Hedef', 'Target'), cron.target);
  F.kv('Prompt', cron.prompt);
  F.success(L('Cron tetiklendi (mock)', 'Cron triggered (mock)'));

  // Log the run
  const runs = loadRuns();
  runs.push({
    name,
    timestamp,
    status: 'success',
    output: `Mock run of ${name} (${cron.action} → ${cron.target})`
  });
  const dir = path.dirname(CRONS_RUNS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CRONS_RUNS_FILE, JSON.stringify(runs, null, 2), 'utf-8');
}

module.exports = cron;
