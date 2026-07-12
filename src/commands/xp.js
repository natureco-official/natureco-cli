/**
 * natureco xp — NatureCo XP/Level sistemi (Phase 6)
 *
 * XP/Level sistemi — kullanıcıları ödüllendirir.
 * XP kazanma yolları:
 *   - Komut çalıştırma (1 XP)
 *   - Audit log kaydı (0.1 XP)
 *   - Skill kabul etme (5 XP)
 *   - Bir bug raporlama (10 XP)
 *   - Haftalık aktif kullanım (50 XP bonus)
 *
 * Kullanım:
 *   natureco xp               Mevcut durum
 *   natureco xp stats         Detaylı istatistikler
 *   natureco xp leaderboard   Top kullanıcılar
 *   natureco xp rewards       Aktif ödüller
 */

const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const tui = require('../utils/tui');
const fs = require('fs');
const path = require('path');
const os = require('os');

const XP_FILE = path.join(os.homedir(), '.natureco', 'xp.json');
const LEVELS = [
  { level: 1, minXP: 0,    title: L('🌱 Tohum', '🌱 Seed'),      color: chalk.green },
  { level: 2, minXP: 100,  title: L('🌿 Filiz', '🌿 Sprout'),      color: chalk.green },
  { level: 3, minXP: 300,  title: L('🍃 Yaprak', '🍃 Leaf'),     color: chalk.cyan },
  { level: 4, minXP: 700,  title: L('🌳 Ağaç', '🌳 Tree'),       color: chalk.blue },
  { level: 5, minXP: 1500, title: L('🌲 Orman', '🌲 Forest'),      color: chalk.yellow },
  { level: 6, minXP: 3000, title: L('🏔️  Dağ', '🏔️  Mountain'),       color: chalk.magenta },
  { level: 7, minXP: 6000, title: L('⭐ Yıldız', '⭐ Star'),     color: chalk.red.bold },
  { level: 8, minXP: 12000,title: L('🌌 Galaksi', '🌌 Galaxy'),    color: chalk.hex('#a78bfa').bold },
];

function loadXP() {
  try {
    if (fs.existsSync(XP_FILE)) return JSON.parse(fs.readFileSync(XP_FILE, 'utf8'));
  } catch {}
  return { xp: 0, history: [], username: os.userInfo().username };
}

function saveXP(data) {
  const dir = path.dirname(XP_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(XP_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getLevel(xp) {
  let current = LEVELS[0];
  for (const lv of LEVELS) {
    if (xp >= lv.minXP) current = lv;
  }
  return current;
}

function getNextLevel(xp) {
  for (const lv of LEVELS) {
    if (lv.minXP > xp) return lv;
  }
  return null;
}

function addXP(amount, reason) {
  const data = loadXP();
  data.xp += amount;
  data.history.push({ ts: new Date().toISOString(), amount, reason });
  // Son 100 history tut
  if (data.history.length > 100) data.history = data.history.slice(-100);
  saveXP(data);
  return data;
}

function cmdStatus() {
  const data = loadXP();
  const current = getLevel(data.xp);
  const next = getNextLevel(data.xp);

  console.log('\n' + tui.styled(L('  ⭐ NatureCo XP Sistemi', '  ⭐ NatureCo XP System'), { color: tui.PALETTE.accent, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  // Üst metrik kartı
  const w = 50;
  const lines = [];
  lines.push(tui.styled('  ╭' + '─'.repeat(w) + '╮', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted(L('Kullanıcı    ', 'User         ')) + tui.styled(data.username.padEnd(20), { color: tui.PALETTE.text, bold: true }) + '  ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted('XP           ') + tui.styled(data.xp.toLocaleString().padStart(8), { color: tui.PALETTE.primary, bold: true }) + '   ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  │', { color: tui.PALETTE.border }) + '  ' + tui.C.muted(L('Seviye       ', 'Level        ')) + current.color(`Lv.${current.level} ${current.title}`.padEnd(20)) + '  ' + tui.styled('│', { color: tui.PALETTE.border }));
  lines.push(tui.styled('  ╰' + '─'.repeat(w) + '╯', { color: tui.PALETTE.border }));
  console.log(lines.join('\n'));

  if (next) {
    const needed = next.minXP - data.xp;
    const progress = ((data.xp - current.minXP) / (next.minXP - current.minXP)) * 100;
    const filled = Math.floor(progress / 5);
    const bar = tui.progressBar(data.xp - current.minXP, next.minXP - current.minXP, {
      width: 40, showPercent: true,
    });
    console.log('\n  ' + tui.C.muted(L('Sonraki: ', 'Next: ')) + next.color(`${next.title}`) + tui.C.muted(` (${needed} XP ${L('kaldı', 'left')})`));
    console.log('  ' + bar);
  } else {
    console.log('\n  ' + tui.styled(L('  🌟 Maksimum seviye!', '  🌟 Max level!'), { color: tui.PALETTE.success, bold: true }));
  }

  // Son kazanımlar — TUI tablo
  if (data.history.length > 0) {
    console.log('\n' + tui.styled(L('  📜 Son XP Kazanımları', '  📜 Recent XP Gains'), { color: tui.PALETTE.secondary, bold: true }));
    const rows = data.history.slice(-5).reverse().map(h => ({
      amount: (h.amount > 0 ? '+' : '') + h.amount,
      ts: new Date(h.ts).toLocaleString(),
      reason: h.reason,
    }));
    console.log('\n' + tui.table(rows, [
      { key: 'amount', label: 'XP', minWidth: 8, render: r => tui.styled(r.amount, { color: r.amount.startsWith('+') ? tui.PALETTE.success : tui.PALETTE.danger, bold: true }) },
      { key: 'ts', label: L('Zaman', 'Time'), minWidth: 22, render: r => tui.C.muted(r.ts) },
      { key: 'reason', label: L('Sebep', 'Reason'), minWidth: 30, render: r => tui.C.text(r.reason) },
    ], { borderStyle: 'round', zebra: true }));
  }
  console.log('');
}

function cmdStats() {
  const data = loadXP();
  console.log(chalk.bold(L('\n  📊 XP İstatistikleri\n', '\n  📊 XP Statistics\n')));
  console.log(chalk.gray(L('  Toplam XP: ', '  Total XP: ')) + chalk.cyan(data.xp.toLocaleString()));
  console.log(chalk.gray(L('  Toplam kayıt: ', '  Total records: ')) + chalk.cyan(data.history.length));

  // Reason bazlı
  const byReason = {};
  for (const h of data.history) {
    byReason[h.reason] = (byReason[h.reason] || 0) + h.amount;
  }
  if (Object.keys(byReason).length > 0) {
    console.log(chalk.bold(L('\n  🏷️  Kaynak Bazlı XP:\n', '\n  🏷️  XP by Source:\n')));
    for (const [reason, amount] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${reason.padEnd(30)} ${chalk.cyan((amount > 0 ? '+' : '') + amount)} XP`);
    }
  }
  console.log('');
}

function cmdLeaderboard() {
  console.log(chalk.cyan(L('\n  🏆 Liderlik Tablosu\n', '\n  🏆 Leaderboard\n')));
  console.log(chalk.gray(L('  Bu özellik api.natureco.me hazır olunca tam çalışacak.\n', '  This feature will fully work once api.natureco.me is ready.\n')));
  console.log(chalk.gray(L('  Şimdilik senin sıralaman local XP dosyanda.\n', '  For now your ranking is in your local XP file.\n')));
  cmdStatus();
}

function cmdRewards() {
  console.log('\n' + tui.styled(L('  🎁 Aktif Ödüller', '  🎁 Active Rewards'), { color: tui.PALETTE.accent, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  const rows = [
    { level: 'Lv.2', xp: '100 XP', reward: L('NatureCo sticker paketi', 'NatureCo sticker pack'), color: tui.PALETTE.success },
    { level: 'Lv.3', xp: '300 XP', reward: L('NatureBot\'ta özel bot erişimi', 'Special bot access on NatureBot'), color: tui.PALETTE.success },
    { level: 'Lv.4', xp: '700 XP', reward: L('Medium\'da otomatik yayınlama', 'Auto-publishing on Medium'), color: tui.PALETTE.secondary },
    { level: 'Lv.5', xp: '1500 XP', reward: L('NatureCo Pro ayda 1 ay ücretsiz', '1 free month of NatureCo Pro'), color: tui.PALETTE.secondary },
    { level: 'Lv.6', xp: '3000 XP', reward: L('Özel NatureCo rozeti', 'Special NatureCo badge'), color: tui.PALETTE.accent },
    { level: 'Lv.7', xp: '6000 XP', reward: L('@Naturecofficial\'dan mention', 'Mention from @Naturecofficial'), color: tui.PALETTE.warning },
    { level: 'Lv.8', xp: '12000 XP', reward: L('Founder statüsü (sınırlı)', 'Founder status (limited)'), color: tui.PALETTE.danger },
  ];

  console.log('\n' + tui.table(rows, [
    { key: 'level', label: L('Seviye', 'Level'), minWidth: 8, render: r => tui.styled(r.level, { color: r.color, bold: true }) },
    { key: 'xp', label: L('Eşik', 'Threshold'), minWidth: 10, render: r => tui.C.brand(r.xp) },
    { key: 'reward', label: L('Ödül', 'Reward'), minWidth: 35, render: r => tui.C.text(r.reward) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function xp(args) {
  const [action] = args || [];
  if (!action) return cmdStatus();
  if (action === 'stats') return cmdStats();
  if (action === 'leaderboard') return cmdLeaderboard();
  if (action === 'rewards') return cmdRewards();
  if (action === 'help') {
    console.log(chalk.yellow(L('\n  Kullanım:', '\n  Usage:')));
    console.log(chalk.gray(L('    natureco xp                  Mevcut durum', '    natureco xp                  Current status')));
    console.log(chalk.gray(L('    natureco xp stats            İstatistikler', '    natureco xp stats            Statistics')));
    console.log(chalk.gray(L('    natureco xp leaderboard     Liderlik', '    natureco xp leaderboard     Leaderboard')));
    console.log(chalk.gray(L('    natureco xp rewards          Aktif ödüller', '    natureco xp rewards          Active rewards')));
    console.log('');
    return;
  }
  console.log(chalk.red(`\n  ${L('Bilinmeyen', 'Unknown')}: ${action}\n`));
}

// Export addXP — diğer modüller XP kazandırabilsin
xp.addXP = addXP;
xp.getXP = () => loadXP().xp;

module.exports = xp;
