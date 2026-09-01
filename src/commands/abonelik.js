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
const { tumDurumlar } = require('../utils/abonelik-saglayicilari');
const { getAllConfig, setConfigValue } = require('../utils/config');
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
  if (action === 'kullan' || action === 'use') return await cmdKullan(args[1]);
  if (action === 'birak' || action === 'off') return cmdBirak();

  console.log(chalk.red(`\n  ${L('Bilinmeyen eylem', 'Unknown action')}: ${action}\n`));
  console.log(chalk.gray('  natureco abonelik <durum|modeller|kota>\n'));
  process.exitCode = 1;
}

async function cmdDurum() {
  baslik(L('Abonelik Sağlayıcıları', 'Subscription Providers'));

  const durumlar = tumDurumlar();
  for (const d of Object.values(durumlar)) {
    const isaret = d.kullanilabilir ? chalk.green('●') : chalk.gray('○');
    const etiket = d.kullanilabilir ? chalk.green(L('kullanılabilir', 'available')) : chalk.gray(d.sebep);
    console.log(`  ${isaret} ${chalk.white(d.ad.padEnd(22))} ${etiket}`);
    if (d.plan) console.log(chalk.gray(`      ${L('plan', 'plan')}: ${d.plan}`));
    if (d.surum) console.log(chalk.gray(`      ${d.surum}  ·  ${d.arayuz}`));
    if (!d.kullanilabilir) {
      const oneri = /kurulu değil/.test(d.sebep) ? d.kurulum : d.giris;
      console.log(chalk.gray('      → ') + chalk.cyan(oneri));
    }
    console.log('');
  }

  console.log(chalk.gray(`  ${L('İstekler her zaman sağlayıcının KENDİ CLI\'si üzerinden gider;', 'Requests always go through the provider\'s OWN CLI;')}`));
  console.log(chalk.gray(`  ${L('token\'a dokunulmaz, kimlik taklidi yapılmaz.', 'tokens are untouched, no client impersonation.')}\n`));

  // ChatGPT kullanılabilirse canlı hesap bilgisini de göster.
  if (durumlar.codex && durumlar.codex.kullanilabilir) {
    const c = new CodexAbonelikIstemcisi({ surum: version });
    try {
      await c.baslat();
      const h = await c.hesap();
      const hesap = h?.account || {};
      console.log(chalk.gray('  ' + '─'.repeat(52)));
      console.log(`  ${chalk.white('ChatGPT')}  ${L('plan', 'plan')}: ${chalk.white(hesap.planType || '?')}  ·  ${chalk.gray(hesap.type || '?')}\n`);
    } catch { /* canlı bilgi zorunlu değil */ } finally { c.kapat(); }
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

/** Adresten yalnızca ana makine adı; kullanıcı/parola ve yol düşürülür. */
function sadeAdres(url) {
  try { return new URL(url).host; } catch { return '(geçersiz adres)'; }
}

/** Abonelikte kullanılabilir ilk model; alınamazsa null. */
async function ilkAbonelikModeli() {
  const c = new CodexAbonelikIstemcisi({ surum: version });
  try {
    await c.baslat();
    const r = await c.modeller();
    const ms = (r?.models || r?.data || []).map(m => m.id || m.slug || m.name).filter(Boolean);
    return ms[0] || null;
  } catch {
    return null;
  } finally { c.kapat(); }
}

/**
 * Sohbeti aboneliğe geçirir.
 *
 * Eski sağlayıcı ayarı SİLİNMEZ, `oncekiSaglayici` altında saklanır; `birak`
 * dediğinde kullanıcı API anahtarını yeniden girmek zorunda kalmasın.
 */
async function cmdKullan(hangi) {
  const anahtar = (hangi || 'codex').toLowerCase();
  const d = tumDurumlar()[anahtar];
  if (!d) {
    console.log(chalk.red(`\n  ${L('Bilinmeyen sağlayıcı', 'Unknown provider')}: ${anahtar}\n`));
    console.log(chalk.gray(`  ${Object.keys(tumDurumlar()).join(', ')}\n`));
    process.exitCode = 1;
    return;
  }
  if (!d.kullanilabilir) {
    const oneri = /kurulu değil/.test(d.sebep) ? d.kurulum : d.giris;
    console.log(chalk.red(`\n  ${d.ad}: ${d.sebep}\n`));
    console.log(chalk.gray('  → ') + chalk.cyan(oneri) + '\n');
    process.exitCode = 1;
    return;
  }

  const cfg = getAllConfig();
  if (!String(cfg.providerUrl || '').startsWith('abonelik') && cfg.providerUrl) {
    setConfigValue('oncekiSaglayici', JSON.stringify({
      providerUrl: cfg.providerUrl, providerModel: cfg.providerModel,
    }));
  }
  setConfigValue('providerUrl', `abonelik:${anahtar}`);

  // MODELİ DE GEÇİRMEK ŞART. Yalnızca sağlayıcıyı değiştirmek yetmiyor:
  // yapılandırmada API kataloğundan kalma bir model adı (ör. 'MiniMax-M2.5')
  // duruyorsa abonelikte böyle bir model yok ve ilk istek hata alıyor.
  // Ölçüldü — `natureco code` tam olarak bu yüzden 400 döndü.
  const model = await ilkAbonelikModeli();
  if (model) {
    setConfigValue('providerModel', model);
    console.log(chalk.green(`\n  ${d.ad} ${L('aboneliği sohbet için etkin.', 'subscription enabled for chat.')}`));
    console.log(chalk.gray(`  ${L('model', 'model')}: `) + chalk.white(model) + '\n');
    console.log(chalk.gray(`  ${L('Diğer modeller', 'Other models')}: `) + chalk.cyan('natureco abonelik modeller') + '\n');
  } else {
    console.log(chalk.green(`\n  ${d.ad} ${L('aboneliği sohbet için etkin.', 'subscription enabled for chat.')}\n`));
    console.log(chalk.yellow(`  ${L('Model listesi alınamadı; modeli elle seçin:', 'Could not list models; set one manually:')} `)
      + chalk.cyan('natureco abonelik modeller') + '\n');
  }
  console.log(chalk.gray(`  ${L('Geri almak için', 'To revert')}: `) + chalk.cyan('natureco abonelik birak') + '\n');
}

function cmdBirak() {
  const cfg = getAllConfig();
  if (!String(cfg.providerUrl || '').startsWith('abonelik')) {
    console.log(chalk.gray(`\n  ${L('Abonelik kipi zaten kapalı.', 'Subscription mode is already off.')}\n`));
    return;
  }
  let onceki = null;
  try { onceki = JSON.parse(cfg.oncekiSaglayici || 'null'); } catch { /* bozuksa yok say */ }
  if (onceki && onceki.providerUrl) {
    setConfigValue('providerUrl', onceki.providerUrl);
    if (onceki.providerModel) setConfigValue('providerModel', onceki.providerModel);
    // Yalnızca ana makine adı yazılır. Bazı sağlayıcılar kimlik bilgisini
    // adresin içine gömer; tam URL'yi basmak onu ekrana ve loglara düşürür.
    console.log(chalk.green(`\n  ${L('Önceki sağlayıcıya dönüldü', 'Reverted to previous provider')}: ${sadeAdres(onceki.providerUrl)}\n`));
  } else {
    setConfigValue('providerUrl', '');
    console.log(chalk.gray(`\n  ${L('Abonelik kipi kapatıldı. Sağlayıcı için', 'Subscription mode off. For a provider')}: `)
      + chalk.cyan('natureco setup') + '\n');
  }
}

module.exports = abonelik;
module.exports._internal = { cmdDurum, cmdModeller, cmdKota, cmdKullan, cmdBirak };
