const fs = require('fs');
const path = require('path');
const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { getApiKey } = require('../utils/config');
const { getBots } = require('../utils/api');

async function init() {
  console.log(chalk.green.bold('\n╭─ NatureCo Proje Başlatma ─╮\n'));

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(chalk.red('❌ Giriş yapılmadı. Önce "natureco login" çalıştırın.\n'));
    process.exit(1);
  }

  // Mevcut klasörde .natureco var mı kontrol et
  const projectDir = path.join(process.cwd(), '.natureco');
  if (fs.existsSync(projectDir)) {
    console.log(chalk.yellow('⚠️  Bu klasörde zaten .natureco/ mevcut.\n'));
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Üzerine yazmak ister misiniz?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.gray('İptal edildi.\n'));
      process.exit(0);
    }
  }

  // Botları çek
  console.log(chalk.yellow('⏳ Botlar yükleniyor...\n'));
  let botList;
  try {
    botList = await getBots(apiKey);
  } catch (err) {
    console.log(chalk.red(`❌ Hata: ${err.message}\n`));
    process.exit(1);
  }

  if (!botList || !botList.bots || botList.bots.length === 0) {
    console.log(chalk.gray('Bot bulunamadı. Önce https://developers.natureco.me adresinden bot oluşturun.\n'));
    process.exit(1);
  }

  // Varsayılan bot seç
  const { defaultBot } = await inquirer.prompt([
    {
      type: 'list',
      name: 'defaultBot',
      message: 'Varsayılan bot:',
      choices: botList.bots.map(b => ({ name: b.name, value: b.id })),
    },
  ]);

  const selectedBot = botList.bots.find(b => b.id === defaultBot);

  // Skill'ler
  const { skills } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'skills',
      message: 'Hangi skill\'ler eklensin?',
      choices: [
        { name: 'code-review (Kod inceleme)', value: 'code-review', checked: true },
        { name: 'summarize (Özetleme)', value: 'summarize', checked: true },
        { name: 'translate (Çeviri)', value: 'translate', checked: false },
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
  const agentsMd = `# ${selectedBot.name} Talimatları

Bu dosya projeye özel bot talimatlarını içerir.
Chat başladığında bu içerik sistem promptuna eklenir.

## Proje Hakkında

[Projenizi tanımlayın]

## Bot Görevleri

- [Görev 1]
- [Görev 2]

## Kurallar

- [Kural 1]
- [Kural 2]
`;
  fs.writeFileSync(path.join(projectDir, 'AGENTS.md'), agentsMd, 'utf8');

  // skills klasörü
  const skillsDir = path.join(projectDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  console.log(chalk.green('\n✅ Proje başlatıldı!\n'));
  console.log(chalk.cyan('Oluşturulan dosyalar:'));
  console.log(chalk.gray(`  .natureco/config.json`));
  console.log(chalk.gray(`  .natureco/AGENTS.md`));
  console.log(chalk.gray(`  .natureco/skills/`));
  console.log('');
  console.log(chalk.yellow('Sonraki adım:'), chalk.white(`natureco chat "${selectedBot.name}"`));
  console.log('');
}

module.exports = init;
