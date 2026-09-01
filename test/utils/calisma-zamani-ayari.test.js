/**
 * Çalışma zamanı ayar üstü — abonelik köprüsü gibi çalışma anında doğan
 * sağlayıcılar için.
 *
 * BU TESTLERİN SEBEBİ (ölçülmüş iki hata):
 *  1) Yalnızca çağıranın elindeki ayar nesnesini değiştirmek YETMİYOR: workflow
 *     gibi katmanlar ayarı kendileri okuyor ve orada hâlâ 'abonelik:codex'
 *     yazıyordu — sohbet `Protocol "abonelik:" not supported` ile düşüyordu.
 *  2) `setConfigValue` ayarı okuyup geri YAZIYOR. Üst katman oraya sızarsa,
 *     köprünün her açılışta değişen adresi ve GİZLİ ANAHTARI kullanıcının ayar
 *     dosyasına kalıcı olarak yazılırdı.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const AYAR = path.join(os.homedir(), '.natureco', 'config.json');

let config;
let yedek = null;

beforeEach(() => {
  yedek = fs.existsSync(AYAR) ? fs.readFileSync(AYAR, 'utf8') : null;
  // Modül önbelleğini sıfırla — testler birbirinin üstünü etkilemesin.
  delete require.cache[require.resolve('../../src/utils/config')];
  config = require('../../src/utils/config');
  config.calismaZamaniAyariniAyarla(null);
});

afterEach(() => {
  config.calismaZamaniAyariniAyarla(null);
  if (yedek !== null) fs.writeFileSync(AYAR, yedek, 'utf8');
});

describe('çalışma zamanı ayar üstü', () => {
  test('okuyucular üstü görür', () => {
    config.calismaZamaniAyariniAyarla({ providerUrl: 'http://127.0.0.1:9/v1', providerApiKey: 'gecici' });
    expect(config.getConfig().providerUrl).toBe('http://127.0.0.1:9/v1');
    expect(config.loadConfig().providerApiKey).toBe('gecici');
  });

  test('temizlenince disktekine dönülür', () => {
    const oncekiUrl = config.loadConfig({ hamDisk: true })?.providerUrl;
    config.calismaZamaniAyariniAyarla({ providerUrl: 'http://127.0.0.1:9/v1' });
    config.calismaZamaniAyariniAyarla(null);
    expect(config.getConfig().providerUrl).toBe(oncekiUrl);
  });

  test('hamDisk okuması üstü GÖRMEZ', () => {
    const oncekiUrl = config.loadConfig({ hamDisk: true })?.providerUrl;
    config.calismaZamaniAyariniAyarla({ providerUrl: 'http://127.0.0.1:9/v1' });
    expect(config.loadConfig({ hamDisk: true })?.providerUrl).toBe(oncekiUrl);
  });

  test('setConfigValue üstü DİSKE YAZMAZ — gizli anahtar sızmaz', () => {
    if (!fs.existsSync(AYAR)) return; // ayar yoksa bu senaryo geçerli değil
    config.calismaZamaniAyariniAyarla({
      providerUrl: 'http://127.0.0.1:54321/v1',
      providerApiKey: 'KOPRU-GIZLI-ANAHTARI',
    });
    config.setConfigValue('deneme_alani', 'x');

    const diskteki = fs.readFileSync(AYAR, 'utf8');
    expect(diskteki).not.toMatch(/KOPRU-GIZLI-ANAHTARI/);
    expect(diskteki).not.toMatch(/127\.0\.0\.1:54321/);
    // Asıl yazma yine de gerçekleşmeli.
    expect(JSON.parse(diskteki).deneme_alani).toBe('x');
  });

  test('üst yalnızca verilen alanları değiştirir', () => {
    const disk = config.loadConfig({ hamDisk: true }) || {};
    config.calismaZamaniAyariniAyarla({ providerUrl: 'http://127.0.0.1:9/v1' });
    const c = config.getConfig();
    expect(c.providerUrl).toBe('http://127.0.0.1:9/v1');
    if (disk.userName) expect(c.userName).toBe(disk.userName);
  });
});
