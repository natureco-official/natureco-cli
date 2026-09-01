'use strict';

/**
 * `natureco abonelik` — ChatGPT aboneliğiyle model kullanımı.
 *
 * API anahtarı ödemeden, mevcut ChatGPT Plus/Pro aboneliğiyle model
 * çalıştırmayı sağlar. İstek OpenAI'ın kendi `codex` istemcisi üzerinden
 * gider (bkz. utils/codex-subscription.js — neden bu yol seçildi).
 */

const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const { abonelikDurumu, CodexAbonelikIstemcisi } = require('../utils/codex-subscription');
const { version } = require('../../package.json');

function baslik(s) {
  console.log(chalk.cyan(`\n  ${s}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(52)));
}

async function abonelik(args) {
  const [action] = args || [];
  if (!action || action === 'durum' || action === 'status') return await cmdDurum();
  if (action === 'modeller' || action === 'models') return await cmdModeller();
  if (action === 'kota' || action === 'usage') return await cmdKota();

  console.log(chalk.red(`\n  ${L('Bilinmeyen eylem', 'Unknown action')}: ${action}\n`));
  console.log(chalk.gray('  natureco abonelik <durum|modeller|kota>\n'));
  process.exitCode = 1;
}

async function cmdDurum() {
  baslik(L('ChatGPT Aboneliği', 'ChatGPT Subscription'));
  const d = abonelikDurumu();

  if (!d.kullanilabilir) {
    console.log(`  ${chalk.red(L('Kullanılamıyor', 'Unavailable'))}`);
    console.log(chalk.gray(`  ${d.sebep}\n`));
    if (!d.codexVar) {
      console.log(chalk.gray(`  ${L('Kurulum', 'Install')}: `) + chalk.cyan('npm i -g @openai/codex'));
    } else if (!d.oturumAcik) {
      console.log(chalk.gray(`  ${L('Giriş', 'Sign in')}: `) + chalk.cyan('codex login'));
    }
    console.log('');
    return;
  }

  const c = new CodexAbonelikIstemcisi({ surum: version });
  try {
    await c.baslat();
    const h = await c.hesap();
    const hesap = h?.account || {};
    console.log(`  ${chalk.white(L('Durum', 'Status'))}   ${chalk.green(L('Kullanılabilir', 'Available'))}`);
    console.log(`  ${chalk.white(L('Plan', 'Plan'))}     ${chalk.white(hesap.planType || '?')}`);
    console.log(`  ${chalk.white(L('Kimlik', 'Auth'))}   ${chalk.gray(hesap.type || '?')}`);
    console.log('');
    console.log(chalk.gray(`  ${L('İstekler OpenAI\'ın kendi codex istemcisi üzerinden gider;', 'Requests go through OpenAI\'s own codex client;')}`));
    console.log(chalk.gray(`  ${L('token\'a dokunulmaz, kimlik taklidi yapılmaz.', 'tokens are untouched, no client impersonation.')}\n`));
  } catch (e) {
    console.log(`  ${chalk.red(L('Bağlanılamadı', 'Connection failed'))}: ${e.message}\n`);
    process.exitCode = 1;
  } finally {
    c.kapat();
  }
}

async function cmdModeller() {
  const d = abonelikDurumu();
  if (!d.kullanilabilir) {
    console.log(chalk.red(`\n  ${d.sebep}\n`));
    process.exitCode = 1;
    return;
  }
  baslik(L('Abonelikte Kullanılabilir Modeller', 'Models Available on Subscription'));
  const c = new CodexAbonelikIstemcisi({ surum: version });
  try {
    await c.baslat();
    const r = await c.modeller();
    const ms = r?.models || r?.data || [];
    if (!ms.length) {
      console.log(chalk.gray(`  ${L('Model listelenemedi.', 'No models listed.')}\n`));
      return;
    }
    for (const m of ms) {
      const id = m.id || m.slug || m.name;
      const ek = m.contextWindow || m.context_window;
      console.log(`  ${chalk.white(id)}${ek ? chalk.gray(`  ${Math.round(ek / 1000)}K bağlam`) : ''}`);
    }
    console.log('');
    console.log(chalk.gray(`  ${L('Not: bu liste API kataloğundan FARKLIDIR — bazı modeller yalnızca', 'Note: this differs from the API catalog — some models are only')}`));
    console.log(chalk.gray(`  ${L('abonelikte, bazıları yalnızca API\'de bulunur.', 'on the subscription, others only on the API.')}\n`));
  } catch (e) {
    console.log(chalk.red(`  ${e.message}\n`));
    process.exitCode = 1;
  } finally {
    c.kapat();
  }
}

async function cmdKota() {
  const d = abonelikDurumu();
  if (!d.kullanilabilir) {
    console.log(chalk.red(`\n  ${d.sebep}\n`));
    process.exitCode = 1;
    return;
  }
  baslik(L('Abonelik Kotası', 'Subscription Quota'));
  const c = new CodexAbonelikIstemcisi({ surum: version });
  try {
    await c.baslat();
    const r = await c.kotalar();
    const rl = r?.rateLimits || {};
    const yaz = (ad, p) => {
      if (!p) return;
      const kullanilan = Number(p.usedPercent ?? 0);
      const dolu = Math.round(kullanilan / 5);
      const cubuk = '█'.repeat(dolu) + '░'.repeat(20 - dolu);
      const renk = kullanilan >= 90 ? chalk.red : kullanilan >= 70 ? chalk.yellow : chalk.green;
      console.log(`  ${chalk.white(ad.padEnd(10))} ${renk(cubuk)} %${kullanilan}`);
      if (p.resetsAt) {
        const t = new Date(Number(p.resetsAt) * 1000);
        if (!Number.isNaN(t.getTime())) {
          console.log(chalk.gray(`  ${' '.repeat(10)} ${L('sıfırlanma', 'resets')}: ${t.toLocaleString()}`));
        }
      }
    };
    yaz(L('Birincil', 'Primary'), rl.primary);
    yaz(L('İkincil', 'Secondary'), rl.secondary);
    const k = rl.credits;
    if (k) {
      console.log('');
      console.log(`  ${chalk.white(L('Kredi', 'Credits'))}     ${k.unlimited ? L('sınırsız', 'unlimited') : (k.hasCredits ? String(k.balance ?? '?') : L('yok', 'none'))}`);
    }
    console.log('');
  } catch (e) {
    console.log(chalk.red(`  ${e.message}\n`));
    process.exitCode = 1;
  } finally {
    c.kapat();
  }
}

module.exports = abonelik;
module.exports._internal = { cmdDurum, cmdModeller, cmdKota };
