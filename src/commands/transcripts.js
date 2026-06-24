const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

function transcripts(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listTranscripts();
  if (action === 'show') return showTranscript(params[0]);
  if (action === 'delete') return deleteTranscript(params[0]);

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco transcripts [list|show|delete]\n'));
  process.exit(1);
}

function listTranscripts() {
  const sessionsDir = path.join(os.homedir(), '.natureco', 'sessions');
  console.log(chalk.cyan('\n  📜 Transcripts\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (!fs.existsSync(sessionsDir)) {
    console.log(chalk.gray('  No transcripts found.\n'));
    return;
  }

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(chalk.gray('  No transcripts found.\n'));
    return;
  }

  for (const f of files.sort().reverse().slice(0, 20)) {
    const stat = fs.statSync(path.join(sessionsDir, f));
    const size = (stat.size / 1024).toFixed(1);
    const date = stat.birthtime.toLocaleString();
    const preview = f.replace('.json', '').substring(0, 40);
    console.log(`  ${chalk.cyan('●')} ${chalk.white(preview)} ${chalk.gray(`(${size} KB, ${date})`)}`);
  }
  console.log();
}

function showTranscript(id) {
  if (!id) {
    console.log(chalk.red('\n  ❌ Transcript ID gerekli\n'));
    process.exit(1);
  }

  const sessionsDir = path.join(os.homedir(), '.natureco', 'sessions');
  const file = path.join(sessionsDir, `${id}.json`);

  if (!fs.existsSync(file)) {
    const alt = path.join(sessionsDir, id);
    if (!fs.existsSync(alt)) {
      console.log(chalk.red(`\n  ❌ Transcript bulunamadı: ${id}\n`));
      process.exit(1);
    }
    const content = fs.readFileSync(alt, 'utf8');
    console.log(chalk.gray(`\n  ${alt}\n`));
    console.log(content.substring(0, 5000));
    if (content.length > 5000) console.log(chalk.gray('\n  ... (truncated)\n'));
    return;
  }

  const content = fs.readFileSync(file, 'utf8');
  console.log(chalk.gray(`\n  ${file}\n`));
  const parsed = JSON.parse(content);
  console.log(JSON.stringify(parsed, null, 2).substring(0, 5000));
  console.log();
}

function deleteTranscript(id) {
  if (!id) {
    console.log(chalk.red('\n  ❌ Transcript ID gerekli\n'));
    process.exit(1);
  }

  const sessionsDir = path.join(os.homedir(), '.natureco', 'sessions');
  const file = path.join(sessionsDir, `${id}.json`);

  let target = file;
  if (!fs.existsSync(target)) {
    target = path.join(sessionsDir, id);
    if (!fs.existsSync(target)) {
      console.log(chalk.red(`\n  ❌ Transcript bulunamadı: ${id}\n`));
      process.exit(1);
    }
  }

  fs.unlinkSync(target);
  console.log(chalk.green(`\n  🗑️  Transcript silindi: ${id}\n`));
}

module.exports = transcripts;
