'use strict';

/**
 * abonelik-baglayici — sohbet döngüsünü abonelik köprüsüne bağlar.
 *
 * REPL sağlayıcıyı `providerUrl` + `providerApiKey` üzerinden tanır. Abonelik
 * kipinde bu ikisini köprünün yerel ucuyla değiştiririz; REPL'in geri kalanı
 * (akış, yedek zinciri, token muhasebesi) hiçbir şey değişmemiş gibi çalışır.
 *
 * ARAÇ ÇAĞRILARI: köprü OpenAI'ın `tools` alanını İLETMEZ — abonelik ucundaki
 * ajan kendi araçlarına sahip ve onları natureco'nun onay katmanı dışında
 * çalıştırmasını istemiyoruz (köprü bu yüzden salt okunur açılır). Bu yüzden
 * abonelik kipinde `nativeToolCalls` kapatılır ve REPL, sağlayıcı yerel araç
 * çağrısı desteklemediğinde kullandığı hazır akışa (chatWorkflow) düşer. Araçlar
 * çalışmaya devam eder; kararı model metinle verir, çalıştıran natureco olur.
 */

const { AbonelikKoprusu } = require('./abonelik-kopru');
const { tumDurumlar } = require('./abonelik-saglayicilari');
const { calismaZamaniAyariniAyarla } = require('./config');

/** Yapılandırma abonelik kipinde mi? */
function abonelikKipi(cfg) {
  return String(cfg?.provider || cfg?.providerUrl || '').startsWith('abonelik');
}

/** Abonelik kipindeki yapılandırmadan sağlayıcı anahtarını çıkarır. */
function secilenSaglayici(cfg) {
  const m = String(cfg?.provider || cfg?.providerUrl || '').match(/^abonelik:([a-z]+)/i);
  return m ? m[1].toLowerCase() : 'codex';
}

/**
 * Köprüyü açar ve REPL'in kullanacağı sağlayıcı bilgilerini döndürür.
 * Kullanılamıyorsa SEBEBİYLE hata verir — sessizce API anahtarına düşmez,
 * çünkü kullanıcı bilerek aboneliği seçmiştir.
 */
async function abonelikBagla(cfg, { surum } = {}) {
  const anahtar = secilenSaglayici(cfg);
  const durum = tumDurumlar()[anahtar];

  if (!durum) throw new Error(`bilinmeyen abonelik sağlayıcısı: ${anahtar}`);
  if (!durum.kullanilabilir) {
    const oneri = /kurulu değil/.test(durum.sebep) ? durum.kurulum : durum.giris;
    throw new Error(`${durum.ad} aboneliği kullanılamıyor: ${durum.sebep} → ${oneri}`);
  }
  if (anahtar !== 'codex') {
    throw new Error(`${durum.ad} aboneliği henüz sohbet için bağlanmadı; şu an yalnızca ChatGPT destekleniyor`);
  }

  const kopru = new AbonelikKoprusu({ surum });
  await kopru.baslat();

  // TEK YERDEN DUYUR. Yalnızca çağıranın elindeki nesneyi değiştirmek yetmez:
  // workflow gibi katmanlar ayarı diskten KENDİLERİ okuyor ve orada hâlâ
  // "abonelik:codex" yazıyor. Ölçüldü — sohbet bu yüzden
  // `Protocol "abonelik:" not supported` ile düşüyordu. Çalışma zamanı üstü,
  // ayarı okuyan herkesi tek hamlede doğru adrese yönlendirir; diske yazılmaz.
  calismaZamaniAyariniAyarla({
    providerUrl: kopru.url,
    providerApiKey: kopru.anahtar,
    // Köprü OpenAI `tools` alanını iletmez; yerel araç çağrısı kullanılamaz.
    nativeToolCalls: false,
  });

  return {
    providerUrl: kopru.url,
    providerApiKey: kopru.anahtar,
    saglayici: durum.ad,
    kapat: async () => { calismaZamaniAyariniAyarla(null); await kopru.kapat(); },
  };
}

module.exports = { abonelikKipi, secilenSaglayici, abonelikBagla };
