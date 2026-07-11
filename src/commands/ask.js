const chalk = require('chalk');
const { getLang: _getLang } = require('../utils/i18n');
const L = (tr, en) => (_getLang() === 'en' ? en : tr);
const { getApiKey, getConfig } = require('../utils/config');
const { getBots, sendMessage } = require('../utils/api');
const { getSkillPrompts } = require('../utils/skills');
const { getMemoryPrompt } = require('../utils/memory');
const { getAgentsPrompt } = require('../utils/agents');

async function ask(question, options = {}) {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log(chalk.red(L('\n❌ Giriş yapılmamış. Önce "natureco login" çalıştırın.\n', '\n❌ Not signed in. Run "natureco login" first.\n')));
    process.exit(1);
  }

  const config = getConfig();
  let defaultBotId = config.defaultBotId;

  // defaultBotId ayarli degilse hesaptaki ILK botu otomatik sec — birincil bir komut
  // ("natureco ask ...") kutu-cikisi patlamasin. (chat/code zaten cfg.botName ile calisir.)
  if (!defaultBotId) {
    try {
      const { bots } = await getBots(apiKey);
      if (bots && bots.length > 0) defaultBotId = bots[0].id;
    } catch { /* ag hatasi — asagida net mesaj */ }
  }

  if (!defaultBotId) {
    console.log(chalk.red(L('\n❌ Hiç bot bulunamadı. "natureco chat" ile yerel sağlayıcıyı kullanabilir ya da bir bot oluşturabilirsiniz.\n', '\n❌ No bots found. Use "natureco chat" for the local provider, or create a bot.\n')));
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
    // Tek atımlık soru: 47 araç şeması göndermek ~15K token israfıydı.
    // Varsayılan araçsız (~%90 tasarruf); --tools ile açılabilir.
    const response = await sendMessage(apiKey, defaultBotId, question, null, systemPrompt, { stream: false, noTools: !options.tools });
    
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
