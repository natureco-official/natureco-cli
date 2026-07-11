const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { getLang: _getLang } = require('../utils/i18n');
const L = (tr, en) => (_getLang() === 'en' ? en : tr);
const { getApiKey, getConfig } = require('../utils/config');
const { sendMessage } = require('../utils/api');
const { getSkillPrompts } = require('../utils/skills');

async function run(scriptPath) {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log(chalk.red(L('\n❌ Giriş yapılmamış. Önce "natureco login" çalıştırın.\n', '\n❌ Not signed in. Run "natureco login" first.\n')));
    process.exit(1);
  }

  const config = getConfig();
  const defaultBotId = config.defaultBotId;

  if (!defaultBotId) {
    console.log(chalk.red(L('\n❌ Varsayılan bot ayarlanmamış. "natureco config set defaultBotId <bot-id>" ile ayarlayın.\n', '\n❌ No default bot set. Set one with "natureco config set defaultBotId <bot-id>".\n')));
    process.exit(1);
  }

  // Script dosyasını oku
  const fullPath = path.resolve(scriptPath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(chalk.red(`\n❌ ${L('Dosya bulunamadı', 'File not found')}: ${scriptPath}\n`));
    process.exit(1);
  }

  const scriptContent = fs.readFileSync(fullPath, 'utf8');

  if (!scriptContent || scriptContent.trim().length === 0) {
    console.log(chalk.red(L('\n❌ Script dosyası boş.\n', '\n❌ Script file is empty.\n')));
    process.exit(1);
  }

  // Skill prompts'ları yükle
  const skillPrompts = getSkillPrompts();

  console.log(chalk.yellow(`\n⏳ ${L('Script çalıştırılıyor', 'Running script')}: ${path.basename(scriptPath)}\n`));

  // Loading animasyonu
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write(chalk.yellow('⏳ '));
  const loadingInterval = setInterval(() => {
    process.stdout.write(`\r${chalk.yellow('⏳')} ${chalk.yellow(frames[i])}`);
    i = (i + 1) % frames.length;
  }, 80);

  try {
    const response = await sendMessage(apiKey, defaultBotId, scriptContent, null, skillPrompts);
    
    clearInterval(loadingInterval);
    process.stdout.write('\r');

    const botReply = response.reply || response.message || 'Yanıt alınamadı';
    console.log(chalk.green(`\n${botReply}\n`));
  } catch (err) {
    clearInterval(loadingInterval);
    process.stdout.write('\r');
    console.log(chalk.red(`\n❌ Hata: ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = run;
