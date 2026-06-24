const chalk = require('chalk');
const tui = require('../utils/tui');
const path = require('path');
const fs = require('fs');
const os = require('os');
const inquirer = require('../utils/inquirer-wrapper');
const { getSkills, installSkill, removeSkill, updateAllSkills, createSkillTemplate, getPopularSkills } = require('../utils/skills');
const { NatureCoError, SkillError, handleError } = require('../utils/errors');
const detector = require('../utils/pattern-detector');
const audit = require('../utils/audit');

async function skills(args) {
  const [action, ...params] = args;

  if (!action || action === 'list') {
    await listSkills();
    return;
  }

  if (action === 'install') {
    const slug = params[0];
    if (!slug) {
      console.log(chalk.red('\n❌ Kullanım: natureco skills install <slug>\n'));
      process.exit(1);
    }
    await installSkillCommand(slug);
    return;
  }

  if (action === 'remove') {
    const slug = params[0];
    if (!slug) {
      console.log(chalk.red('\n❌ Kullanım: natureco skills remove <slug>\n'));
      process.exit(1);
    }
    await removeSkillCommand(slug);
    return;
  }

  if (action === 'update') {
    const flag = params[0];
    if (flag === '--all') {
      await updateAllSkillsCommand();
    } else {
      console.log(chalk.red('\n❌ Kullanım: natureco skills update --all\n'));
      process.exit(1);
    }
    return;
  }

  if (action === 'create') {
    const name = params[0];
    if (!name) {
      console.log(chalk.red('\n❌ Kullanım: natureco skills create <ad>\n'));
      process.exit(1);
    }
    await createSkillCommand(name);
    return;
  }

  if (action === 'search') {
    const query = params.join(' ');
    await searchSkillsCommand(query);
    return;
  }

  if (action === 'browse') {
    await browseSkillsCommand();
    return;
  }

  if (action === 'info') {
    const slug = params[0];
    await infoSkill(slug);
    return;
  }

  if (action === 'check') {
    await checkSkills();
    return;
  }

  if (action === 'suggest' || action === 'proposals') {
    await listProposals();
    return;
  }

  if (action === 'accept') {
    const proposalId = params[0];
    if (!proposalId) {
      console.log(chalk.red('\n❌ Kullanım: natureco skills accept <proposal-id>\n'));
      process.exit(1);
    }
    await acceptProposalCommand(proposalId);
    return;
  }

  if (action === 'reject') {
    const proposalId = params[0];
    if (!proposalId) {
      console.log(chalk.red('\n❌ Kullanım: natureco skills reject <proposal-id>\n'));
      process.exit(1);
    }
    detector.rejectProposal(proposalId);
    console.log(chalk.green(`\n✅ Proposal reddedildi: ${proposalId}\n`));
    return;
  }

  if (action === 'forget') {
    detector.reset();
    console.log(chalk.yellow('\n🧹 Tüm pattern hafızası ve proposal\'lar silindi.\n'));
    return;
  }

  // v5.0.0: Marketplace
  if (action === 'marketplace' || action === 'mp') {
    await listMarketplace();
    return;
  }

  if (action === 'install-mp') {
    const skillName = params[0];
    if (!skillName) { console.log(chalk.red('\n❌ Kullanım: natureco skills install-mp <name>\n')); process.exit(1); }
    await installFromMarketplace(skillName);
    return;
  }

  if (action === 'search-mp') {
    const query = params[0];
    if (!query) { console.log(chalk.red('\n❌ Kullanım: natureco skills search-mp <query>\n')); process.exit(1); }
    await searchMarketplace(query);
    return;
  }

  if (action === 'remove-mp' || action === 'uninstall-mp') {
    const skillName = params[0];
    if (!skillName) { console.log(chalk.red('\n❌ Kullanım: natureco skills remove-mp <name>\n')); process.exit(1); }
    uninstallMarketplace(skillName);
    return;
  }

  console.log(chalk.red(`\n❌ Geçersiz action: ${action}\n`));
  console.log(chalk.gray('Kullanım: natureco skills [list|install|remove|update|create|search|browse|info|check|suggest|accept|reject|forget|marketplace|install-mp|search-mp|remove-mp]\n'));
  process.exit(1);
}

// v5.0.0: Marketplace wrapper fonksiyonlari
async function listMarketplace() {
  const { loadToolDefinitions } = require('../utils/tools');
  const tools = loadToolDefinitions();
  const mp = tools.find(t => t.name === 'skills_marketplace');
  if (!mp) return;
  const result = await mp.execute({ action: 'list' });
  if (result.success) {
    console.log(chalk.cyan.bold('\n  🛒 Skill Marketplace (' + result.count + ' skill)\n'));
    console.log(chalk.gray('  ' + '─'.repeat(56)));
    for (const s of result.skills) {
      console.log('  ' + chalk.cyan(s.name.padEnd(22)) + chalk.gray((s.description || '').slice(0, 50)));
    }
    console.log('\n  ' + chalk.gray('Kur: ') + chalk.cyan('natureco skills install-mp <name>'));
    console.log('');
  }
}

async function installFromMarketplace(skillName) {
  const { loadToolDefinitions } = require('../utils/tools');
  const tools = loadToolDefinitions();
  const mp = tools.find(t => t.name === 'skills_marketplace');
  if (!mp) return;
  const result = await mp.execute({ action: 'install', skillName });
  if (result.success) {
    console.log(chalk.green('\n  ✓ ' + skillName + ' kuruldu: ' + result.path + '\n'));
  } else {
    console.log(chalk.red('\n  ✗ ' + result.error + '\n'));
  }
}

async function searchMarketplace(query) {
  const { loadToolDefinitions } = require('../utils/tools');
  const tools = loadToolDefinitions();
  const mp = tools.find(t => t.name === 'skills_marketplace');
  if (!mp) return;
  const result = await mp.execute({ action: 'search', query });
  if (result.success) {
    console.log(chalk.cyan.bold('\n  🔍 "' + query + '" icin sonuclar\n'));
    for (const s of result.results) {
      console.log('  ' + chalk.cyan(s.name.padEnd(22)) + chalk.gray((s.description || '').slice(0, 50)));
    }
    console.log('');
  }
}

function uninstallMarketplace(skillName) {
  const skillDir = path.join(os.homedir(), '.natureco', 'skills', skillName);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true });
    console.log(chalk.green('\n  ✓ ' + skillName + ' kaldirildi\n'));
  } else {
    console.log(chalk.yellow('\n  ' + skillName + ' zaten yok\n'));
  }
}

async function listSkills() {
  const allSkills = getSkills();

  console.log(chalk.gray('\n  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold('\n  Yüklü Skill\'ler\n'));

  if (allSkills.length === 0) {
    console.log(chalk.gray('  Hiç skill yüklü değil.\n'));
    console.log(chalk.gray('  Yüklemek için: ') + chalk.cyan('natureco skills install <slug>'));
    console.log(chalk.gray('  Gözatmak için: ') + chalk.cyan('natureco skills browse\n'));
    return;
  }

  allSkills.forEach((skill, index) => {
    const sourceLabel = skill.source === 'builtin' ? chalk.blue('[yerleşik]') :
                        skill.source === 'user' ? chalk.cyan('[kişisel]') :
                        chalk.magenta('[proje]');
    console.log(chalk.white(`  ${index + 1}. ${skill.name} `) + sourceLabel);
    console.log(chalk.gray(`     ${skill.description}`));
    if (skill.metadata?.requires?.bins) {
      console.log(chalk.gray(`     Gerekli: ${skill.metadata.requires.bins.join(', ')}`));
    }
    console.log('');
  });

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(`  Toplam: ${allSkills.length} skill`));
  console.log(chalk.gray('  Kaldırmak için: ') + chalk.cyan('natureco skills remove <slug>\n'));
}

async function installSkillCommand(slug) {
  console.log(chalk.yellow(`\n⏳ "${slug}" skill'i yükleniyor...\n`));

  try {
    await installSkill(slug);
    console.log(chalk.green(`✅ "${slug}" başarıyla yüklendi!\n`));
  } catch (err) {
    console.log(chalk.red(`\n❌ Hata: ${err.message}\n`));
    process.exit(1);
  }
}

async function removeSkillCommand(slug) {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `"${slug}" skill'ini silmek istediğinizden emin misiniz?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray('\nİptal edildi.\n'));
    return;
  }

  try {
    removeSkill(slug);
    console.log(chalk.green(`\n✅ "${slug}" silindi.\n`));
  } catch (err) {
    console.log(chalk.red(`\n❌ Hata: ${err.message}\n`));
    process.exit(1);
  }
}

async function updateAllSkillsCommand() {
  console.log(chalk.yellow('\n⏳ Tüm skill\'ler güncelleniyor...\n'));

  try {
    const updated = await updateAllSkills();
    if (updated.length === 0) {
      console.log(chalk.gray('Güncellenecek skill bulunamadı.\n'));
    } else {
      console.log(chalk.green(`✅ ${updated.length} skill güncellendi:\n`));
      updated.forEach(s => console.log(chalk.cyan(`  - ${s}`)));
      console.log('');
    }
  } catch (err) {
    console.log(chalk.red(`\n❌ Hata: ${err.message}\n`));
    process.exit(1);
  }
}

async function createSkillCommand(name) {
  console.log(chalk.yellow(`\n⏳ "${name}" skill şablonu oluşturuluyor...\n`));

  try {
    const skillPath = createSkillTemplate(name);
    console.log(chalk.green(`✅ Skill şablonu oluşturuldu:\n`));
    console.log(chalk.cyan(`   ${skillPath}\n`));
    console.log(chalk.gray('SKILL.md dosyasını düzenleyerek skill\'i özelleştirin.\n'));
  } catch (err) {
    console.log(chalk.red(`\n❌ Hata: ${err.message}\n`));
    process.exit(1);
  }
}

async function searchSkillsCommand(query) {
  if (!query || query.trim().length === 0) {
    try {
      const popularSkills = await getPopularSkills();
      console.log(chalk.yellow('\nPopüler Skill\'ler:\n'));
      popularSkills.forEach(skill => {
        console.log(chalk.cyan(`  ${skill.name.padEnd(15)}`), chalk.gray(skill.description));
      });
    } catch (err) {
      console.log(chalk.red(`\n  ❌ Popüler skill'ler alınamadı: ${err.message}\n`));
    }
    console.log('');
    console.log(chalk.gray('Kurmak için: '), chalk.cyan('natureco skills install <slug>'));
    console.log(chalk.gray('Örnek: '), chalk.cyan('natureco skills install github'));
    console.log(chalk.gray('ClawHub: '), chalk.cyan('natureco skills install clawhub:github'));
    console.log('');
    return;
  }

  console.log(chalk.yellow(`\n⏳ "${query}" aranıyor...\n`));

  try {
    // ClawHub search API
    const searchUrl = `https://clawhub.ai/api/skills?q=${encodeURIComponent(query)}&limit=10`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      throw new SkillError('ClawHub API\'ye erişilemedi', 'fetch', `https://clawhub.ai/api/skills?q=${encodeURIComponent(query)}`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new SkillError('ClawHub geçersiz yanıt döndü (JSON bekleniyordu)', 'parse', searchUrl);
    }
    const results = data.skills || [];

    if (results.length === 0) {
      console.log(chalk.yellow(`"${query}" için sonuç bulunamadı.\n`));
      return;
    }

    console.log(chalk.yellow(`"${query}" için ${results.length} sonuç:\n`));
    results.forEach(skill => {
      console.log(chalk.cyan(`  ${skill.name.padEnd(15)}`), chalk.gray(skill.description || 'Açıklama yok'));
      console.log(chalk.gray(`    Kurmak için: natureco skills install clawhub:${skill.slug}`));
    });
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n  ❌ Arama başarısız: ${err.message}\n`));
  }
}

async function browseSkillsCommand() {
  let popularSkills;
  try {
    popularSkills = await getPopularSkills();
  } catch (err) {
    console.log(chalk.red(`\n  ❌ Popüler skill'ler alınamadı: ${err.message}\n`));
    return;
  }
  
  console.log(chalk.green.bold('\n╭─ Popüler Skill\'ler ─╮\n'));

  process.stdin.resume();
  const { selectedSkills } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSkills',
      message: 'Kurmak istediğiniz skill\'leri seçin:',
      choices: popularSkills.map(skill => ({
        name: `${skill.name} - ${skill.description}`,
        value: skill.source === 'clawhub' ? `clawhub:${skill.slug}` : skill.slug,
      })),
    },
  ]);
  process.stdin.pause();

  if (selectedSkills.length === 0) {
    console.log(chalk.gray('\nHiçbir skill seçilmedi.\n'));
    return;
  }

  console.log(chalk.yellow(`\n⏳ ${selectedSkills.length} skill kuruluyor...\n`));

  for (const slug of selectedSkills) {
    try {
      await installSkill(slug);
      console.log(chalk.green(`✅ ${slug} kuruldu`));
    } catch (err) {
      console.log(chalk.red(`❌ ${slug} kurulamadı: ${err.message}`));
    }
  }

  console.log(chalk.green('\n✅ Kurulum tamamlandı!\n'));
}

async function infoSkill(slug) {
  if (!slug) {
    console.log(chalk.red('\n  ❌ Skill slug required\n'));
    console.log(chalk.gray('  Usage: natureco skills info <slug>\n'));
    process.exit(1);
  }
  const skills = getSkills();
  const skill = skills.find(s => s.name === slug || s.slug === slug);
  if (!skill) {
    console.log(chalk.red(`\n  ❌ Skill not found: ${slug}\n`));
    process.exit(1);
  }
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(`\n  ${skill.name}\n`));
  console.log(chalk.gray('  Slug        : ') + chalk.white(skill.slug || skill.name));
  console.log(chalk.gray('  Description : ') + chalk.white(skill.description));
  if (skill.source) console.log(chalk.gray('  Source      : ') + chalk.white(skill.source));
  if (skill.version) console.log(chalk.gray('  Version     : ') + chalk.white(skill.version));
  if (skill.path) console.log(chalk.gray('  Path        : ') + chalk.gray(skill.path));
  if (skill.metadata?.requires?.bins) {
    console.log(chalk.gray('  Requires    : ') + chalk.white(skill.metadata.requires.bins.join(', ')));
  }
  if (skill.metadata?.requires?.env) {
    console.log(chalk.gray('  Env vars    : ') + chalk.white(Object.keys(skill.metadata.requires.env).join(', ')));
  }
  console.log('');
}

async function checkSkills() {
  const skills = getSkills();
  if (skills.length === 0) {
    console.log(chalk.gray('\n  No skills installed.\n'));
    return;
  }
  let issues = 0;
  for (const skill of skills) {
    const skillPath = path.join(os.homedir(), '.natureco', 'skills', skill.slug || skill.name);
    const hasSkillMd = fs.existsSync(path.join(skillPath, 'SKILL.md'));
    const hasPackage = fs.existsSync(path.join(skillPath, 'package.json'));
    const status = hasSkillMd ? chalk.green('✓') : chalk.yellow('⚠ missing SKILL.md');
    console.log(`  ${status} ${chalk.white(skill.name)}`);
    console.log(chalk.gray(`     Path: ${skillPath}`));
    console.log(chalk.gray(`     Package: ${hasPackage ? chalk.green('✓') : chalk.gray('none')}`));
    if (!hasSkillMd) issues++;
  }
  if (issues > 0) {
    console.log(chalk.yellow(`\n  ⚠ ${issues} skills have issues\n`));
  } else {
    console.log(chalk.green(`\n  ✓ All ${skills.length} skills healthy\n`));
  }
}

async function listProposals() {
  const proposals = detector.loadProposals();
  const pending = proposals.filter(p => p.status === 'pending');

  console.log('\n' + tui.styled('  🧠 Self-Evolving Skill Proposals', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));
  console.log('  ' + tui.C.muted('Kullanımın tekrar eden pattern\'lerinden otomatik skill önerileri.\n'));

  if (pending.length === 0) {
    console.log('  ' + tui.C.muted('Şu an öneri yok. Daha fazla tool çağrısı yap, sistem öğrensin.'));
    console.log('  ' + tui.C.muted('Pattern\'leri sıfırla: ') + tui.C.brand('natureco skills forget\n'));
    return;
  }

  const rows = pending.map(p => ({
    name: p.suggestedName,
    count: p.count + 'x',
    pattern: p.pattern.length > 50 ? p.pattern.slice(0, 47) + '...' : p.pattern,
    first: new Date(p.firstSeen).toLocaleString(),
    id: p.id,
  }));

  console.log(tui.table(rows, [
    { key: 'name', label: 'Öneri', minWidth: 25, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'count', label: 'Tekrar', minWidth: 7, render: r => tui.styled(r.count, { color: tui.PALETTE.accent, bold: true }) },
    { key: 'pattern', label: 'Pattern', minWidth: 30, render: r => tui.C.muted(r.pattern) },
    { key: 'first', label: 'İlk', minWidth: 18, render: r => tui.C.muted(r.first) },
  ], { borderStyle: 'round', zebra: true }));

  console.log('\n  ' + tui.C.muted('Kabul et: ') + tui.C.brand('natureco skills accept <id>'));
  console.log('  ' + tui.C.muted('Reddet:  ') + tui.C.brand('natureco skills reject <id>\n'));
}

async function acceptProposalCommand(proposalId) {
  console.log(chalk.yellow('\n⏳ Skill oluşturuluyor...\n'));
  const result = detector.acceptProposal(proposalId);
  if (!result.success) {
    console.log(chalk.red(`\n❌ ${result.reason}\n`));
    process.exit(1);
  }
  console.log(chalk.green(`✅ Yeni skill oluşturuldu: ${result.skillName}\n`));
  console.log(chalk.gray(`   Yol: ${result.path}\n`));
  console.log(chalk.gray('   SKILL.md dosyasını düzenleyerek özelleştirebilirsin.\n'));
  audit.log(audit.ACTIONS.SKILL_AUTO, { proposalId, skillName: result.skillName });
}

module.exports = skills;
