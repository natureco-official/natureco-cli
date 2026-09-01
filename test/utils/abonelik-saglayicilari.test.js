/**
 * Abonelik sağlayıcı kaydı — birden çok firmanın aboneliğini tespit eder.
 *
 * BU TESTLERİN VAR OLMA SEBEBİ (ölçülmüş bir hata):
 * Claude için ilk yazdığım tespit yalnızca `.credentials.json` dosyasının
 * varlığına bakıyordu. Gerçek bir makinede dosya duruyordu, `claudeAiOauth`
 * alanı da yerindeydi — ama erişim token'ı expiresAt=0 ve yenileme token'ı da
 * dolmuştu. `claude -p` çağrısı "OAuth session expired and could not be
 * refreshed" ile başarısız oluyordu. Yani tespit "kullanılabilir" diyor, çağrı
 * patlıyordu. Süre kontrolü bu yüzden var; testler de bu yüzden var.
 */
const fs = require('fs');
const { tumDurumlar, kullanilabilirler, komutVar, msyeCevir, SAGLAYICILAR } =
  require('../../src/utils/abonelik-saglayicilari');

const GUN = 86400000;
const varsay = () => { throw new Error('komut yok'); };
const kurulu = (surum) => () => surum;

/** Belirli bir dosya yolu için sahte içerik sunar; diğer yolları gerçek bırakır. */
function dosyaTaklit(esle, icerik) {
  const gercekVar = fs.existsSync;
  const gercekOku = fs.readFileSync;
  vi.spyOn(fs, 'existsSync').mockImplementation(p =>
    esle.test(String(p)) ? icerik !== null : gercekVar.call(fs, p));
  vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...r) =>
    esle.test(String(p)) ? icerik : gercekOku.call(fs, p, ...r));
}

const CLAUDE_YOL = /\.credentials\.json$/;
const CODEX_YOL = /auth\.json$/;

const claudeDurum = () => SAGLAYICILAR.claude.durum(kurulu('2.1.219 (Claude Code)'));

afterEach(() => vi.restoreAllMocks());

describe('Claude aboneliği — süre kontrolü', () => {
  test('yenileme token\'ı dolmuşsa KULLANILAMAZ (ölçülen gerçek durum)', () => {
    // Gerçek makinede okunan değerler: expiresAt=0, refreshTokenExpiresAt geçmişte.
    dosyaTaklit(CLAUDE_YOL, JSON.stringify({
      claudeAiOauth: { expiresAt: 0, refreshTokenExpiresAt: Date.now() - 14 * GUN, subscriptionType: 'pro' },
    }));
    const d = claudeDurum();
    expect(d.kullanilabilir).toBe(false);
    expect(d.sebep).toMatch(/süresi dolmuş/);
  });

  test('geçerli oturum kullanılabilir ve planı bildirir', () => {
    dosyaTaklit(CLAUDE_YOL, JSON.stringify({
      claudeAiOauth: { expiresAt: Date.now() + GUN, refreshTokenExpiresAt: Date.now() + 30 * GUN, subscriptionType: 'max' },
    }));
    const d = claudeDurum();
    expect(d.kullanilabilir).toBe(true);
    expect(d.plan).toBe('max');
  });

  test('erişim dolmuş ama yenileme geçerliyse kullanılabilir — CLI kendi yeniler', () => {
    dosyaTaklit(CLAUDE_YOL, JSON.stringify({
      claudeAiOauth: { expiresAt: Date.now() - 60000, refreshTokenExpiresAt: Date.now() + 30 * GUN },
    }));
    const d = claudeDurum();
    expect(d.kullanilabilir).toBe(true);
    expect(d.yenilemeGerek).toBe(true);
  });

  test('süre alanları hiç yoksa kullanılabilir SAYILMAZ', () => {
    // Sessizce "kullanılabilir" demek, kullanıcıyı patlayacak bir çağrıya yollar.
    dosyaTaklit(CLAUDE_YOL, JSON.stringify({ claudeAiOauth: { subscriptionType: 'pro' } }));
    expect(claudeDurum().kullanilabilir).toBe(false);
  });

  test('CLI kurulu değilse dosyaya hiç bakılmaz', () => {
    dosyaTaklit(CLAUDE_YOL, JSON.stringify({
      claudeAiOauth: { expiresAt: Date.now() + GUN, refreshTokenExpiresAt: Date.now() + GUN },
    }));
    const d = SAGLAYICILAR.claude.durum(varsay);
    expect(d.kullanilabilir).toBe(false);
    expect(d.sebep).toMatch(/kurulu değil/);
  });

  test('bozuk JSON çökertmez', () => {
    dosyaTaklit(CLAUDE_YOL, '{bozuk');
    expect(claudeDurum().kullanilabilir).toBe(false);
  });
});

describe('ChatGPT aboneliği', () => {
  test('API anahtarı kipi abonelik sayılmaz', () => {
    dosyaTaklit(CODEX_YOL, JSON.stringify({ auth_mode: 'apikey' }));
    const d = SAGLAYICILAR.codex.durum(kurulu('codex-cli 0.147.0'));
    expect(d.kullanilabilir).toBe(false);
    expect(d.sebep).toMatch(/API anahtarı kipinde/);
  });

  test('chatgpt kipi kullanılabilir', () => {
    dosyaTaklit(CODEX_YOL, JSON.stringify({ auth_mode: 'chatgpt' }));
    expect(SAGLAYICILAR.codex.durum(kurulu('codex-cli 0.147.0')).kullanilabilir).toBe(true);
  });
});

describe('kayıt bütünlüğü', () => {
  test('bir sağlayıcı çökerse diğerleri raporlanır', () => {
    const bozuk = { ...SAGLAYICILAR };
    vi.spyOn(SAGLAYICILAR.claude, 'durum').mockImplementation(() => { throw new Error('patladı'); });
    const d = tumDurumlar(varsay);
    expect(d.claude.kullanilabilir).toBe(false);
    expect(d.claude.sebep).toMatch(/patladı/);
    expect(d.codex).toBeDefined();
    expect(bozuk).toBeDefined();
  });

  test('her sağlayıcı kurulum ve giriş yönergesi taşır — çıkmaz sokak yok', () => {
    for (const [ad, d] of Object.entries(tumDurumlar(varsay))) {
      expect(typeof d.kurulum).toBe('string');
      expect(typeof d.giris).toBe('string');
      if (!d.kurulum.length) throw new Error(`${ad}: kurulum yönergesi boş`);
      if (!d.giris.length) throw new Error(`${ad}: giriş yönergesi boş`);
      if (!d.kullanilabilir && !d.sebep) throw new Error(`${ad}: sebep verilmemiş`);
    }
  });

  test('durum nesnesi token/sır SIZDIRMAZ', () => {
    dosyaTaklit(CLAUDE_YOL, JSON.stringify({
      claudeAiOauth: {
        accessToken: 'sk-ant-oat-GIZLI', refreshToken: 'sk-ant-ort-GIZLI',
        expiresAt: Date.now() + GUN, refreshTokenExpiresAt: Date.now() + GUN,
      },
    }));
    const metin = JSON.stringify(claudeDurum());
    expect(metin).not.toMatch(/GIZLI/);
    expect(metin).not.toMatch(/sk-ant/);
  });

  test('kullanilabilirler yalnızca gerçekten hazır olanları verir', () => {
    expect(kullanilabilirler(varsay)).toEqual([]);
  });
});

describe('yardımcılar', () => {
  test('komutVar sürümün ilk satırını alır', () => {
    expect(komutVar('x', () => '1.2.3\nekstra satır')).toEqual({ var: true, surum: '1.2.3' });
    expect(komutVar('x', varsay).var).toBe(false);
  });

  test('msyeCevir saniye ve milisaniyeyi ayırt eder', () => {
    expect(msyeCevir(1787334221)).toBe(1787334221000); // saniye
    expect(msyeCevir(1787334221553)).toBe(1787334221553); // zaten ms
    expect(msyeCevir(0)).toBeNull();
    expect(msyeCevir(undefined)).toBeNull();
  });
});
