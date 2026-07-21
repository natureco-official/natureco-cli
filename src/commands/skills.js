const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
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
  args = args || [];
  const [action, ...params] = args;

  if (!action || action === 'list') {
    await listSkills();
    return;
  }

  if (action === 'install') {
    const slug = params[0];
    if (!slug) {
      console.log(chalk.red(L('\n❌ Kullanım: natureco skills install <slug>\n', '\n❌ Usage: natureco skills install <slug>\n')));
      process.exit(1);
    }
    await installSkillCommand(slug);
    return;
  }

  if (action === 'remove') {
    const slug = params[0];
    if (!slug) {
      console.log(chalk.red(L('\n❌ Kullanım: natureco skills remove <slug>\n', '\n❌ Usage: natureco skills remove <slug>\n')));
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
      console.log(chalk.red(L('\n❌ Kullanım: natureco skills update --all\n', '\n❌ Usage: natureco skills update --all\n')));
      process.exit(1);
    }
    return;
  }

  if (action === 'create') {
    const name = params[0];
    if (!name) {
      console.log(chalk.red(L('\n❌ Kullanım: natureco skills create <ad>\n', '\n❌ Usage: natureco skills create <name>\n')));
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
      console.log(chalk.red(L('\n❌ Kullanım: natureco skills accept <proposal-id>\n', '\n❌ Usage: natureco skills accept <proposal-id>\n')));
      process.exit(1);
    }
    await acceptProposalCommand(proposalId);
    return;
  }

  if (action === 'reject') {
    const proposalId = params[0];
    if (!proposalId) {
      console.log(chalk.red(L('\n❌ Kullanım: natureco skills reject <proposal-id>\n', '\n❌ Usage: natureco skills reject <proposal-id>\n')));
      process.exit(1);
    }
    detector.rejectProposal(proposalId);
    console.log(chalk.green(`\n✅ Proposal reddedildi: ${proposalId}\n`));
    return;
  }

  if (action === 'forget') {
    detector.reset();
    console.log(chalk.yellow(L('\n🧹 Tüm pattern hafızası ve proposal\'lar silindi.\n', '\n🧹 All pattern memory and proposals cleared.\n')));
    return;
  }

  // v5.0.0: Marketplace
  if (action === 'marketplace' || action === 'mp') {
    await listMarketplace();
    return;
  }

  if (action === 'install-mp') {
    const skillName = params[0];
    if (!skillName) { console.log(chalk.red(L('\n❌ Kullanım: natureco skills install-mp <name>\n', '\n❌ Usage: natureco skills install-mp <name>\n'))); process.exit(1); }
    await installFromMarketplace(skillName);
    return;
  }

  if (action === 'search-mp') {
    const query = params[0];
    if (!query) { console.log(chalk.red(L('\n❌ Kullanım: natureco skills search-mp <query>\n', '\n❌ Usage: natureco skills search-mp <query>\n'))); process.exit(1); }
    await searchMarketplace(query);
    return;
  }

  if (action === 'remove-mp' || action === 'uninstall-mp') {
    const skillName = params[0];
    if (!skillName) { console.log(chalk.red(L('\n❌ Kullanım: natureco skills remove-mp <name>\n', '\n❌ Usage: natureco skills remove-mp <name>\n'))); process.exit(1); }
    uninstallMarketplace(skillName);
    return;
  }

  console.log(chalk.red(`\n❌ ${L('Geçersiz action', 'Invalid action')}: ${action}\n`));
  console.log(chalk.gray(L('Kullanım: natureco skills [list|install|remove|update|create|search|browse|info|check|suggest|accept|reject|forget|marketplace|install-mp|search-mp|remove-mp]\n', 'Usage: natureco skills [list|install|remove|update|create|search|browse|info|check|suggest|accept|reject|forget|marketplace|install-mp|search-mp|remove-mp]\n')));
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
    console.log('\n  ' + chalk.gray(L('Kur: ', 'Install: ')) + chalk.cyan('natureco skills install-mp <name>'));
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
    console.log(chalk.green('\n  ✓ ' + skillName + L(' kuruldu: ', ' installed: ') + result.path + '\n'));
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
    console.log(chalk.cyan.bold('\n  🔍 "' + query + L('" icin sonuclar\n', '" results\n')));
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
    console.log(chalk.green('\n  ✓ ' + skillName + L(' kaldirildi\n', ' removed\n')));
  } else {
    console.log(chalk.yellow('\n  ' + skillName + L(' zaten yok\n', ' already gone\n')));
  }
}

async function listSkills() {
  const allSkills = getSkills();
  const builtinCount = allSkills.filter(s => s.source === 'builtin').length;
  const userCount = allSkills.filter(s => s.source === 'user').length;

  console.log(chalk.gray('\n  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(L('\n  Yüklü Skill\'ler', '\n  Installed Skills')) + chalk.gray(`  —  ${L('toplam', 'total')} ${allSkills.length} (${builtinCount} ${L('yerleşik', 'built-in')}${userCount ? `, ${userCount} ${L('kişisel', 'personal')}` : ''})`));
  console.log(chalk.gray(L('  Yerleşikler: ~/.natureco/skills-builtin · Kişiseller: ~/.natureco/skills · Araçlar: ~/.natureco/tools\n', '  Built-in: ~/.natureco/skills-builtin · Personal: ~/.natureco/skills · Tools: ~/.natureco/tools\n')));

  if (allSkills.length === 0) {
    // Yerleşikler pakette gelir; bu duruma normalde ancak paket bozulursa düşülür
    console.log(chalk.red(L('  ⚠ Hiç skill bulunamadı — kurulum bozuk olabilir.', '  ⚠ No skills found — installation may be broken.')));
    console.log(chalk.gray(L('  Onarmak için: ', '  To repair: ')) + chalk.cyan('npm install -g natureco-cli') + chalk.gray(L(' (yeniden kurar)\n', ' (reinstalls)\n')));
    return;
  }

  allSkills.forEach((skill, index) => {
    const sourceLabel = skill.source === 'builtin' ? chalk.blue(L('[yerleşik]', '[built-in]')) :
                        skill.source === 'user' ? chalk.cyan(L('[kişisel]', '[personal]')) :
                        chalk.magenta(L('[proje]', '[project]'));
    console.log(chalk.white(`  ${index + 1}. ${skill.name} `) + sourceLabel);
    console.log(chalk.gray(`     ${skill.description}`));
    if (skill.metadata?.requires?.bins) {
      console.log(chalk.gray(`     ${L('Gerekli', 'Required')}: ${skill.metadata.requires.bins.join(', ')}`));
    }
    console.log('');
  });

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(`  ${L('Toplam', 'Total')}: ${allSkills.length} skill`));
  console.log(chalk.gray(L('  Kaldırmak için: ', '  To remove: ')) + chalk.cyan('natureco skills remove <slug>\n'));
}

async function installSkillCommand(slug) {
  console.log(chalk.yellow(`\n⏳ "${slug}" ${L("skill'i yükleniyor...", 'installing...')}\n`));

  try {
    await installSkill(slug);
    console.log(chalk.green(`✅ "${slug}" ${L('başarıyla yüklendi', 'installed successfully')}!\n`));
  } catch (err) {
    console.log(chalk.red(`\n❌ ${L('Hata', 'Error')}: ${err.message}\n`));
    process.exit(1);
  }
}

async function removeSkillCommand(slug) {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `"${slug}" ${L("skill'ini silmek istediğinizden emin misiniz?", '— delete this skill?')}`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray(L('\nİptal edildi.\n', '\nCancelled.\n')));
    return;
  }

  try {
    removeSkill(slug);
    console.log(chalk.green(`\n✅ "${slug}" ${L('silindi.', 'deleted.')}\n`));
  } catch (err) {
    console.log(chalk.red(`\n❌ ${L('Hata', 'Error')}: ${err.message}\n`));
    process.exit(1);
  }
}

async function updateAllSkillsCommand() {
  console.log(chalk.yellow(L('\n⏳ Tüm skill\'ler güncelleniyor...\n', '\n⏳ Updating all skills...\n')));

  try {
    const updated = await updateAllSkills();
    if (updated.length === 0) {
      console.log(chalk.gray(L('Güncellenecek skill bulunamadı.\n', 'No skills to update.\n')));
    } else {
      console.log(chalk.green(`✅ ${updated.length} skill ${L('güncellendi', 'updated')}:\n`));
      updated.forEach(s => console.log(chalk.cyan(`  - ${s}`)));
      console.log('');
    }
  } catch (err) {
    console.log(chalk.red(`\n❌ ${L('Hata', 'Error')}: ${err.message}\n`));
    process.exit(1);
  }
}

async function createSkillCommand(name) {
  console.log(chalk.yellow(`\n⏳ "${name}" skill ${L('şablonu oluşturuluyor...', 'template being created...')}\n`));

  try {
    const skillPath = createSkillTemplate(name);
    console.log(chalk.green(`✅ ${L('Skill şablonu oluşturuldu', 'Skill template created')}:\n`));
    console.log(chalk.cyan(`   ${skillPath}\n`));
    console.log(chalk.gray(L('SKILL.md dosyasını düzenleyerek skill\'i özelleştirin.\n', 'Customize the skill by editing SKILL.md.\n')));
  } catch (err) {
    console.log(chalk.red(`\n❌ ${L('Hata', 'Error')}: ${err.message}\n`));
    process.exit(1);
  }
}

async function searchSkillsCommand(query) {
  if (!query || query.trim().length === 0) {
    try {
      const popularSkills = await getPopularSkills();
      console.log(chalk.yellow(L('\nPopüler Skill\'ler:\n', '\nPopular Skills:\n')));
      popularSkills.forEach(skill => {
        console.log(chalk.cyan(`  ${skill.name.padEnd(15)}`), chalk.gray(skill.description));
      });
    } catch (err) {
      console.log(chalk.red(`\n  ❌ ${L("Popüler skill'ler alınamadı", 'Could not fetch popular skills')}: ${err.message}\n`));
    }
    console.log('');
    console.log(chalk.gray(L('Kurmak için: ', 'To install: ')), chalk.cyan('natureco skills install <slug>'));
    console.log(chalk.gray(L('Örnek: ', 'Example: ')), chalk.cyan('natureco skills install github'));
    console.log(chalk.gray('ClawHub: '), chalk.cyan('natureco skills install clawhub:github'));
    console.log('');
    return;
  }

  console.log(chalk.yellow(`\n⏳ "${query}" ${L('aranıyor...', 'searching...')}\n`));

  try {
    // ClawHub search API
    const searchUrl = `https://clawhub.ai/api/skills?q=${encodeURIComponent(query)}&limit=10`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      throw new SkillError(L('ClawHub API\'ye erişilemedi', 'Could not reach the ClawHub API'), 'fetch', `https://clawhub.ai/api/skills?q=${encodeURIComponent(query)}`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new SkillError(L('ClawHub geçersiz yanıt döndü (JSON bekleniyordu)', 'ClawHub returned an invalid response (JSON expected)'), 'parse', searchUrl);
    }
    const results = data.skills || [];

    if (results.length === 0) {
      console.log(chalk.yellow(`"${query}" ${L('için sonuç bulunamadı.', '— no results found.')}\n`));
      return;
    }

    console.log(chalk.yellow(`"${query}" ${L('için', 'for')} ${results.length} ${L('sonuç', 'results')}:\n`));
    results.forEach(skill => {
      console.log(chalk.cyan(`  ${skill.name.padEnd(15)}`), chalk.gray(skill.description || L('Açıklama yok', 'No description')));
      console.log(chalk.gray(`    ${L('Kurmak için', 'To install')}: natureco skills install clawhub:${skill.slug}`));
    });
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${L('Arama başarısız', 'Search failed')}: ${err.message}\n`));
  }
}

async function browseSkillsCommand() {
  let popularSkills;
  try {
    popularSkills = await getPopularSkills();
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${L("Popüler skill'ler alınamadı", 'Could not fetch popular skills')}: ${err.message}\n`));
    return;
  }
  
  console.log(chalk.green.bold(L('\n╭─ Popüler Skill\'ler ─╮\n', '\n╭─ Popular Skills ─╮\n')));

  process.stdin.resume();
  const { selectedSkills } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSkills',
      message: L('Kurmak istediğiniz skill\'leri seçin:', 'Select the skills you want to install:'),
      choices: popularSkills.map(skill => ({
        name: `${skill.name} - ${skill.description}`,
        value: skill.source === 'clawhub' ? `clawhub:${skill.slug}` : skill.slug,
      })),
    },
  ]);
  process.stdin.pause();

  if (selectedSkills.length === 0) {
    console.log(chalk.gray(L('\nHiçbir skill seçilmedi.\n', '\nNo skills selected.\n')));
    return;
  }

  console.log(chalk.yellow(`\n⏳ ${selectedSkills.length} skill ${L('kuruluyor...', 'installing...')}\n`));

  for (const slug of selectedSkills) {
    try {
      await installSkill(slug);
      console.log(chalk.green(`✅ ${slug} ${L('kuruldu', 'installed')}`));
    } catch (err) {
      console.log(chalk.red(`❌ ${slug} ${L('kurulamadı', 'could not be installed')}: ${err.message}`));
    }
  }

  console.log(chalk.green(L('\n✅ Kurulum tamamlandı!\n', '\n✅ Installation complete!\n')));
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
  console.log('  ' + tui.C.muted(L('Kullanımın tekrar eden pattern\'lerinden otomatik skill önerileri.\n', 'Automatic skill suggestions from your recurring usage patterns.\n')));

  if (pending.length === 0) {
    console.log('  ' + tui.C.muted(L('Şu an öneri yok. Daha fazla tool çağrısı yap, sistem öğrensin.', 'No suggestions right now. Make more tool calls so the system can learn.')));
    console.log('  ' + tui.C.muted(L('Pattern\'leri sıfırla: ', 'Reset patterns: ')) + tui.C.brand('natureco skills forget\n'));
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
    { key: 'name', label: L('Öneri', 'Suggestion'), minWidth: 25, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
    { key: 'count', label: L('Tekrar', 'Repeats'), minWidth: 7, render: r => tui.styled(r.count, { color: tui.PALETTE.accent, bold: true }) },
    { key: 'pattern', label: 'Pattern', minWidth: 30, render: r => tui.C.muted(r.pattern) },
    { key: 'first', label: L('İlk', 'First'), minWidth: 18, render: r => tui.C.muted(r.first) },
  ], { borderStyle: 'round', zebra: true }));

  console.log('\n  ' + tui.C.muted(L('Kabul et: ', 'Accept: ')) + tui.C.brand('natureco skills accept <id>'));
  console.log('  ' + tui.C.muted(L('Reddet:  ', 'Reject:  ')) + tui.C.brand('natureco skills reject <id>\n'));
}

async function acceptProposalCommand(proposalId) {
  console.log(chalk.yellow(L('\n⏳ Skill oluşturuluyor...\n', '\n⏳ Creating skill...\n')));
  const result = detector.acceptProposal(proposalId);
  if (!result.success) {
    console.log(chalk.red(`\n❌ ${result.reason}\n`));
    process.exit(1);
  }
  console.log(chalk.green(`✅ ${L('Yeni skill oluşturuldu', 'New skill created')}: ${result.skillName}\n`));
  console.log(chalk.gray(`   ${L('Yol', 'Path')}: ${result.path}\n`));
  console.log(chalk.gray(L('   SKILL.md dosyasını düzenleyerek özelleştirebilirsin.\n', '   You can customize it by editing SKILL.md.\n')));
  audit.log(audit.ACTIONS.SKILL_AUTO, { proposalId, skillName: result.skillName });
}

module.exports = skills;
