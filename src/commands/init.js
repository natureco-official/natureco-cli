const fs = require('fs');
const path = require('path');
const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const { getApiKey } = require('../utils/config');
const { getBots } = require('../utils/api');

async function init() {
  console.log(chalk.green.bold(L('\n╭─ NatureCo Proje Başlatma ─╮\n', '\n╭─ NatureCo Project Init ─╮\n')));

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(chalk.red(L('❌ Giriş yapılmadı. Önce "natureco login" çalıştırın.\n', '❌ Not logged in. Run "natureco login" first.\n')));
    process.exit(1);
  }

  // Mevcut klasörde .natureco var mı kontrol et
  const projectDir = path.join(process.cwd(), '.natureco');
  if (fs.existsSync(projectDir)) {
    console.log(chalk.yellow(L('⚠️  Bu klasörde zaten .natureco/ mevcut.\n', '⚠️  This folder already has .natureco/.\n')));
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: L('Üzerine yazmak ister misiniz?', 'Overwrite?'),
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.gray(L('İptal edildi.\n', 'Cancelled.\n')));
      process.exit(0);
    }
  }

  // Botları çek
  console.log(chalk.yellow(L('⏳ Botlar yükleniyor...\n', '⏳ Loading bots...\n')));
  let botList;
  try {
    botList = await getBots(apiKey);
  } catch (err) {
    console.log(chalk.red(`❌ ${L('Hata', 'Error')}: ${err.message}\n`));
    process.exit(1);
  }

  if (!botList || !botList.bots || botList.bots.length === 0) {
    console.log(chalk.gray(L('Bot bulunamadı. Önce https://developers.natureco.me adresinden bot oluşturun.\n', 'No bots found. Create a bot at https://developers.natureco.me first.\n')));
    process.exit(1);
  }

  // Varsayılan bot seç
  const { defaultBot } = await inquirer.prompt([
    {
      type: 'list',
      name: 'defaultBot',
      message: L('Varsayılan bot:', 'Default bot:'),
      choices: botList.bots.map(b => ({ name: b.name, value: b.id })),
    },
  ]);

  const selectedBot = botList.bots.find(b => b.id === defaultBot);

  // Skill'ler
  const { skills } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'skills',
      message: L('Hangi skill\'ler eklensin?', 'Which skills to add?'),
      choices: [
        { name: L('code-review (Kod inceleme)', 'code-review (Code review)'), value: 'code-review', checked: true },
        { name: L('summarize (Özetleme)', 'summarize (Summarize)'), value: 'summarize', checked: true },
        { name: L('translate (Çeviri)', 'translate (Translate)'), value: 'translate', checked: false },
      ],
    },
  ]);

  // .natureco klasörünü oluştur
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  // config.json
  const config = {
    defaultBot: selectedBot.name,
    defaultBotId: selectedBot.id,
    skills: {
      enabled: true,
      list: skills,
    },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(projectDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  // AGENTS.md
  const agentsMd = `# ${selectedBot.name} ${L('Talimatları', 'Instructions')}

${L('Bu dosya projeye özel bot talimatlarını içerir.', 'This file contains project-specific bot instructions.')}
${L('Chat başladığında bu içerik sistem promptuna eklenir.', 'This content is added to the system prompt when chat starts.')}

## ${L('Proje Hakkında', 'About the Project')}

${L('[Projenizi tanımlayın]', '[Describe your project]')}

## ${L('Bot Görevleri', 'Bot Tasks')}

- ${L('[Görev 1]', '[Task 1]')}
- ${L('[Görev 2]', '[Task 2]')}

## ${L('Kurallar', 'Rules')}

- ${L('[Kural 1]', '[Rule 1]')}
- ${L('[Kural 2]', '[Rule 2]')}
`;
  fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), agentsMd, 'utf8');

  // skills klasörü
  const skillsDir = path.join(projectDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  console.log(chalk.green(L('\n✅ Proje başlatıldı!\n', '\n✅ Project initialized!\n')));
  console.log(chalk.cyan(L('Oluşturulan dosyalar:', 'Created files:')));
  console.log(chalk.gray(`  .natureco/config.json`));
  console.log(chalk.gray(`  .natureco/AGENTS.md`));
  console.log(chalk.gray(`  .natureco/skills/`));
  console.log('');
  console.log(chalk.yellow(L('Sonraki adım:', 'Next step:')), chalk.white(`natureco chat "${selectedBot.name}"`));
  console.log('');
}

module.exports = init;
