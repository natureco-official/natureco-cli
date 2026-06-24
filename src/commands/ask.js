const chalk = require('chalk');
const { getApiKey, getConfig } = require('../utils/config');
const { getBots, sendMessage } = require('../utils/api');
const { getSkillPrompts } = require('../utils/skills');
const { getMemoryPrompt } = require('../utils/memory');
const { getAgentsPrompt } = require('../utils/agents');

async function ask(question) {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log(chalk.red('\n❌ Giriş yapılmamış. Önce "natureco login" çalıştırın.\n'));
    process.exit(1);
  }

  const config = getConfig();
  const defaultBotId = config.defaultBotId;

  if (!defaultBotId) {
    console.log(chalk.red('\n❌ Varsayılan bot ayarlanmamış. "natureco config set defaultBotId <bot-id>" ile ayarlayın.\n'));
    process.exit(1);
  }

  // Skill prompts'ları yükle
  const skillPrompts = getSkillPrompts();
  const memoryPrompt = getMemoryPrompt(defaultBotId);
  const agentsPrompt = getAgentsPrompt();
  
  let systemPrompt = '';
  if (skillPrompts) systemPrompt += skillPrompts;
  if (agentsPrompt) systemPrompt += '\n\n' + agentsPrompt;
  if (memoryPrompt) systemPrompt += '\n\n' + memoryPrompt;

  // Loading animasyonu
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write(chalk.yellow('⏳ '));
  const loadingInterval = setInterval(() => {
    process.stdout.write(`\r${chalk.yellow('⏳')} ${chalk.yellow(frames[i])}`);
    i = (i + 1) % frames.length;
  }, 80);

  try {
    const response = await sendMessage(apiKey, defaultBotId, question, null, systemPrompt, { stream: false });
    
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

module.exports = ask;
